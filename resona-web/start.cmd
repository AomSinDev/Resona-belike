@echo off
rem Resona: double-click to start the game server and open the browser (no PowerShell policy issues)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org & pause & exit /b 1)
if not exist .env.local (
  copy .env.example .env.local >nul
  echo Created .env.local - paste your API keys after the = signs, save, then close Notepad.
  notepad .env.local
)
if "%PORT%"=="" set PORT=8787
start "" http://localhost:%PORT%
node --env-file-if-exists=.env.local server.js
pause
