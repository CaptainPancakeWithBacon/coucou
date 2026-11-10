// The system power profile, so Mochi can go easy on the battery while the laptop is in power-saver.
// Linux: power-profiles-daemon on the system bus (what GNOME's Power Mode switch sets).
// Windows: Battery Saver (Settings > System > Power & battery), the status flag GetSystemPowerStatus reports. Everywhere else: never.

/// True while the active power profile is "power-saver". False when it cannot be read.
#[tauri::command]
pub fn power_saver() -> bool {
    saver()
}

#[cfg(target_os = "linux")]
pub fn saver() -> bool {
    use dbus::blocking::{stdintf::org_freedesktop_dbus::Properties, Connection};
    let Ok(connection) = Connection::new_system() else { return false };
    let proxy = connection.with_proxy("net.hadess.PowerProfiles", "/net/hadess/PowerProfiles", std::time::Duration::from_millis(500));
    proxy.get::<String>("net.hadess.PowerProfiles", "ActiveProfile").is_ok_and(|profile| profile == "power-saver")
}

#[cfg(windows)]
pub fn saver() -> bool {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut status = SYSTEM_POWER_STATUS::default();
    // SAFETY: `status` is a valid out pointer for the whole call.
    unsafe { GetSystemPowerStatus(&mut status) }.is_ok() && status.SystemStatusFlag == 1
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn saver() -> bool {
    false
}
