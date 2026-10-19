// Windows process loopback: only Spotify and its children, across output devices.
// Audio remains in memory. Packet QPC timestamps anchor beats to playback time.
use std::{sync::mpsc, time::Duration};
use windows::{core::{implement, Interface, Ref, HRESULT}, Win32::{
    Foundation::{CloseHandle, HANDLE},
    Media::Audio::*,
    System::{Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED, BLOB,
        StructuredStorage::{PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0}},
        Diagnostics::ToolHelp::*, Threading::{CreateEventW, WaitForSingleObject},
        Performance::{QueryPerformanceCounter, QueryPerformanceFrequency}, Variant::VT_BLOB},
}};

pub struct Capture { stop: mpsc::Sender<()>, thread: Option<std::thread::JoinHandle<()>> }
impl Drop for Capture {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(thread) = self.thread.take() { let _ = thread.join(); }
    }
}

struct OwnedHandle(HANDLE);
impl Drop for OwnedHandle { fn drop(&mut self) { unsafe { let _ = CloseHandle(self.0); } } }
struct Com;
impl Drop for Com { fn drop(&mut self) { unsafe { CoUninitialize(); } } }

/// Select a root Spotify process, not an arbitrary Chromium audio subprocess.
pub fn spotify_pid() -> Option<u32> {
    unsafe {
        let snapshot = OwnedHandle(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?);
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut processes = Vec::new();
        if Process32FirstW(snapshot.0, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                if String::from_utf16_lossy(&entry.szExeFile[..len]).eq_ignore_ascii_case("spotify.exe") {
                    processes.push((entry.th32ProcessID, entry.th32ParentProcessID));
                }
                if Process32NextW(snapshot.0, &mut entry).is_err() { break; }
            }
        }
        processes.iter().find(|(_, parent)| !processes.iter().any(|(pid, _)| pid == parent)).map(|(pid, _)| *pid)
    }
}

#[implement(IActivateAudioInterfaceCompletionHandler)]
struct Completion { sender: mpsc::Sender<Result<usize, String>> }
impl IActivateAudioInterfaceCompletionHandler_Impl for Completion_Impl {
    fn ActivateCompleted(&self, operation: Ref<'_, IActivateAudioInterfaceAsyncOperation>) -> windows::core::Result<()> {
        let result = (|| unsafe {
            let mut hr = HRESULT(0);
            let mut object = None;
            operation.ok()?.GetActivateResult(&mut hr, &mut object)?;
            hr.ok()?;
            object.ok_or_else(|| windows::core::Error::from_hresult(HRESULT(0x80004005u32 as i32)))?.cast::<IAudioClient>()
        })().map(|client| client.into_raw() as usize).map_err(|err| err.to_string());
        // Both callback and receiver live in the MTA. Transfer this one owned
        // COM reference; release it here if the activation timed out.
        if let Err(mpsc::SendError(Ok(raw))) = self.sender.send(result) {
            unsafe { drop(IAudioClient::from_raw(raw as _)); }
        }
        Ok(())
    }
}

pub fn start(mut sink: impl FnMut(&[i16], f64, bool) + Send + 'static) -> Result<Capture, String> {
    let pid = spotify_pid().ok_or("Spotify is not running")?;
    let (ready_tx, ready_rx) = mpsc::channel();
    let (stop_tx, stop_rx) = mpsc::channel();
    let thread = std::thread::Builder::new().name("spotify-beat-audio".into()).spawn(move || {
        let result = unsafe { run(pid, stop_rx, &ready_tx, &mut sink) };
        if let Err(err) = result {
            let message = format!("Spotify audio: {err}");
            let _ = ready_tx.send(Err(message.clone()));
            crate::log::line(message);
        }
    }).map_err(|err| err.to_string())?;
    match ready_rx.recv_timeout(Duration::from_secs(8)) {
        Ok(Ok(())) => Ok(Capture { stop: stop_tx, thread: Some(thread) }),
        Ok(Err(err)) => { let _ = stop_tx.send(()); let _ = thread.join(); Err(err) }
        Err(_) => { let _ = stop_tx.send(()); Err("Spotify audio activation timed out".into()) }
    }
}

