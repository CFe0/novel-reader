@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 请在弹出的窗口中选择要固定为“局域网书库”的文件夹...
powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '选择要固定为局域网书库的文件夹'; $d.ShowNewFolderButton = $true; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.SelectedPath } else { exit 1 }" > "%TEMP%\lan-folder-path.txt"
if errorlevel 1 (
  echo 未选择文件夹，已取消。
  pause
  exit /b 1
)
set /p FOLDER=<"%TEMP%\lan-folder-path.txt"
if "%FOLDER%"=="" (
  echo 未选择文件夹，已取消。
  pause
  exit /b 1
)

echo 已选择：%FOLDER%
call node server/lan-server.mjs set "%FOLDER%"
if errorlevel 1 (
  echo [错误] 设置失败。
  pause
  exit /b 1
)

netstat -ano | findstr ":8612" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo 服务正在运行，新书库已生效（服务会动态读取配置）。
  echo 正在打开电脑端管理页 http://localhost:8612/
  start "" http://localhost:8612/
) else (
  echo 设置完成。服务尚未运行，请双击「启动局域网书库.bat」或「打开电脑管理页.bat」启动。
)
pause >nul
