@echo off
setlocal EnableExtensions
pushd "%~dp0" || exit /b 1

rem Reuse the existing Tauri CLI. Reinstalling on every build can fail with
rem EPERM when Windows / antivirus still holds the native .node addon open.
set "TAURI_BIN=node_modules\.bin\tauri.cmd"
if exist "%TAURI_BIN%" if exist "node_modules\@tauri-apps\cli-win32-x64-msvc\cli.win32-x64-msvc.node" goto build

echo [Coucou] Tauri CLI not installed; installing dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 goto install_failed
if not exist "%TAURI_BIN%" goto install_failed

:build
echo [Coucou] Building Windows NSIS installer...
call npm run tauri -- build --bundles nsis
if errorlevel 1 goto build_failed
echo [Coucou] Windows installer build completed.
popd
exit /b 0

:install_failed
echo.
echo [Coucou] Dependency installation failed. Build cancelled.
echo [Coucou] If npm reports EPERM on cli.win32-x64-msvc.node:
echo   1. Exit Coucou, dev servers and any running build.
echo   2. Close terminals/editors using node_modules and check Task Manager.
echo   3. Try again. If still locked, restart Windows before retrying.
echo [Coucou] Do NOT run Tauri until npm has installed successfully.
popd
exit /b 1

:build_failed
echo.
echo [Coucou] Tauri build failed; check compiler output above.
popd
exit /b 1
