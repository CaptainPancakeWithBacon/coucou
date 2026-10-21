// A regular Claude Desktop chat (not a Code session) runs no hook, so Coucou never
// hears that a reply is done (Mac #686). This watcher fills the gap — Windows port of
// ClaudeDesktopChatWatcher.swift. Experimental, off by default (Settings → Agents):
// when you leave the Claude app while it is still writing (its "Stop response" button
// is on screen), Coucou looks once a second, through UI Automation, for that button to
// go away. Then the island gets "claude-reply-ready": Mochi jumps, the finish sound
// plays and the Claude Desktop pill says the reply is ready.
//
// Nothing runs while the setting is off, while Claude is in front, or while it is not
// writing; no text of the chat is read, only whether the stop button is there.

/// How Claude's app words the button that stops a reply (tests below); the other
/// languages it speaks are matched by their usual wording. Best effort: it may be renamed.
const STOP_LABELS: &[&str] = &[
    "stop response", "stop generating",
    "arrêter la réponse", "arrêter la génération",
    "detener respuesta", "detener la respuesta",
    "parar resposta", "parar a resposta", "interromper resposta",
    "antwort stoppen", "antwort anhalten",
    "interrompi risposta", "interrompi la risposta",
    "hentikan respons", "hentikan tanggapan",
    "応答を停止", "回答を停止", "응답 중지", "停止响应", "停止回答", "停止回應",
];

/// Whether any of these accessible labels is the stop-the-reply button.
pub fn is_stop_label(labels: &[&str]) -> bool {
    labels.iter().any(|raw| {
        let l = raw.trim().to_lowercase();
        if l.is_empty() {
            return false;
        }
        // "Stop the response", "Stop responding": a stop that is about the reply.
        STOP_LABELS.contains(&l.as_str()) || (l.contains("stop") && l.contains("respon"))
    })
}

/// A reply longer than this (in seconds) is given up on: no endless polling.
#[cfg(windows)]
const GIVE_UP_AFTER_SECS: u64 = 30 * 60;

#[cfg(windows)]
pub fn start(app: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("claude-chat".into())
        .spawn(move || win::run(app))
        .ok();
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::time::{Duration, Instant};

    use tauri::{Emitter, Manager};
    use windows::core::Interface;
    use windows::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation8, IUIAutomation, IUIAutomation2, TreeScope_Descendants, UIA_ButtonControlTypeId,
        UIA_ControlTypePropertyId,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowThreadProcessId, IsWindowVisible,
    };

    enum Phase {
        Idle,
        /// A reply is being written: since when, and that the app is not in front.
        Watching(Instant),
    }

    pub fn run(app: tauri::AppHandle) {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let mut phase = Phase::Idle;
        let mut was_front = false;
        loop {
            let enabled = app
                .try_state::<crate::Shared>()
                .is_some_and(|s| s.settings.lock().map(|g| g.claude_desktop_chat_watch).unwrap_or(false));
            if !enabled || crate::integrations::PAUSED.load(std::sync::atomic::Ordering::Relaxed) {
                phase = Phase::Idle;
                was_front = false;
                std::thread::sleep(Duration::from_secs(3));
                continue;
            }
            std::thread::sleep(Duration::from_secs(1));
            let front = foreground_is_claude();
            match phase {
                Phase::Idle => {
                    if front {
                        was_front = true;
                    } else if was_front {
                        // Just left Claude: is it still writing?
                        was_front = false;
                        if claude_window().is_some_and(|hwnd| stop_button_present(hwnd)) {
                            crate::log::line("claude desktop: a reply is in progress, watching".to_string());
                            phase = Phase::Watching(Instant::now());
                        }
                    }
                }
                Phase::Watching(since) => {
                    if front {
                        // You are back in Claude: you see the reply yourself.
                        phase = Phase::Idle;
                        was_front = true;
                    } else if since.elapsed() > Duration::from_secs(GIVE_UP_AFTER_SECS) {
                        phase = Phase::Idle;
                    } else {
                        match claude_window() {
                            None => phase = Phase::Idle, // the app was closed
                            Some(hwnd) if !stop_button_present(hwnd) => {
                                crate::log::line("claude desktop: the reply is ready".to_string());
                                let _ = app.emit_to(crate::island::WINDOW_LABEL, "claude-reply-ready", ());
                                phase = Phase::Idle;
                            }
                            Some(_) => {}
                        }
                    }
                }
            }
        }
    }

    /// "claude" for C:\...\Claude.exe.
    fn program_of(pid: u32) -> Option<String> {
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let named = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(process);
            named.ok()?;
            let path = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
            let file = path.rsplit(['\\', '/']).next()?.to_string();
            Some(file.strip_suffix(".exe").unwrap_or(&file).to_string())
        }
    }

    fn is_claude(pid: u32) -> bool {
        program_of(pid).as_deref() == Some("claude")
    }

    fn foreground_is_claude() -> bool {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return false;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            pid != 0 && is_claude(pid)
        }
    }

    /// The first visible top-level window of the Claude app.
    fn claude_window() -> Option<HWND> {
        unsafe extern "system" fn each(hwnd: HWND, found: LPARAM) -> BOOL {
            if !IsWindowVisible(hwnd).as_bool() {
                return BOOL(1);
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid != 0 && is_claude(pid) {
                *(found.0 as *mut Option<HWND>) = Some(hwnd);
                return BOOL(0);
            }
            BOOL(1)
        }
        let mut found: Option<HWND> = None;
        unsafe {
            let _ = EnumWindows(Some(each), LPARAM(&mut found as *mut Option<HWND> as isize));
        }
        found
    }

    /// Whether a stop-the-reply button is on screen in that window. Only the buttons'
    /// names are read.
    fn stop_button_present(hwnd: HWND) -> bool {
        unsafe {
            let Ok(automation) = CoCreateInstance::<_, IUIAutomation>(&CUIAutomation8, None, CLSCTX_ALL) else {
                return false;
            };
            if let Ok(timeouts) = automation.cast::<IUIAutomation2>() {
                let _ = timeouts.SetConnectionTimeout(500);
                let _ = timeouts.SetTransactionTimeout(1500);
            }
            let Ok(root) = automation.ElementFromHandle(hwnd) else { return false };
            let Ok(condition) =
                automation.CreatePropertyCondition(UIA_ControlTypePropertyId, &UIA_ButtonControlTypeId.0.into())
            else {
                return false;
            };
            let Ok(buttons) = root.FindAll(TreeScope_Descendants, &condition) else { return false };
            for i in 0..buttons.Length().unwrap_or(0) {
                let Ok(button) = buttons.GetElement(i) else { continue };
                let name = button.CurrentName().map(|b| b.to_string()).unwrap_or_default();
                let help = button.CurrentHelpText().map(|b| b.to_string()).unwrap_or_default();
                if is_stop_label(&[&name, &help]) {
                    return true;
                }
            }
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_stop_button_is_told_by_its_label() {
        assert!(is_stop_label(&["Stop response"]));
        assert!(is_stop_label(&["  STOP RESPONSE  "]));
        assert!(is_stop_label(&["", "Antwort stoppen"]));
        assert!(is_stop_label(&["停止响应"]));
        // A stop that is about the reply, in other words.
        assert!(is_stop_label(&["Stop the response"]));
        assert!(is_stop_label(&["Stop responding"]));
        // Not the reply: a send button, a stop about something else, nothing.
        assert!(!is_stop_label(&["Send message"]));
        assert!(!is_stop_label(&["Stop recording"]));
        assert!(!is_stop_label(&["", "   "]));
        assert!(!is_stop_label(&[]));
    }
}
