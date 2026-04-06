@echo off
setlocal
cd /d "%~dp0"
cmd /c npx playwright install chromium
pause
