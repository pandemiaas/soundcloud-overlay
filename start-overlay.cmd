@echo off
chcp 65001 >nul
title SoundCloud Overlay
cd /d "%~dp0"
echo Starting SoundCloud Overlay... keep this window OPEN.
echo Press Alt+D to show/hide the overlay card.
echo.
node_modules\.bin\electron.cmd .
echo.
echo Overlay exited. Press any key.
pause >nul
