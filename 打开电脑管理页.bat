@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在构建并启动局域网书库服务...
call npm run build
start "局域网书库服务" cmd /k node server/lan-server.mjs
echo 正在打开电脑端管理页 http://localhost:8612/ ...
timeout /t 3 /nobreak >nul
start "" http://localhost:8612/
echo.
echo 手机请访问上方服务窗口打印的“手机访问”地址。
pause
