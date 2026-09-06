@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [Error] Node.js not found. Please install LTS from https://nodejs.org
  pause
  exit /b 1
)

netstat -ano | findstr ":8612" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo LAN server is already running. Opening management page...
  start "" http://localhost:8612/
  pause
  exit /b 0
)

if not exist dist\index.html (
  echo First build, please wait...
  call npm run build
  if errorlevel 1 (
    echo [Error] Build failed.
    pause
    exit /b 1
  )
)

echo Starting LAN server...
start "NovelReader LAN Server" cmd /k node server/lan-server.mjs
timeout /t 3 /nobreak >nul
echo Opening management page http://localhost:8612/
start "" http://localhost:8612/
echo Phone URL is printed in the server window.
pause >nul
