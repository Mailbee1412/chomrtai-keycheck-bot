@echo off
title ChomRtai Bot
cd /d "%~dp0"

echo ============================================
echo   ChomRtai Bot - starting
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js / npm not found.
  echo Install from https://nodejs.org first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies - please wait...
  call npm install
  echo.
)

echo Press Ctrl+C to stop the bot.
echo.

:loop
node src/index.js
echo.
echo ============================================
echo   Bot stopped.
echo   Y = restart   N = quit
echo ============================================
echo.
choice /c YN /n /m "Restart the bot [Y/N]? "
if errorlevel 2 exit /b 0
goto loop