// Desktop notifications in the island (Linux and Windows).
//
// The island shows every notification as a "Notifications" pill. Off by
// default ("Notifications in the island" in Settings); nothing is stored or
// sent anywhere: a notification is read in memory and handed to the island as
// one event.
//
// Linux: a desktop's notification service owns `org.freedesktop.Notifications`
// and GNOME's cannot be replaced, so Coucou does not take that name: it becomes
// a monitor of the session bus (`BecomeMonitor`, which only ever receives
// copies) and reads every `Notify` call. The desktop's own banners are switched
// off with `org.gnome.desktop.notifications show-banners` (the list in the
// calendar still fills).
//
// Windows: the API that lists other apps' notifications (UserNotificationListener)
// wants an app with a package identity, which an installer does not give. The
// notification centre keeps what it shows in a SQLite file in the user's own
// folder, `wpndatabase.db`; a thread reads the rows that are new, every 2 s.
// Windows' own banners stay as they are.

// The toast parsing below is only reached from the Windows reader and the tests.
#![cfg_attr(not(windows), allow(dead_code))]

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Our own notifications are not news.
const IGNORED_APPS: [&str; 1] = ["coucou"];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub app: String,
    pub summary: String,
    pub body: String,
    /// What opens the app that sent it: its desktop entry (Linux) or its
    /// application id (Windows). `None` when the sender did not say.
    pub target: Option<String>,
}

fn clean(app: &str, summary: &str, body: &str, target: Option<String>) -> Option<Notice> {
    let app = app.trim();
    if IGNORED_APPS.contains(&app.to_lowercase().as_str()) {
        return None;
    }
    let summary = strip_markup(summary);
    let body = strip_markup(body);
    if summary.is_empty() && body.is_empty() {
        return None;
    }
    Some(Notice { app: app.to_string(), summary, body, target })
}

/// Notification bodies may carry a little HTML (`<b>`, `<a href>`, `&amp;`).
fn strip_markup(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_tag = false;
    for c in text.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .trim()
        .chars()
        .take(300)
        .collect()
}

/// The texts of a Windows toast payload, in order: `<text>Title</text><text>Body</text>`.
fn toast_texts(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(at) = rest.find("<text") {
        rest = &rest[at + 5..];
        // `<textbox>` and the like are not texts.
        if !rest.starts_with([' ', '>', '/', '\t', '\r', '\n']) {
            continue;
        }
        let Some(tag_end) = rest.find('>') else { break };
        if rest[..tag_end].ends_with('/') {
            rest = &rest[tag_end + 1..];
            continue;
        }
        let content = &rest[tag_end + 1..];
        let Some(close) = content.find("</text>") else { break };
        let text = strip_markup(&content[..close]);
        if !text.is_empty() {
            out.push(text);
        }
        rest = &content[close + 7..];
    }
    out
}

