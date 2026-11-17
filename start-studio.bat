@echo off
title VeloCut Hybrid-Edge Studio Server (V-HESA)
echo ====================================================================
echo   Menyiapkan VeloCut Multi-Device Studio Server...
echo   (PC / Laptop Host untuk HP, Tablet, dan Laptop Lain via WiFi/LAN)
echo ====================================================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js belum terpasang! Unduh Node.js v22 LTS dari https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Menginstal dependensi npm...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Gagal menjalankan npm install.
    pause
    exit /b 1
  )
)

if not exist "packages\shared\dist\index.js" goto do_build
if not exist "apps\web\dist\index.html" goto do_build
if not exist "apps\server\dist\index.js" goto do_build
goto start_srv

:do_build
echo [2/3] Membangun aplikasi web ^& server VeloCut...
call npm run build
if errorlevel 1 (
  echo [ERROR] Gagal mem-build aplikasi VeloCut.
  pause
  exit /b 1
)

:start_srv
echo [3/3] Menjalankan Server VeloCut pada Port 3000...
call npm --workspace=@velocut/server run start
pause
