@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 局域网书库服务

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先到 https://nodejs.org 安装 LTS 版本。
  pause
  exit /b 1
)

if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

netstat -ano | findstr ":8612" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo 局域网书库服务已经在运行，无需重复启动。
  echo 本机管理页：http://localhost:8612/
  echo 手机访问地址请查看已运行的服务窗口。
  start "" http://localhost:8612/
  pause
  exit /b 0
)

echo 正在构建并启动服务（首次需要几秒，请等待下方出现“手机访问”地址）...
call npm run lan

echo.
echo 服务已停止。
pause >nul
