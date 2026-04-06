@echo off
setlocal
cd /d "%~dp0"
start "Audit Studio Next Server" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start "Audit Studio Desktop" cmd /k "npm run desktop:dev"
