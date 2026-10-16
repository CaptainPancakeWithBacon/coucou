@echo off
setlocal
cd /d "%~dp0windows"
where node >nul 2>nul
if errorlevel 1 goto missing_node
where cargo >nul 2>nul
if errorlevel 1 goto missing_rust
rem ONNX Runtime's prebuilt libraries require a recent MSVC toolchain.
rem Select it explicitly; Rust may otherwise pick an older VS installation.
set "COUCOU_VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%COUCOU_VSWHERE%" goto missing_cpp
set "COUCOU_VS="
for /f "usebackq delims=" %%I in (`call "%COUCOU_VSWHERE%" -latest -products * -version "[17.10,)" -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "COUCOU_VS=%%I"
if not defined COUCOU_VS goto missing_cpp
call "%COUCOU_VS%\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
if errorlevel 1 goto failed
call npm.cmd ci
if not "%errorlevel%"=="0" goto failed
call npm.cmd run tauri -- build --bundles nsis
if not "%errorlevel%"=="0" goto failed
if not exist "%~dp0output" mkdir "%~dp0output"
if errorlevel 1 goto failed
copy /y "target\release\coucou.exe" "%~dp0output\Coucou.exe" >nul
if errorlevel 1 goto failed
copy /y "target\release\coucou-hook.exe" "%~dp0output\coucou-hook.exe" >nul
if errorlevel 1 goto failed
copy /y "BEAT-LICENSES.txt" "%~dp0output\BEAT-LICENSES.txt" >nul
if errorlevel 1 goto failed
for %%F in ("target\release\bundle\nsis\*-setup.exe") do (
  copy /y "%%~fF" "%~dp0output\Coucou-setup.exe" >nul
  if errorlevel 1 goto failed
)
echo Build ready: %~dp0output
if /i not "%~1"=="--no-pause" pause
exit /b 0
:missing_node
echo Install Node.js LTS first.
goto failed
:missing_rust
echo Install Rust first.
goto failed
:missing_cpp
 echo Install the C++ build tools in Visual Studio 2022 version 17.10 or newer.
 echo Open Visual Studio Installer, choose Modify, then Desktop development with C++.
 echo Include the latest MSVC x64/x86 tools and a Windows SDK.
 goto failed
:failed
echo Build failed. See the error above.
if /i not "%~1"=="--no-pause" pause
exit /b 1
