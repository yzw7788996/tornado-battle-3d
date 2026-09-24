@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo   龙卷风大作战 - 本地服务器已启动
echo.
echo   1. 手机和电脑连【同一个 WiFi】
echo   2. 用手机浏览器打开下面显示的地址,端口 8000
echo      例如:  http://192.168.1.100:8000
echo.
echo   (电脑上也可以直接打开 http://localhost:8000)
echo ==============================================
ipconfig | findstr /C:"IPv4"
echo.
py -m http.server 8000 2>nul || python -m http.server 8000
pause
