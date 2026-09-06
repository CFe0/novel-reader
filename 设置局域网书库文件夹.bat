@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [Error] Node.js not found. Please install LTS from https://nodejs.org
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Choose the folder for your LAN library'; $d.ShowNewFolderButton = $true; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { & node server/lan-server.mjs set $d.SelectedPath; exit $LASTEXITCODE } else { Write-Host 'Cancelled'; exit 2 }"

if errorlevel 2 (
  echo No folder selected. Cancelled.
  pause
  exit /b 0
)
if errorlevel 1 (
  echo [Error] Failed to set folder.
  pause
  exit /b 1
)

netstat -ano | findstr ":8612" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo Folder set. Server is running, new library is active.
  start "" http://localhost:8612/
) else (
  echo Folder set. Server is not running yet. Double-click one of the other .bat files in this folder to start it.
)
pause >nul
