// Desktop notifications in the island (Linux).
//
// A desktop's notification service owns `org.freedesktop.Notifications` and
// GNOME's cannot be replaced, so Coucou does not take that name: it becomes a
// monitor of the session bus (`BecomeMonitor`, which only ever receives copies)
// and reads every `Notify` call. The island shows them as a "Notifications"
// pill; the desktop's own banners are switched off with
// `org.gnome.desktop.notifications show-banners` (the list in the calendar still
// fills). Off by default ("Show notifications in the island" in Settings).
//
// Nothing is stored or sent anywhere: a notification is read in memory and
// handed to the island as one event.

use std::time::Duration;

use dbus::channel::{BusType, Channel};
use dbus::message::MessageType;
use dbus::Message;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const RULE: &str = "type='method_call',interface='org.freedesktop.Notifications',member='Notify'";
/// Our own notifications and the volume/brightness style ones are not news.
const IGNORED_APPS: [&str; 1] = ["coucou"];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub app: String,
    pub summary: String,
    pub body: String,
}

/// The first five arguments of a `Notify` call, as a notice; `None` for what
/// the island should not show (empty, or from an ignored app).
fn notice_of(msg: &Message) -> Option<Notice> {
    if msg.msg_type() != MessageType::MethodCall || &*msg.member()? != "Notify" {
        return None;
    }
    let (app, _replaces, _icon, summary, body): (&str, u32, &str, &str, &str) = msg.read5().ok()?;
    clean(app, summary, body)
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
        .trim()
        .chars()
        .take(300)
        .collect()
}

/// Starts the listener thread; it waits quietly on the bus and costs nothing
/// while no notification arrives. Reconnects if the bus goes away.
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
                    let _ = app.emit("desktop-notification", notice);
                }
            }
            Ok(None) => {}
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn enabled(app: &AppHandle) -> bool {
    app.try_state::<crate::Shared>().is_some_and(|s| s.settings.lock().map(|g| g.show_notifications).unwrap_or(false))
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
    fn only_notify_calls_count() {
        let call = |member: &str| {
            Message::new_method_call("org.freedesktop.Notifications", "/org/freedesktop/Notifications", "org.freedesktop.Notifications", member).unwrap()
        };
        let notify = call("Notify").append3("Discord", 0u32, "").append2("Anna", "hey");
        assert_eq!(
            notice_of(&notify),
            Some(Notice { app: "Discord".into(), summary: "Anna".into(), body: "hey".into() })
        );
        // Too few arguments, or another method: not a notice.
        assert_eq!(notice_of(&call("Notify").append2("Discord", 0u32)), None);
        assert_eq!(notice_of(&call("CloseNotification").append1(7u32)), None);
    }
}
