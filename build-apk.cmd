@echo off
setlocal EnableExtensions
cd /d "%~dp0android"
rem Use the installed Android SDK without writing machine-specific local.properties.
if not defined ANDROID_HOME if defined ANDROID_SDK_ROOT set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_HOME goto missing_sdk
if not exist "%ANDROID_HOME%\platforms\android-35" goto missing_sdk
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" goto build
if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (
  set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
  goto build
)
where java >nul 2>nul
if errorlevel 1 goto missing_java
:build
echo [Coucou] Building the installable debug APK...
call gradlew.bat :app:assembleDebug --console=plain
if errorlevel 1 goto failed
if not exist "%~dp0output" mkdir "%~dp0output"
if errorlevel 1 goto failed
copy /y "app\build\outputs\apk\debug\app-debug.apk" "%~dp0output\Coucou-debug.apk" >nul
if errorlevel 1 goto failed
echo.
echo APK ready: %~dp0output\Coucou-debug.apk
echo This is a debug build for local installation, not a store release.
if /i not "%~1"=="--no-pause" pause
exit /b 0
:missing_sdk
echo Install Android SDK Platform 35 in Android Studio, or set ANDROID_HOME to your SDK.
goto failed
:missing_java
echo Install JDK 17 or newer, or set JAVA_HOME to Android Studio's jbr folder.
goto failed
:failed
echo.
echo [Coucou] APK build failed. See the error above.
if /i not "%~1"=="--no-pause" pause
exit /b 1
