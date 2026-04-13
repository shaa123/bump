@echo off
chcp 65001 >nul 2>&1
title AutoBump - Disboard
color 0D

echo.
echo  ██████╗ ██╗   ██╗███╗   ███╗██████╗
echo  ██╔══██╗██║   ██║████╗ ████║██╔══██╗
echo  ██████╔╝██║   ██║██╔████╔██║██████╔╝
echo  ██╔══██╗██║   ██║██║╚██╔╝██║██╔═══╝
echo  ██████╔╝╚██████╔╝██║ ╚═╝ ██║██║
echo  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═╝
echo.
echo  AutoBump for Disboard - by Master
echo  Logs saved to bump_log.txt
echo  Close this window to stop.
echo.

:: Check node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed! Get it at https://nodejs.org
    pause
    exit
)

:: Install deps if node_modules missing
if not exist "node_modules" (
    echo [SETUP] Installing dependencies...
    call npm install
    echo.
)

:loop
echo [%date% %time%] Starting AutoBump...
node bump.js
echo.
echo [%date% %time%] Crashed or exited. Restarting in 30 seconds...
timeout /t 30 /nobreak
goto loop
