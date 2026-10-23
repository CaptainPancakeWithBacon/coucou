// The system's accent colour as "#rrggbb", for the island's "Match system" colour.
// GNOME says it through a setting (a named colour), Windows keeps it in the
// registry. Anywhere else, or when asking fails, there is no answer and the
// island stays black.

/// GNOME's accent colours by name, as the shell paints them.
fn gnome_accent(setting: &str) -> Option<&'static str> {
    Some(match setting.trim().trim_matches('\'') {
        "blue" => "#3584e4",
        "teal" => "#2190a4",
        "green" => "#3a944a",
        "yellow" => "#c88800",
        "orange" => "#ed5b00",
        "red" => "#e62d42",
        "pink" => "#d56199",
        "purple" => "#9141ac",
        "slate" => "#6f8396",
        _ => return None,
    })
}

/// `reg query` prints `AccentColor    REG_DWORD    0xffd77800`: alpha, blue, green, red.
fn windows_accent(output: &str) -> Option<String> {
    let hex = output.split_whitespace().find_map(|w| w.strip_prefix("0x"))?;
    let n = u32::from_str_radix(hex, 16).ok()?;
    Some(format!("#{:02x}{:02x}{:02x}", n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff))
}

#[cfg(target_os = "linux")]
fn read() -> Option<String> {
    let out = std::process::Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "accent-color"])
        .output()
        .ok()?;
    gnome_accent(&String::from_utf8_lossy(&out.stdout)).map(str::to_string)
}

#[cfg(windows)]
fn read() -> Option<String> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("reg")
        .args(["query", r"HKCU\Software\Microsoft\Windows\DWM", "/v", "AccentColor"])
        .creation_flags(0x0800_0000) // no console window
        .output()
        .ok()?;
    windows_accent(&String::from_utf8_lossy(&out.stdout))
}

#[cfg(not(any(target_os = "linux", windows)))]
fn read() -> Option<String> {
    None
}

pub fn system_accent() -> Option<String> {
    read()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gnome_names_become_colours() {
        assert_eq!(gnome_accent("'blue'\n"), Some("#3584e4"));
        assert_eq!(gnome_accent("'slate'"), Some("#6f8396"));
        assert_eq!(gnome_accent("''"), None);
        assert_eq!(gnome_accent("No such key"), None);
    }

    #[test]
    fn windows_dword_is_read_backwards() {
        let out = "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\DWM\r\n    AccentColor    REG_DWORD    0xffd77800\r\n\r\n";
        assert_eq!(windows_accent(out), Some("#0078d7".to_string()));
        assert_eq!(windows_accent("ERROR: The system was unable to find the specified registry key"), None);
    }
}
