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
echo.
echo 设置完成。双击「启动局域网书库.bat」启动服务后，手机即可访问该书库。
pause
