@echo off
setlocal
cd /d "%~dp0"
start "Audit Studio Web" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
