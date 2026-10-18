// "Send log": the log goes to the developer, when the user says so.
//
// A button in Settings (and a card when Coucou notices trouble) posts the end of
// coucou.log to a private Discord channel through a webhook. Nothing is sent by
// itself: every send follows a click. Before it leaves, the text is cleaned of
// the user's name, their folders and anything that looks like an e-mail address.
//
// The webhook address is not in the source: the release workflow gives it to
// the compiler as COUCOU_LOG_WEBHOOK (a GitHub secret). Without it (every build
// made by hand) the feature is absent: no button, no card.

use std::sync::atomic::{AtomicI64, Ordering};

use tauri::AppHandle;

const WEBHOOK: Option<&str> = option_env!("COUCOU_LOG_WEBHOOK");
/// The hosts Discord has handed out webhook addresses on.
const WEBHOOK_HOSTS: [&str; 4] = ["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"];
/// The commit this build was made from (see updates.rs).
const BUILD_SHA: Option<&str> = option_env!("COUCOU_BUILD_SHA");
/// How much of the log goes along.
const LOG_LINES: usize = 400;
/// One send per this many seconds: a click-happy friend cannot flood the channel.
const MIN_GAP_SECS: i64 = 120;
/// The card offering to send the log, once per kind of trouble and run.
pub const SEND_TARGET: &str = "coucou:send-log";

static LAST_SENT: AtomicI64 = AtomicI64::new(0);
static APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

/// Called once at start: lets a panic anywhere offer the log.
pub fn remember(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

/// Writes a panic to the log (it used to vanish with the window) and offers the log.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        crate::log::line(format!("panic: {info}"));
        if let Some(app) = APP.get() {
            trouble(app, "panic", "Coucou ran into an unexpected problem");
        }
        previous(info);
    }));
}

/// A Discord webhook address: https, one of Discord's hosts, /api/webhooks/<id>/<token>.
fn webhook_ok(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let Some((host, path)) = rest.split_once('/') else { return false };
    WEBHOOK_HOSTS.contains(&host) && path.starts_with("api/webhooks/") && path.len() > "api/webhooks/".len() + 3
}

fn webhook() -> Option<&'static str> {
    WEBHOOK.map(str::trim).filter(|w| webhook_ok(w))
}

/// One line for the log saying whether this build can send a log, and if not
/// why: never the address itself (only its host, which is not a secret).
pub fn describe() -> String {
    match WEBHOOK.map(str::trim) {
        None => "off: this build was made without COUCOU_LOG_WEBHOOK".into(),
        Some("") => "off: COUCOU_LOG_WEBHOOK was empty when this build was made".into(),
        Some(w) if webhook_ok(w) => "on".into(),
        Some(w) => format!(
            "off: the webhook address is not a Discord one (starts with {:?}, {} characters)",
            w.chars().take(24).collect::<String>().split("/api").next().unwrap_or(""),
            w.len()
        ),
    }
}

/// Whether this build can send a log at all.
pub fn available() -> bool {
    webhook().is_some()
}

#[tauri::command]
pub fn log_report_available() -> bool {
    available()
}

