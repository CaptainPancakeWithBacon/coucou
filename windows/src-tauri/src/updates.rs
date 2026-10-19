// "A new version is out": for the builds the fork's release workflow makes.
//
// The workflow stamps the commit it built from into the program
// (COUCOU_BUILD_SHA) and publishes the installer as the "friends-latest"
// release, whose text carries a line "sha: <commit>". Once after start and every
// hour a thread reads that release (public, no login) and, when it names
// another commit than this build's, tells the island once per version. The card's
// button opens the release page: nothing is downloaded or installed by itself.
// A build without a stamp (anything made on a developer's machine) never looks.

use std::time::Duration;

use tauri::AppHandle;

/// The commit this build was made from; set by the release workflow only.
const BUILD_SHA: Option<&str> = option_env!("COUCOU_BUILD_SHA");
const RELEASE_API: &str = "https://api.github.com/repos/CaptainPancakeWithBacon/coucou/releases/tags/friends-latest";
/// Where the card's button leads (see `notifications::open_target`).
pub const RELEASE_PAGE: &str = "https://github.com/CaptainPancakeWithBacon/coucou/releases/tag/friends-latest";
/// The update card's button: downloads the new setup and installs it (Windows), else opens the release page.
pub const INSTALL_TARGET: &str = "coucou:install-update";
/// The card shown after an update: opens the "What's changed?" page.
pub const WHATS_NEW_TARGET: &str = "coucou:whats-new";
#[cfg(windows)]
const SETUP_ASSET: &str = "Coucou-Windows-setup.exe";
#[cfg(windows)]
const ASSET_PREFIX: &str = "https://github.com/CaptainPancakeWithBacon/coucou/releases/download/";
const FIRST_LOOK: Duration = Duration::from_secs(90);
const EVERY: Duration = Duration::from_secs(3600);

/// The commit a release says it was built from: a line `sha: <hex>` in its text.
fn sha_of(body: &str) -> Option<String> {
    body.lines().find_map(|line| {
        let hex = line.trim().strip_prefix("sha:")?.trim();
        (hex.len() >= 7 && hex.chars().all(|c| c.is_ascii_hexdigit())).then(|| hex.to_ascii_lowercase())
    })
}

/// What the release is about, for the card: its first line that is not the sha.
fn headline_of(body: &str) -> String {
    let line = body
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with("sha:"))
        .unwrap_or("A new version is ready to download");
    line.chars().take(140).collect()
}

/// Another commit than this build's (either may be written short).
fn is_other_commit(mine: &str, release: &str) -> bool {
    let (mine, release) = (mine.to_ascii_lowercase(), release.to_ascii_lowercase());
    !mine.is_empty() && !release.is_empty() && !release.starts_with(&mine) && !mine.starts_with(&release)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

/// The marker file says "<sha> <seconds>": was this version announced in the last day?
/// (An older marker holding only the sha counts as long ago.)
fn told_recently(told: &str, sha: &str, now: u64) -> bool {
    let mut parts = told.split_whitespace();
    let (Some(was), at) = (parts.next(), parts.next().and_then(|s| s.parse::<u64>().ok())) else { return false };
    was == sha && at.is_some_and(|t| now.saturating_sub(t) < 24 * 3600)
}

fn told_path() -> std::path::PathBuf {
    crate::platform::config_dir().join("update-told")
}

pub fn start(app: AppHandle) {
    let Some(mine) = BUILD_SHA.map(str::trim).filter(|s| !s.is_empty()) else { return };
    whats_new_card(&app, mine);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_LOOK).await;
        loop {
            if !crate::integrations::PAUSED.load(std::sync::atomic::Ordering::Relaxed) {
                if let Err(err) = look(&app, mine).await {
                    crate::log::line(format!("update check: {err}"));
                }
            }
            tokio::time::sleep(EVERY).await;
        }
    });
}

/// The release's commit and headline when it is another one than `mine`.
async fn newer(mine: &str) -> Result<Option<(String, String)>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("coucou-update-check")
        .build()
        .map_err(|e| e.to_string())?;
    let release: serde_json::Value = client
        .get(RELEASE_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let body = release.get("body").and_then(|b| b.as_str()).unwrap_or_default();
    Ok(sha_of(body).filter(|theirs| is_other_commit(mine, theirs)).map(|theirs| (theirs, headline_of(body))))
}

