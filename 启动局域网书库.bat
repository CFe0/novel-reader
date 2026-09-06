@echo off
cd /d "%~dp0"
title NovelReader LAN Server

where node >nul 2>nul
if errorlevel 1 (
  echo [Error] Node.js not found. Please install LTS from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [Error] npm install failed. Check your network and retry.
    pause
    exit /b 1
  )
)

netstat -ano | findstr ":8612" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo LAN server is already running at http://localhost:8612/
  start "" http://localhost:8612/
  pause
  exit /b 0
)

echo Building and starting LAN server. Phone URL is printed below...
call npm run lan

echo.
echo Server stopped.
pause >nul
