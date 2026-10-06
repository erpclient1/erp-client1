@echo off
chcp 65001 >nul
title ERP Pembelian - Server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Unduh gratis di https://nodejs.org lalu jalankan file ini lagi.
  pause
  exit /b 1
)
echo Menjalankan ERP Pembelian ... (jangan tutup jendela ini selama aplikasi dipakai)
echo.
node server\server.js
echo.
echo Server berhenti.
pause