fn announce_update(app: &AppHandle, headline: String) {
    crate::notifications::announce(
        app,
        crate::notifications::Notice {
            app: "Coucou".into(),
            summary: "Update available".into(),
            body: headline,
            // Windows installs it by itself; elsewhere the release page opens.
            target: Some(if cfg!(windows) { INSTALL_TARGET } else { RELEASE_PAGE }.into()),
        },
    );
}

fn last_run_path() -> std::path::PathBuf {
    crate::platform::config_dir().join("last-run-sha")
}

/// Is this start the first after an update? `last` is the commit of the previous
/// start; with none on file (the build that brought this feature) it counts when
/// Coucou was set up more than two minutes ago, so a fresh install says nothing.
fn follows_an_update(last: Option<&str>, mine: &str, setup_age_secs: Option<u64>) -> bool {
    match last.map(str::trim).filter(|l| !l.is_empty()) {
        Some(last) => is_other_commit(mine, last),
        None => setup_age_secs.is_some_and(|age| age > 120),
    }
}

/// After an update the island says so, with a button to "What's changed?".
fn whats_new_card(app: &AppHandle, mine: &str) {
    let last = std::fs::read_to_string(last_run_path()).ok();
    let _ = std::fs::write(last_run_path(), mine);
    let age = std::fs::metadata(crate::settings::setup_marker())
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .map(|d| d.as_secs());
    if !follows_an_update(last.as_deref(), mine, age) {
        return;
    }
    crate::log::line("update: this is the first start after an update".to_string());
    let app = app.clone();
    std::thread::spawn(move || {
        // After the island is up, so the card is seen.
        std::thread::sleep(Duration::from_secs(12));
        crate::notifications::announce(
            &app,
            crate::notifications::Notice {
                app: "Coucou".into(),
                summary: "Coucou is updated".into(),
                body: "See what is new in this version.".into(),
                target: Some(WHATS_NEW_TARGET.into()),
            },
        );
    });
}

/// "Update now" (Windows): downloads the release's setup, tells the island, and
/// hands over to a helper that installs it silently once this program has quit
/// and then starts the new one.
#[cfg(windows)]
pub async fn install(app: AppHandle) {
    let say = |summary: &str, body: &str, target: Option<&str>| {
        crate::notifications::announce(
            &app,
            crate::notifications::Notice {
                app: "Coucou".into(),
                summary: summary.into(),
                body: body.into(),
                target: target.map(str::to_string),
            },
        )
    };
    say("Updating Coucou", "It restarts by itself in a moment.", None);
    let result = match fetch_setup().await {
        Ok(path) => launch_helper(&path),
        Err(err) => Err(err),
    };
    match result {
        Ok(()) => {
            crate::log::line("update: installing, Coucou quits and restarts".to_string());
            tokio::time::sleep(Duration::from_millis(1200)).await;
            app.exit(0);
        }
        Err(err) => {
            crate::log::line(format!("update: {err}"));
            say("The update did not work", "Download it by hand.", Some(RELEASE_PAGE));
        }
    }
}

