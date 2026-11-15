#!/usr/bin/env bash
set -e
echo "===================================================================="
echo "  Menyiapkan VeloCut Multi-Device Studio Server (V-HESA)..."
echo "===================================================================="

if [ ! -d "node_modules" ]; then
  npm install
fi

if [ ! -f "apps/web/dist/index.html" ]; then
  npm run build
fi

npm --workspace=@velocut/server run start

