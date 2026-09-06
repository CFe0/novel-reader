@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 本地小说阅读器 - 局域网书库 ===
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先到 https://nodejs.org 安装 LTS 版本后再运行。
  pause
  exit /b 1
)
if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install
)
echo 正在构建并启动服务（手机访问地址见下方输出，端口 8612）...
call npm run lan
pause
