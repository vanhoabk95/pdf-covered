@echo off
echo ========================================================
echo   Building ViMask Standalone Executable (.exe)
echo ========================================================
echo.

cd /d "%~dp0\.."

echo [1/3] Installing dependencies...
call pnpm.cmd install

echo.
echo [2/3] Building Tauri app (standalone exe only)...
call pnpm.cmd tauri build --no-bundle

IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed! Check the logs above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Copying executable to dist folder...
if not exist dist mkdir dist
copy /Y "src-tauri\target\release\vimask.exe" "dist\ViMask.exe" >nul

echo.
echo ========================================================
echo Build successful!
echo The standalone executable (.exe) has been copied to:
echo -^> dist\ViMask.exe
echo You can use this file to run the app independently.
echo ========================================================
pause