/// Replaces what identifies the person: their user name and home folder (in both
/// slash styles), `\Users\<name>` / `/home/<name>` paths and e-mail addresses.
pub fn scrub(text: &str, user: &str, home: &str) -> String {
    let mut out = text.to_string();
    for h in [home.to_string(), home.replace('\\', "/"), home.replace('/', "\\")] {
        if h.len() > 3 {
            out = out.replace(&h, "<home>");
        }
    }
    // Paths of any user, not only this one.
    for marker in ["\\Users\\", "/Users/", "/home/"] {
        let mut cleaned = String::with_capacity(out.len());
        let mut rest = out.as_str();
        while let Some(at) = rest.find(marker) {
            cleaned.push_str(&rest[..at + marker.len()]);
            rest = &rest[at + marker.len()..];
            let end = rest.find(['\\', '/', '"', '\'', ' ', '\n', '\r']).unwrap_or(rest.len());
            // "Public", "Default" and the like are not a person.
            cleaned.push_str(if matches!(&rest[..end], "Public" | "Default" | "All Users") { &rest[..end] } else { "<user>" });
            rest = &rest[end..];
        }
        cleaned.push_str(rest);
        out = cleaned;
    }
    if user.chars().count() >= 3 {
        let lower = out.to_lowercase();
        let needle = user.to_lowercase();
        let mut cleaned = String::with_capacity(out.len());
        let mut last = 0;
        for (at, _) in lower.match_indices(&needle) {
            // Only where it stands alone: not inside a longer word.
            let before = lower[..at].chars().next_back();
            let after = lower[at + needle.len()..].chars().next();
            if before.is_some_and(char::is_alphanumeric) || after.is_some_and(char::is_alphanumeric) {
                continue;
            }
            cleaned.push_str(&out[last..at]);
            cleaned.push_str("<user>");
            last = at + needle.len();
        }
        cleaned.push_str(&out[last..]);
        out = cleaned;
    }
    out.split('\n')
        .map(|line| {
            line.split(' ')
                .map(|w| if w.contains('@') && w.contains('.') && !w.starts_with('@') { "<email>" } else { w })
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The last `n` lines of `text`.
fn tail(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

/// What goes in the attachment: a header with the facts that help, then the log.
fn report_text(header: &str, log: &str, user: &str, home: &str) -> String {
    scrub(&format!("{header}\n\n{}\n", tail(log, LOG_LINES)), user, home)
}

/// An id that tells one install from another without telling who it is.
fn install_id() -> String {
    let path = crate::platform::config_dir().join("install-id");
    if let Ok(id) = std::fs::read_to_string(&path) {
        if id.trim().len() >= 6 {
            return id.trim().to_string();
        }
    }
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_nanos()).unwrap_or(1);
    let id = format!("{:06x}", (nanos ^ std::process::id().wrapping_mul(2_654_435_761)) & 0xFF_FFFF);
    let _ = std::fs::write(&path, &id);
    id
}

fn header(app_version: &str) -> String {
    let s = crate::settings::load();
    format!(
        "Coucou {app_version}, build {}\n{} {} · install {}\nsettings: notifications={} autostart={} hooks={} pills={:?}",
        BUILD_SHA.map(|s| &s[..s.len().min(7)]).unwrap_or("local"),
        std::env::consts::OS,
        std::env::consts::ARCH,
        install_id(),
        s.show_notifications,
        s.autostart,
        s.hooks_installed,
        s.active_integrations,
    )
}

/// Sends the cleaned log; the answer is a short sentence for the user.
#[tauri::command]
pub async fn send_log(app: AppHandle) -> Result<String, String> {
    let Some(url) = webhook() else { return Err("This version cannot send a log.".into()) };
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let last = LAST_SENT.load(Ordering::Relaxed);
    if now - last < MIN_GAP_SECS {
        return Err("The log was just sent. Give it a couple of minutes.".into());
    }
    let log = std::fs::read_to_string(crate::settings::local_dir().join("coucou.log")).unwrap_or_default();
    let home = crate::platform::home_dir().to_string_lossy().to_string();
    let user = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_default();
    let version = app.package_info().version.to_string();
    let text = report_text(&header(&version), &log, &user, &home);
    let note = format!("Log from a Coucou install ({version}), {} lines", text.lines().count());
    let form = reqwest::multipart::Form::new()
        .text("payload_json", serde_json::json!({ "content": note }).to_string())
        .part(
            "files[0]",
            reqwest::multipart::Part::text(text).file_name("coucou-log.txt").mime_str("text/plain").map_err(|e| e.to_string())?,
        );
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
    let response = client.post(url).multipart(form).send().await.map_err(|_| "Could not reach the server.".to_string())?;
    if !response.status().is_success() {
        crate::log::line(format!("send log: the server answered {}", response.status()));
        return Err("The server did not accept the log.".into());
    }
    LAST_SENT.store(now, Ordering::Relaxed);
    crate::log::line("send log: sent".to_string());
    Ok("Log sent. Thank you!".into())
}

/// The card's button: sends the log and says how it went.
pub async fn send_and_announce(app: AppHandle) {
    let (summary, body) = match send_log(app.clone()).await {
        Ok(message) => ("Log sent", message),
        Err(why) => ("Log not sent", why),
    };
    #[cfg(any(target_os = "linux", windows))]
    crate::notifications::announce(
        &app,
        crate::notifications::Notice { app: "Coucou".into(), summary: summary.into(), body, target: None },
    );
    #[cfg(not(any(target_os = "linux", windows)))]
    let _ = (summary, body);
}

/// Something is not working: offers to send the log, once per kind and run. Only
/// builds that can send a log say so.
pub fn trouble(app: &AppHandle, kind: &'static str, what: &str) {
    use std::sync::Mutex;
    static TOLD: Mutex<Vec<&'static str>> = Mutex::new(Vec::new());
    if !available() {
        return;
    }
    {
        let mut told = TOLD.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if told.contains(&kind) {
            return;
        }
        told.push(kind);
    }
    // The page may not be listening yet (this can happen during start-up): wait.
    #[cfg(any(target_os = "linux", windows))]
    {
        let app = app.clone();
        let body: String = what.chars().take(120).collect();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(8)).await;
            crate::notifications::announce(
                &app,
                crate::notifications::Notice {
                    app: "Coucou".into(),
                    summary: "Something isn't working".into(),
                    body,
                    target: Some(SEND_TARGET.into()),
                },
            );
        });
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    let _ = (app, what);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_name_and_the_home_folder_are_gone() {
        let log = r"opened C:\Users\Jan de Vries\AppData\Local\Coucou\coucou.log for Jan
C:/Users/Jan de Vries/.claude/settings.json read by jan";
        let out = scrub(log, "Jan", r"C:\Users\Jan de Vries");
        assert!(!out.contains("Jan de Vries") && !out.to_lowercase().contains("jan"), "{out}");
        assert!(out.contains("<home>"), "{out}");
    }

    #[test]
    fn any_users_folder_is_cleaned_but_public_stays() {
        let out = scrub(r"a C:\Users\Anna\x b C:\Users\Public\y c /home/bob/z", "", "");
        assert_eq!(out, r"a C:\Users\<user>\x b C:\Users\Public\y c /home/<user>/z");
    }

    #[test]
    fn a_name_inside_a_longer_word_is_left_alone() {
        let out = scrub("Janitor Jan said Jane", "Jan", "");
        assert_eq!(out, "Janitor <user> said Jane");
    }

    #[test]
    fn emails_are_removed() {
        assert_eq!(scrub("mail anna@example.com now, @mention stays", "", ""), "mail <email> now, @mention stays");
    }

    #[test]
    fn only_the_end_of_a_long_log_goes() {
        let log = (1..=1000).map(|n| format!("line {n}")).collect::<Vec<_>>().join("\n");
        let t = tail(&log, 400);
        assert_eq!(t.lines().count(), 400);
        assert!(t.starts_with("line 601") && t.ends_with("line 1000"));
        assert_eq!(tail("a\nb", 400), "a\nb");
    }

    #[test]
    fn a_report_has_the_facts_then_the_cleaned_log() {
        let r = report_text("Coucou 1, build abc1234", "x C:\\Users\\Anna\\f", "Anna", "C:\\Users\\Anna");
        assert!(r.starts_with("Coucou 1, build abc1234"));
        assert!(!r.contains("Anna"));
    }

    #[test]
    fn only_discord_webhook_addresses_count() {
        assert!(webhook_ok("https://discord.com/api/webhooks/123456/abcDEF_-xyz"));
        assert!(webhook_ok("https://discordapp.com/api/webhooks/123456/abcDEF"));
        assert!(webhook_ok("https://canary.discord.com/api/webhooks/1/abcd"));
        assert!(!webhook_ok("http://discord.com/api/webhooks/123/abc"));
        assert!(!webhook_ok("https://evil.example/api/webhooks/123/abc"));
        assert!(!webhook_ok("https://discord.com/api/webhooks/"));
        assert!(!webhook_ok("https://discord.com.evil.example/api/webhooks/123/abc"));
        assert!(!webhook_ok(""));
    }

    #[test]
    fn a_build_without_the_secret_has_no_feature() {
        // Hand-made builds (and these tests) are made without COUCOU_LOG_WEBHOOK.
        if WEBHOOK.is_none() {
            assert!(!available());
        }
    }
}
