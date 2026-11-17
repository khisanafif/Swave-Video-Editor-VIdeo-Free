#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const webDistDir = path.join(rootDir, 'apps/web/dist');
const outRoot = path.join(rootDir, 'dist-standalone');
const bundleDir = path.join(outRoot, 'VeloCut-Studio-OnDevice');

function run(cmd, cwd = rootDir, extraEnv = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

run('npm --workspace=@velocut/shared run build', rootDir);
run('npm --workspace=@velocut/web run build', rootDir, {
  VITE_STANDALONE_BUILD: 'true',
});

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(bundleDir, { recursive: true });
fs.cpSync(webDistDir, path.join(bundleDir, 'web'), { recursive: true });

const serveScript = `#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
const port = Number(process.env.PORT || 4173);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  const raw = (req.url || '/').split('?')[0];
  const rel = raw === '/' ? 'index.html' : decodeURIComponent(raw).replace(/^\\/+/, '');
  let target = path.resolve(root, rel);
  if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    target = path.join(root, 'index.html');
  }
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
  });
  fs.createReadStream(target).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  const url = \`http://localhost:\${port}\`;
  console.log(\`VeloCut Studio (On-Device Mandiri) berjalan di \${url}\`);
  console.log('Semua proses editing, AI subtitle, dan ekspor berlangsung di perangkat Anda sendiri.');
  console.log('Tekan Ctrl+C untuk menutup.');
  const openCmd =
    process.platform === 'win32'
      ? \`start "" "\${url}"\`
      : process.platform === 'darwin'
        ? \`open "\${url}"\`
        : \`xdg-open "\${url}"\`;
  exec(openCmd, () => {});
});
`;

fs.writeFileSync(path.join(bundleDir, 'serve-ondevice.mjs'), serveScript, 'utf8');

const batLauncher = `@echo off
title VeloCut Studio - Mode Mandiri (100%% Di Perangkat)
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node serve-ondevice.mjs
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:4173"
  python -m http.server 4173 --directory web
  goto :eof
)
echo [INFO] Membutuhkan Node.js atau Python 3 untuk membuka server statis lokal.
pause
`;
fs.writeFileSync(
  path.join(bundleDir, 'Jalankan-Di-Perangkat.bat'),
  batLauncher.replace(/\n/g, '\r\n'),
  'utf8'
);

const shLauncher = `#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  node serve-ondevice.mjs
elif command -v python3 >/dev/null 2>&1; then
  echo "Membuka VeloCut Mandiri di http://localhost:4173 ..."
  (sleep 1 && (xdg-open "http://localhost:4173" || open "http://localhost:4173") >/dev/null 2>&1) &
  python3 -m http.server 4173 --directory web
else
  echo "[ERROR] Pasang Node.js atau Python 3 terlebih dahulu."
  exit 1
fi
`;
const shPath = path.join(bundleDir, 'jalankan-di-perangkat.sh');
fs.writeFileSync(shPath, shLauncher, 'utf8');
fs.chmodSync(shPath, 0o755);

const readmeTxt = `VeloCut Studio - Paket Portabel Mandiri (100% On-Device)
=======================================================
Semua proses (preview WebGL2, AI Whisper subtitle, potong video, & ekspor MP4)
berjalan 100% langsung di perangkat ini tanpa perlu PC server lain maupun npm install.

Cara Menjalankan:
- Windows      : Klik ganda "Jalankan-Di-Perangkat.bat"
- Linux / macOS: Jalankan "./jalankan-di-perangkat.sh"

Lalu buka browser Chrome / Edge / Safari ke http://localhost:4173
(Klik menu browser -> "Instal aplikasi" agar menjadi aplikasi desktop mandiri).
`;
fs.writeFileSync(path.join(bundleDir, 'CARA-PAKAI.txt'), readmeTxt, 'utf8');

console.log(`\nStandalone On-Device bundle created cleanly at:\n  ${bundleDir}`);
