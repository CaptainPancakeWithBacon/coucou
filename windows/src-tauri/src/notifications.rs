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
}

fn clean(app: &str, summary: &str, body: &str) -> Option<Notice> {
    let app = app.trim();
    if IGNORED_APPS.contains(&app.to_lowercase().as_str()) {
        return None;
    }
    let summary = strip_markup(summary);
    let body = strip_markup(body);
    if summary.is_empty() && body.is_empty() {
        return None;
    }
    Some(Notice { app: app.to_string(), summary, body })
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
    clean(&app_name_of(primary_id), &summary, &body)
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

fn deliver(app: &AppHandle, notice: Notice) {
    use tauri::Emitter;
    let _ = app.emit("desktop-notification", notice);
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
        let (app, _replaces, _icon, summary, body): (&str, u32, &str, &str, &str) = msg.read5().ok()?;
        clean(app, summary, body)
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
        rowid: i64,
        app: String,
        payload: Vec<u8>,
    }

    fn bytes_of(value: ValueRef) -> Vec<u8> {
        match value {
            ValueRef::Blob(b) | ValueRef::Text(b) => b.to_vec(),
            _ => Vec::new(),
        }
    }

    /// The rows after `base`, with the app each belongs to (the handler's id).
    fn rows_after(conn: &Connection, base: i64) -> Result<Vec<Row>, String> {
        let joined = "SELECT n.rowid, COALESCE(h.PrimaryId, ''), n.Payload FROM Notification n LEFT JOIN NotificationHandler h ON n.HandlerId = h.RecordId WHERE n.rowid > ?1 ORDER BY n.rowid";
        let plain = "SELECT rowid, '', Payload FROM Notification WHERE rowid > ?1 ORDER BY rowid";
        for sql in [joined, plain] {
            let Ok(mut stmt) = conn.prepare(sql) else { continue };
            let rows = stmt
                .query_map([base], |r| Ok(Row { rowid: r.get(0)?, app: r.get(1)?, payload: bytes_of(r.get_ref(2)?) }))
                .map_err(|e| e.to_string())?;
            return rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string());
        }
        Err("no readable Notification table".into())
    }

    /// New notices since `last`; the first call only marks where the database stands.
    fn poll(last: &mut Option<i64>) -> Result<Vec<Notice>, String> {
        let Some(path) = db_path().filter(|p| p.exists()) else { return Ok(Vec::new()) };
        let conn = open(&path)?;
        let max: i64 = conn
            .query_row("SELECT COALESCE(MAX(rowid), 0) FROM Notification", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let base = match *last {
            Some(l) if max >= l => l,
            // First look, or the newest row was dismissed and its number can come again.
            _ => {
                *last = Some(max);
                return Ok(Vec::new());
            }
        };
        if max == base {
            return Ok(Vec::new());
        }
        let rows = rows_after(&conn, base)?;
        *last = Some(max);
        // Which app each notification came from goes in the log (never its text),
        // so "Claude's notifications do not show" can be told from "Windows never
        // handed them over".
        let mut notices = Vec::new();
        for row in &rows {
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
                let mut last: Option<i64> = None;
                let mut complained = false;
                loop {
                    std::thread::sleep(Duration::from_secs(2));
                    if !enabled(&app) || crate::integrations::PAUSED.load(std::sync::atomic::Ordering::Relaxed) {
                        // Turned on again later: start from what is there then.
                        last = None;
                        continue;
                    }
                    match poll(&mut last) {
                        Ok(notices) => {
                            complained = false;
                            for notice in notices {
                                deliver(&app, notice);
                            }
                        }
                        Err(e) if !complained => {
                            complained = true;
                            crate::log::line(format!("notifications: {e}"));
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
        assert_eq!(clean("Discord", "", "  "), None);
        assert_eq!(clean("Coucou", "Done", ""), None);
        assert_eq!(
            clean("Discord", "Anna", "hey!"),
            Some(Notice { app: "Discord".into(), summary: "Anna".into(), body: "hey!".into() })
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
            Some(Notice { app: "Claude".into(), summary: "Claude".into(), body: "Windows build done".into() })
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
        let notify = call("Notify").append3("Discord", 0u32, "").append2("Anna", "hey");
        assert_eq!(
            linux::notice_of(&notify),
            Some(Notice { app: "Discord".into(), summary: "Anna".into(), body: "hey".into() })
        );
        // Too few arguments, or another method: not a notice.
        assert_eq!(linux::notice_of(&call("Notify").append2("Discord", 0u32)), None);
        assert_eq!(linux::notice_of(&call("CloseNotification").append1(7u32)), None);
    }
}
