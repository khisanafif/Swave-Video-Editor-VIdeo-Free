#!/usr/bin/env bash
set -e
export PATH="$HOME/.local/bin:$HOME/.cache/node-v22.23.5-linux-x64/bin:$PATH"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

echo "===================================================================="
echo "  Menyiapkan VeloCut Multi-Device Studio Server (V-HESA)..."
echo "===================================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js tidak ditemukan. Pasang Node.js versi >= 22.5.0 terlebih dahulu."
  echo "Panduan lengkap ada di README.md"
  exit 1
fi

NODE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[ERROR] Node.js terdeteksi v$(node -v), tetapi VeloCut membutuhkan Node.js >= v22.5.0."
  echo "Silakan update Node.js ke versi 22 LTS (lihat README.md)."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[1/3] Menginstal dependensi npm..."
  npm install
fi

if [ ! -f "packages/shared/dist/index.js" ] || [ ! -f "apps/web/dist/index.html" ] || [ ! -f "apps/server/dist/index.js" ]; then
  echo "[2/3] Membangun aplikasi VeloCut..."
  npm run build
fi

echo "[3/3] Menjalankan Server VeloCut..."
npm --workspace=@velocut/server run start