unsafe fn run(pid: u32, stop: mpsc::Receiver<()>, ready: &mpsc::Sender<Result<(), String>>,
    sink: &mut impl FnMut(&[i16], f64, bool)) -> Result<(), Box<dyn std::error::Error>> {
    CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
    let _com = Com;
    let mut params = AUDIOCLIENT_ACTIVATION_PARAMS {
        ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
        Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 { ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
            TargetProcessId: pid, ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
        } },
    };
    // Borrowed blob: never call PropVariantClear on this stack-owned value.
    let variant = std::mem::ManuallyDrop::new(PROPVARIANT { Anonymous: PROPVARIANT_0 { Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
        vt: VT_BLOB, Anonymous: PROPVARIANT_0_0_0 { blob: BLOB {
            cbSize: std::mem::size_of_val(&params) as u32, pBlobData: (&mut params as *mut AUDIOCLIENT_ACTIVATION_PARAMS).cast(),
        } }, ..Default::default()
    }) } });
    let (tx, rx) = mpsc::channel();
    let handler: IActivateAudioInterfaceCompletionHandler = Completion { sender: tx }.into();
    let _activation = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, &IAudioClient::IID, Some(&*variant), &handler)?;
    let raw = rx.recv_timeout(Duration::from_secs(6))??;
    let client = IAudioClient::from_raw(raw as _);
    let format = WAVEFORMATEX { wFormatTag: 1, nChannels: 2, nSamplesPerSec: super::RATE as u32,
        nAvgBytesPerSec: super::RATE as u32 * 4, nBlockAlign: 4, wBitsPerSample: 16, cbSize: 0 };
    client.Initialize(AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
        200_000, 0, &format, None)?;
    let event = OwnedHandle(CreateEventW(None, false, false, None)?);
    client.SetEventHandle(event.0)?;
    let capture: IAudioCaptureClient = client.GetService()?;
    let mut frequency = 0;
    QueryPerformanceFrequency(&mut frequency)?;
    let mut samples = Vec::new();
    client.Start()?;
    let _ = ready.send(Ok(()));
    crate::log::line(format!("beat: Spotify-only capture pid={pid}"));
    let result = (|| -> windows::core::Result<()> {
        while matches!(stop.try_recv(), Err(mpsc::TryRecvError::Empty)) {
            let _ = WaitForSingleObject(event.0, 20);
            while capture.GetNextPacketSize()? > 0 {
                let (mut data, mut frames, mut flags, mut qpc) = (std::ptr::null_mut(), 0, 0, 0);
                capture.GetBuffer(&mut data, &mut frames, &mut flags, None, Some(&mut qpc))?;
                let discontinuity = flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY.0 as u32 != 0;
                samples.clear();
                if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                    samples.resize(frames as usize, 0);
                } else {
                    let input = std::slice::from_raw_parts(data.cast::<i16>(), frames as usize * 2);
                    samples.extend(input.chunks_exact(2).map(|s| ((s[0] as i32 + s[1] as i32) / 2) as i16));
                }
                capture.ReleaseBuffer(frames)?;
                let mut clock = 0;
                QueryPerformanceCounter(&mut clock)?;
                let age_ms = clock as f64 * 1000.0 / frequency as f64 - qpc as f64 / 10000.0;
                let end_ms = if qpc > 0 && flags & AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR.0 as u32 == 0 {
                    super::now_ms() - age_ms + frames as f64 * 1000.0 / super::RATE as f64
                } else { super::now_ms() };
                if !samples.is_empty() { sink(&samples, end_ms, discontinuity); }
            }
        }
        Ok(())
    })();
    let _ = client.Stop();
    result?;
    Ok(())
}