/// The setup of the friends-latest release, in the temp folder. Only this
/// repository's own release assets are taken, whole, and only a program.
#[cfg(windows)]
async fn fetch_setup() -> Result<std::path::PathBuf, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .user_agent("coucou-update")
        .build()
        .map_err(|e| e.to_string())?;
    let release: serde_json::Value = client
        .get(RELEASE_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let asset = release
        .get("assets")
        .and_then(|a| a.as_array())
        .and_then(|a| a.iter().find(|x| x.get("name").and_then(|n| n.as_str()) == Some(SETUP_ASSET)))
        .ok_or("the release has no setup")?;
    let url = asset.get("browser_download_url").and_then(|u| u.as_str()).unwrap_or_default();
    if !url.starts_with(ASSET_PREFIX) {
        return Err(format!("unexpected download address {url}"));
    }
    let size = asset.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
    if size == 0 || size > 200 * 1024 * 1024 {
        return Err(format!("unexpected size {size}"));
    }
    let bytes = client
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 != size || !bytes.starts_with(b"MZ") {
        return Err(format!("the download is not the setup ({} of {size} bytes)", bytes.len()));
    }
    let dir = std::env::temp_dir().join("CoucouUpdate");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(SETUP_ASSET);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

/// A detached `cmd` that waits a moment, stops what is still running, installs
/// silently and starts Coucou again. The paths come off this machine, never off
/// the network, and Windows paths cannot hold a quote.
#[cfg(windows)]
fn launch_helper(setup: &std::path::Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let (setup, exe) = (setup.display().to_string(), exe.display().to_string());
    if setup.contains('"') || exe.contains('"') {
        return Err("a path with a quote".into());
    }
    let inner = format!(
        r#"ping -n 3 127.0.0.1 >nul & taskkill /f /im coucou-hook.exe >nul 2>&1 & taskkill /f /im coucou.exe >nul 2>&1 & "{setup}" /S & start "" "{exe}""#
    );
    // CREATE_NO_WINDOW | DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    std::process::Command::new("cmd")
        .raw_arg(format!(r#"/C "{inner}""#))
        .creation_flags(0x0800_0000 | 0x0000_0008 | 0x0000_0200)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

async fn look(app: &AppHandle, mine: &str) -> Result<(), String> {
    let Some((theirs, headline)) = newer(mine).await? else { return Ok(()) };
    // Once a day per version: a friend who was away from the screen sees it
    // later, and one who does not update is not nagged every hour.
    if std::fs::read_to_string(told_path()).is_ok_and(|told| told_recently(&told, &theirs, now_secs())) {
        return Ok(());
    }
    let _ = std::fs::write(told_path(), format!("{theirs} {}", now_secs()));
    crate::log::line(format!("update check: {theirs} is out, this build is {mine}"));
    announce_update(app, headline);
    Ok(())
}

/// Settings' "Check for updates": "current", "available" (the card shows again,
/// told before or not), "unstamped" (a build the release workflow did not make)
/// or "failed".
pub async fn check_for_updates(app: AppHandle) -> String {
    let Some(mine) = BUILD_SHA.map(str::trim).filter(|s| !s.is_empty()) else { return "unstamped".into() };
    match newer(mine).await {
        Ok(Some((theirs, headline))) => {
            let _ = std::fs::write(told_path(), format!("{theirs} {}", now_secs()));
            announce_update(&app, headline);
            "available".into()
        }
        Ok(None) => "current".into(),
        Err(err) => {
            crate::log::line(format!("update check: {err}"));
            "failed".into()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_release_names_its_commit() {
        assert_eq!(sha_of("Fixes the notifications\n\nsha: 0AbC123def\n").as_deref(), Some("0abc123def"));
        assert_eq!(sha_of("no commit named here"), None);
        assert_eq!(sha_of("sha: not-hex"), None);
    }

    #[test]
    fn the_card_says_what_changed() {
        assert_eq!(headline_of("sha: abc1234\n\nFixes the notifications\nmore"), "Fixes the notifications");
        assert_eq!(headline_of("sha: abc1234"), "A new version is ready to download");
        assert_eq!(headline_of(&"x".repeat(300)).chars().count(), 140);
    }

    #[test]
    fn a_version_is_announced_once_a_day() {
        assert!(told_recently("abc1234 1000", "abc1234", 1000 + 3600));
        assert!(!told_recently("abc1234 1000", "abc1234", 1000 + 25 * 3600));
        assert!(!told_recently("abc1234 1000", "def5678", 1100));
        assert!(!told_recently("abc1234", "abc1234", 1100), "an old marker without a time");
        assert!(!told_recently("", "abc1234", 1100));
    }

    #[test]
    fn the_first_start_after_an_update_says_so() {
        assert!(follows_an_update(Some("abc1234\n"), "def5678", Some(5)));
        assert!(!follows_an_update(Some("abc1234"), "abc1234def", Some(5)));
        // No record: an old install counts, a fresh one (set up a minute ago) does not.
        assert!(follows_an_update(None, "def5678", Some(3600)));
        assert!(!follows_an_update(None, "def5678", Some(60)));
        assert!(!follows_an_update(Some(""), "def5678", None));
    }

    #[test]
    fn only_another_commit_counts() {
        assert!(is_other_commit("abc1234def", "ffff111"));
        assert!(!is_other_commit("abc1234def", "abc1234"));
        assert!(!is_other_commit("abc1234", "abc1234def"));
        assert!(!is_other_commit("", "abc1234"));
    }
}
