@echo off
title VeloCut Hybrid-Edge Studio Server (V-HESA)
echo ====================================================================
echo   Menyiapkan VeloCut Multi-Device Studio Server...
echo   (PC / Laptop Host untuk HP, Tablet, dan Laptop Lain via WiFi/LAN)
echo ====================================================================

if not exist "node_modules" (
  echo [1/3] Menginstal dependensi npm...
  call npm install
)

if not exist "apps\web\dist\index.html" (
  echo [2/3] Membangun aplikasi web VeloCut...
  call npm run build
)

echo [3/3] Menjalankan Server VeloCut pada Port 3000...
call npm --workspace=@velocut/server run start
pause