/// A payload column: UTF-8, or UTF-16 with or without a byte order mark.
fn payload_string(bytes: &[u8]) -> String {
    let utf16 = bytes.starts_with(&[0xFF, 0xFE]) || (bytes.len() > 3 && bytes[1] == 0 && bytes[3] == 0);
    if utf16 {
        let start = if bytes.starts_with(&[0xFF, 0xFE]) { 2 } else { 0 };
        let units: Vec<u16> = bytes[start..].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

/// "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App", "com.squirrel.claude.Claude" or
/// "chrome.exe" → "WindowsTerminal", "Claude", "chrome".
fn app_name_of(primary_id: &str) -> String {
    // A classic app's id can be its path: "{GUID}\\WindowsPowerShell\\v1.0\\powershell.exe".
    let id = primary_id.rsplit(['\\', '/']).next().unwrap_or(primary_id);
    let id = id.split('!').next().unwrap_or(id);
    let id = id.split('_').next().unwrap_or(id);
    let id = id.strip_suffix(".exe").or_else(|| id.strip_suffix(".EXE")).unwrap_or(id);
    id.rsplit('.').next().unwrap_or(id).to_string()
}

/// A row of the notification centre's database as a notice.
fn notice_of_toast(primary_id: &str, payload: &[u8]) -> Option<Notice> {
    let texts = toast_texts(&payload_string(payload));
    let mut texts = texts.into_iter();
    let summary = texts.next()?;
    let body = texts.collect::<Vec<_>>().join(" ");
    let target = Some(primary_id.trim().to_string()).filter(|t| !t.is_empty());
    clean(&app_name_of(primary_id), &summary, &body, target)
}

/// Opens (or brings forward) the app a notification came from. The id came off
/// the bus or out of a database, so it only ever goes to a launcher as one
/// argument, never through a shell, and only when it looks like an id.
pub fn open_target(target: &str) -> bool {
    let target = target.trim();
    if target.is_empty() || target.len() > 260 || target.starts_with('-') || target.chars().any(char::is_control) {
        return false;
    }
    // The update card: the fork's release page, in the browser.
    if target == crate::updates::RELEASE_PAGE {
        crate::platform::open_url(target);
        return true;
    }
    #[cfg(target_os = "linux")]
    {
        use std::process::{Command, Stdio};
        if !target.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')) {
            return false;
        }
        return Command::new("gtk-launch")
            .arg(target)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success());
    }
    #[cfg(windows)]
    {
        if target.contains('"') {
            return false;
        }
        let mut cmd = std::process::Command::new("explorer.exe");
        cmd.arg(format!(r"shell:AppsFolder\{target}"));
        // explorer answers 1 even when it did start something: spawning is the check.
        return crate::platform::no_console(&mut cmd).spawn().is_ok();
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    false
}

/// Starts the listener thread (one per system); it only ever receives.
pub fn start(app: AppHandle) {
    #[cfg(target_os = "linux")]
    linux::start(app);
    #[cfg(windows)]
    win::start(app);
    #[cfg(not(any(target_os = "linux", windows)))]
    let _ = app;
}

fn enabled(app: &AppHandle) -> bool {
    app.try_state::<crate::Shared>().is_some_and(|s| s.settings.lock().map(|g| g.show_notifications).unwrap_or(false))
}

/// A notice Coucou itself has (an update): shown whatever the mirroring setting says.
pub fn announce(app: &AppHandle, notice: Notice) {
    deliver(app, notice);
}

/// Names of the apps that notified since Coucou started, for Settings to list.
static SEEN: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

/// The name an app is muted under: its own, except Phone Link, whose toasts all
/// come from "YourPhone" and carry the phone app's name as their title.
fn mute_key(app: &str, summary: &str) -> String {
    if app.eq_ignore_ascii_case("YourPhone") && !summary.trim().is_empty() {
        format!("YourPhone › {}", summary.trim())
    } else {
        app.to_string()
    }
}

/// Whether `key` is on the muted list (names compare without regard to case);
/// muting "YourPhone" itself mutes every phone app.
fn is_muted(muted: &[String], key: &str) -> bool {
    let whole = key.split(" › ").next().unwrap_or(key);
    muted.iter().any(|m| m.eq_ignore_ascii_case(key) || m.eq_ignore_ascii_case(whole))
}

/// Adds a key to the list Settings shows.
fn remember(key: String) {
    if let Ok(mut seen) = SEEN.lock() {
        if !seen.iter().any(|a| a.eq_ignore_ascii_case(&key)) {
            seen.push(key);
        }
    }
}

fn deliver(app: &AppHandle, notice: Notice) {
    use tauri::Emitter;
    // Coucou's own notices (an update, a trouble card) are never muted.
    if notice.app != "Coucou" && !notice.app.is_empty() {
        let key = mute_key(&notice.app, &notice.summary);
        remember(key.clone());
        let muted = app
            .try_state::<crate::Shared>()
            .and_then(|s| s.settings.lock().ok().map(|g| is_muted(&g.muted_notification_apps, &key)));
        if muted == Some(true) {
            crate::log::line(format!("notification from {key} muted"));
            return;
        }
    }
    let _ = app.emit("desktop-notification", notice);
}

/// Every app that has notified this session plus the muted ones, A to Z.
pub fn apps(muted: &[String]) -> Vec<String> {
    let mut all: Vec<String> = SEEN.lock().map(|s| s.clone()).unwrap_or_default();
    for m in muted {
        if !all.iter().any(|a| a.eq_ignore_ascii_case(m)) {
            all.push(m.clone());
        }
    }
    all.sort_by_key(|a| a.to_lowercase());
    all
}

// ── Linux: the session bus ────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
mod linux {
    use super::*;
    use std::time::Duration;

    use dbus::channel::{BusType, Channel};
    use dbus::message::MessageType;
    use dbus::Message;

    const RULE: &str = "type='method_call',interface='org.freedesktop.Notifications',member='Notify'";

    /// The first five arguments of a `Notify` call, as a notice; `None` for what
    /// the island should not show (empty, or from an ignored app).
    pub(super) fn notice_of(msg: &Message) -> Option<Notice> {
        if msg.msg_type() != MessageType::MethodCall || &*msg.member()? != "Notify" {
            return None;
        }
        let mut args = msg.iter_init();
        let app: &str = args.read().ok()?;
        let _replaces: u32 = args.read().ok()?;
        let _icon: &str = args.read().ok()?;
        let summary: &str = args.read().ok()?;
        let body: &str = args.read().ok()?;
        let _actions: Vec<&str> = args.read().ok()?;
        let hints: dbus::arg::PropMap = args.read().ok()?;
        // The sender's desktop file name when it gives one, else its name.
        let target = hints
            .get("desktop-entry")
            .and_then(|v| v.0.as_str())
            .map(str::to_string)
            .or_else(|| Some(app.to_lowercase()))
            .filter(|t| !t.is_empty());
        clean(app, summary, body, target)
    }

    /// Waits quietly on the bus and costs nothing while no notification arrives.
    /// Reconnects if the bus goes away.
    pub fn start(app: AppHandle) {
        std::thread::Builder::new()
            .name("notifications".into())
            .spawn(move || loop {
                if let Err(e) = listen(&app) {
                    crate::log::line(format!("notifications: {e}"));
                }
                std::thread::sleep(Duration::from_secs(30));
            })
            .ok();
    }

    fn listen(app: &AppHandle) -> Result<(), String> {
        let mut channel = Channel::get_private(BusType::Session).map_err(|e| format!("session bus: {e}"))?;
        let call = Message::new_method_call(
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            "org.freedesktop.DBus.Monitoring",
            "BecomeMonitor",
        )
        .map_err(|e| e.to_string())?
        .append2(vec![RULE], 0u32);
        channel
            .send_with_reply_and_block(call, Duration::from_secs(5))
            .map_err(|e| format!("BecomeMonitor: {e}"))?;
        channel.set_watch_enabled(false);
        loop {
            match channel.blocking_pop_message(Duration::from_secs(3600)) {
                Ok(Some(msg)) => {
                    if !enabled(app) {
                        continue;
                    }
                    if let Some(notice) = notice_of(&msg) {
                        deliver(app, notice);
                    }
                }
                Ok(None) => {}
                Err(e) => return Err(e.to_string()),
            }
        }
    }
}

// ── Which rows are new (pure: the Windows reader below, tested everywhere) ─────

/// How far back a poll looks again: a toast committed a moment after a later one
/// still carries the earlier timestamp. 3 s, in Windows' 100 ns ticks.
const LOOKBACK: i64 = 30_000_000;
/// A week, in the 100 ns ticks of ArrivalTime.
#[cfg(windows)]
const WEEK: i64 = 7 * 24 * 3600 * 10_000_000;

/// What the Windows reader has already handed over. A row's number can come back
/// (the database reuses it when a replaced toast was the newest), so rows are
/// told apart by id and arrival time, and "new" is by arrival time, which only
/// grows. A toast replaced under the same tag arrives again and is shown again.
#[derive(Default)]
struct Watch {
    newest: Option<i64>,
    seen: std::collections::VecDeque<(i64, i64)>,
}

impl Watch {
    /// Where to look from: a little before the newest arrival.
    fn since(&self) -> Option<i64> {
        self.newest.map(|n| n.saturating_sub(LOOKBACK))
    }

    /// True the first time a row is offered; false for one already handed over.
    fn take(&mut self, id: i64, arrival: i64) -> bool {
        if self.seen.contains(&(id, arrival)) {
            return false;
        }
        if self.seen.len() >= 512 {
            self.seen.pop_front();
        }
        self.seen.push_back((id, arrival));
        self.newest = Some(self.newest.map_or(arrival, |n| n.max(arrival)));
        true
    }

    /// The first look: what is there now is not news.
    fn start_from(&mut self, newest: i64, rows: &[(i64, i64)]) {
        for &(id, arrival) in rows {
            self.take(id, arrival);
        }
        self.newest = Some(self.newest.map_or(newest, |n| n.max(newest)));
    }
}

// ── Windows: the notification centre's database ───────────────────────────────

#[cfg(windows)]
mod win {
    use super::*;
    use rusqlite::types::ValueRef;
    use rusqlite::{Connection, OpenFlags};
    use std::path::{Path, PathBuf};
    use std::time::Duration;

    fn db_path() -> Option<PathBuf> {
        let base = std::env::var_os("LOCALAPPDATA")?;
        Some(PathBuf::from(base).join(r"Microsoft\Windows\Notifications\wpndatabase.db"))
    }

    fn open_direct(path: &Path) -> Result<Connection, String> {
        let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
            .map_err(|e| e.to_string())?;
        let _ = conn.busy_timeout(Duration::from_millis(500));
        // A cheap read, so a locked or odd file fails here and not later.
        conn.query_row("SELECT COUNT(*) FROM Notification", [], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())?;
        Ok(conn)
    }

    /// The file may be locked while the system writes: a copy of it and its
    /// write-ahead log is read instead.
    fn open_copy(path: &Path) -> Result<Connection, String> {
        let dir = std::env::temp_dir().join("coucou-wpn");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let target = dir.join("wpndatabase.db");
        std::fs::copy(path, &target).map_err(|e| format!("copy: {e}"))?;
        for ext in ["-wal", "-shm"] {
            let from = PathBuf::from(format!("{}{ext}", path.display()));
            let to = PathBuf::from(format!("{}{ext}", target.display()));
            if from.exists() {
                let _ = std::fs::copy(&from, &to);
            } else {
                let _ = std::fs::remove_file(&to);
            }
        }
        open_direct(&target)
    }

    fn open(path: &Path) -> Result<Connection, String> {
        open_direct(path).or_else(|_| open_copy(path))
    }

    struct Row {
        id: i64,
        arrival: i64,
        app: String,
        payload: Vec<u8>,
    }

    fn bytes_of(value: ValueRef) -> Vec<u8> {
        match value {
            ValueRef::Blob(b) | ValueRef::Text(b) => b.to_vec(),
            _ => Vec::new(),
        }
    }

    /// The rows that arrived after `since`, with the app each belongs to (the
    /// handler's id).
    fn rows_since(conn: &Connection, since: i64) -> Result<Vec<Row>, String> {
        let joined = "SELECT n.Id, n.ArrivalTime, COALESCE(h.PrimaryId, ''), n.Payload FROM Notification n LEFT JOIN NotificationHandler h ON n.HandlerId = h.RecordId WHERE n.ArrivalTime > ?1 ORDER BY n.ArrivalTime";
        let plain = "SELECT Id, ArrivalTime, '', Payload FROM Notification WHERE ArrivalTime > ?1 ORDER BY ArrivalTime";
        for sql in [joined, plain] {
            let Ok(mut stmt) = conn.prepare(sql) else { continue };
            let rows = stmt
                .query_map([since], |r| {
                    Ok(Row { id: r.get(0)?, arrival: r.get(1)?, app: r.get(2)?, payload: bytes_of(r.get_ref(3)?) })
                })
                .map_err(|e| e.to_string())?;
            return rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string());
        }
        Err("no readable Notification table".into())
    }

    /// New notices since the last look; the first call only marks where the database stands.
    fn poll(watch: &mut Watch) -> Result<Vec<Notice>, String> {
        let Some(path) = db_path().filter(|p| p.exists()) else { return Ok(Vec::new()) };
        let conn = open(&path)?;
        let Some(since) = watch.since() else {
            let newest: i64 = conn
                .query_row("SELECT COALESCE(MAX(ArrivalTime), 0) FROM Notification", [], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            let recent: Vec<(i64, i64)> =
                rows_since(&conn, newest.saturating_sub(LOOKBACK))?.iter().map(|r| (r.id, r.arrival)).collect();
            watch.start_from(newest, &recent);
            // The apps of the last week, so Settings can list them before they notify again.
            for row in rows_since(&conn, newest.saturating_sub(WEEK))? {
                if let Some(n) = notice_of_toast(&row.app, &row.payload) {
                    remember(mute_key(&n.app, &n.summary));
                }
            }
            let names = apps(&[]);
            crate::log::line(format!("notifications: {} apps in the last week: {}", names.len(), names.join(", ")));
            crate::log::line(format!("notifications: watching {} ({} recent there now)", path.display(), recent.len()));
            return Ok(Vec::new());
        };
        // Which app each notification came from goes in the log (never its text),
        // so "Claude's notifications do not show" can be told from "Windows never
        // handed them over".
        let mut notices = Vec::new();
        for row in rows_since(&conn, since)? {
            if !watch.take(row.id, row.arrival) {
                continue;
            }
            match notice_of_toast(&row.app, &row.payload) {
                Some(notice) => {
                    crate::log::line(format!("notification from {}", notice.app));
                    notices.push(notice);
                }
                None => crate::log::line(format!("notification from {:?} had no text to show", app_name_of(&row.app))),
            }
        }
        Ok(notices)
    }

    pub fn start(app: AppHandle) {
        std::thread::Builder::new()
            .name("notifications".into())
            .spawn(move || {
                let mut watch = Watch::default();
                let mut complained = false;
                loop {
                    std::thread::sleep(Duration::from_secs(2));
                    if !enabled(&app) || crate::integrations::PAUSED.load(std::sync::atomic::Ordering::Relaxed) {
                        // Turned on again later: start from what is there then.
                        watch = Watch::default();
                        continue;
                    }
                    match poll(&mut watch) {
                        Ok(notices) => {
                            complained = false;
                            for notice in notices {
                                deliver(&app, notice);
                            }
                        }
                        Err(e) if !complained => {
                            complained = true;
                            crate::log::line(format!("notifications: {e}"));
                            crate::report::trouble(&app, "notifications", "Windows' notifications cannot be read");
                        }
                        Err(_) => {}
                    }
                }
            })
            .ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn muting_ignores_case_and_the_list_joins_seen_and_muted_apps() {
        let muted = vec!["Discord".to_string()];
        assert!(is_muted(&muted, "discord"));
        assert_eq!(mute_key("YourPhone", " Snapchat "), "YourPhone › Snapchat");
        assert_eq!(mute_key("Discord", "Anna"), "Discord");
        assert!(is_muted(&["YourPhone › Snapchat".to_string()], "YourPhone › snapchat"));
        assert!(!is_muted(&["YourPhone › Snapchat".to_string()], "YourPhone › Mail"));
        assert!(is_muted(&["YourPhone".to_string()], "YourPhone › Mail"));
        assert!(!is_muted(&muted, "Slack"));
        assert!(apps(&muted).iter().any(|a| a == "Discord"));
    }

    #[test]
    fn a_row_is_handed_over_once_and_what_was_there_at_the_start_is_not_news() {
        let mut w = Watch::default();
        assert_eq!(w.since(), None);
        w.start_from(1_000_000_000, &[(7, 1_000_000_000)]);
        assert!(!w.take(7, 1_000_000_000), "the newest row at the start is not new");
        assert!(w.take(8, 1_000_000_100));
        assert!(!w.take(8, 1_000_000_100), "never twice");
        assert!(w.since().unwrap() < 1_000_000_100);
    }

    #[test]
    fn a_replaced_toast_comes_again_even_when_its_row_number_is_reused() {
        let mut w = Watch::default();
        w.start_from(100, &[]);
        assert!(w.take(5, 200));
        // Same tag again: the database may give it the same id, but it arrived later.
        assert!(w.take(5, 400));
        assert!(w.take(5, 600));
    }

    #[test]
    fn a_toast_committed_late_is_still_seen_inside_the_lookback() {
        let mut w = Watch::default();
        w.start_from(100, &[]);
        assert!(w.take(2, 2 * LOOKBACK));
        // Stamped earlier than one already handed over, written a moment later.
        assert!(w.take(1, 2 * LOOKBACK - 1000));
        assert!(w.since().unwrap() <= 2 * LOOKBACK - 1000);
    }

    #[test]
    fn a_target_that_is_not_an_id_is_not_launched() {
        assert!(!open_target(""));
        assert!(!open_target("--help"));
        assert!(!open_target("a\nb"));
        assert!(!open_target(&"x".repeat(300)));
    }

    #[test]
    fn markup_is_stripped_and_entities_read() {
        assert_eq!(strip_markup("<b>Anna</b> &amp; Bo: <a href=\"x\">hi</a>"), "Anna & Bo: hi");
        assert_eq!(strip_markup("  plain  "), "plain");
    }

    #[test]
    fn long_text_is_cut() {
        assert_eq!(strip_markup(&"é".repeat(500)).chars().count(), 300);
    }

    #[test]
    fn empty_and_own_notifications_are_dropped() {
        assert_eq!(clean("Discord", "", "  ", None), None);
        assert_eq!(clean("Coucou", "Done", "", None), None);
        assert_eq!(
            clean("Discord", "Anna", "hey!", None),
            Some(Notice { app: "Discord".into(), summary: "Anna".into(), body: "hey!".into(), target: None })
        );
    }

    #[test]
    fn a_toast_gives_its_texts_in_order() {
        let xml = r#"<toast launch="x"><visual><binding template="ToastGeneric"><image src="a.png"/><text>Claude</text><text hint-maxLines="2">Your chat is &amp; done</text><textbox id="q"/></binding></visual></toast>"#;
        assert_eq!(toast_texts(xml), vec!["Claude", "Your chat is & done"]);
        assert_eq!(toast_texts("<toast/>"), Vec::<String>::new());
    }

    #[test]
    fn a_payload_may_be_utf8_or_utf16() {
        let xml = "<toast><text>Héllo</text></toast>";
        assert_eq!(payload_string(xml.as_bytes()), xml);
        let mut utf16 = vec![0xFF, 0xFE];
        utf16.extend(xml.encode_utf16().flat_map(|u| u.to_le_bytes()));
        assert_eq!(payload_string(&utf16), xml);
        let bare: Vec<u8> = xml.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        assert_eq!(payload_string(&bare), xml);
    }

    #[test]
    fn apps_are_named_from_their_ids() {
        assert_eq!(app_name_of("Microsoft.WindowsTerminal_8wekyb3d8bbwe!App"), "WindowsTerminal");
        assert_eq!(app_name_of("com.squirrel.claude.Claude"), "Claude");
        assert_eq!(app_name_of("chrome.exe"), "chrome");
        assert_eq!(app_name_of(r"{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"), "powershell");
        assert_eq!(app_name_of(r"C:\Program Files\Claude\Claude.exe"), "Claude");
        assert_eq!(app_name_of(""), "");
    }

    #[test]
    fn a_toast_row_becomes_a_notice() {
        let xml = "<toast><visual><binding><text>Claude</text><text>Windows build done</text></binding></visual></toast>";
        assert_eq!(
            notice_of_toast("com.squirrel.claude.Claude", xml.as_bytes()),
            Some(Notice { app: "Claude".into(), summary: "Claude".into(), body: "Windows build done".into(), target: Some("com.squirrel.claude.Claude".into()) })
        );
        assert_eq!(notice_of_toast("Coucou", xml.as_bytes()), None);
        assert_eq!(notice_of_toast("x", b"<toast/>"), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn only_notify_calls_count() {
        use dbus::Message;
        let call = |member: &str| {
            Message::new_method_call("org.freedesktop.Notifications", "/org/freedesktop/Notifications", "org.freedesktop.Notifications", member).unwrap()
        };
        use dbus::arg::{PropMap, RefArg, Variant};
        let full = |hints: PropMap| {
            call("Notify")
                .append3("Discord", 0u32, "")
                .append2("Anna", "hey")
                .append2(Vec::<&str>::new(), hints)
                .append1(-1i32)
        };
        // Without a desktop-entry hint the app's own name is the target.
        assert_eq!(
            linux::notice_of(&full(PropMap::new())),
            Some(Notice { app: "Discord".into(), summary: "Anna".into(), body: "hey".into(), target: Some("discord".into()) })
        );
        let mut hints = PropMap::new();
        hints.insert("desktop-entry".into(), Variant(Box::new("com.discordapp.Discord".to_string()) as Box<dyn RefArg>));
        assert_eq!(
            linux::notice_of(&full(hints)).and_then(|n| n.target),
            Some("com.discordapp.Discord".to_string())
        );
        // Too few arguments, or another method: not a notice.
        assert_eq!(linux::notice_of(&call("Notify").append2("Discord", 0u32)), None);
        assert_eq!(linux::notice_of(&call("CloseNotification").append1(7u32)), None);
    }
}
