@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先到 https://nodejs.org 安装 LTS 版本。
  pause
  exit /b 1
)

netstat -ano | findstr ":8612" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo 局域网书库服务已经在运行，直接打开电脑管理页。
  start "" http://localhost:8612/
  pause
  exit /b 0
)

if not exist dist\index.html (
  echo 正在首次构建...
  call npm run build
  if errorlevel 1 (
    echo [错误] 构建失败。
    pause
    exit /b 1
  )
)

echo 正在启动局域网书库服务...
start "局域网书库服务" cmd /k node server/lan-server.mjs
timeout /t 3 /nobreak >nul
echo 正在打开电脑端管理页 http://localhost:8612/
start "" http://localhost:8612/
echo 手机请访问服务窗口打印的“手机访问”地址（关闭本窗口不影响服务）。
pause >nul
