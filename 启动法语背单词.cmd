@echo off
chcp 65001 >nul
title French Words - Scan to Open
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-app.ps1"
echo.
pause
