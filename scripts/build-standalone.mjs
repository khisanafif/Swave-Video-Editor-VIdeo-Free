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
const bundleDir = path.join(outRoot, 'SWAVE-Video-OnDevice');

function run(cmd, cwd = rootDir, extraEnv = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

run('npm --workspace=@swave/shared run build', rootDir);
run('npm --workspace=@swave/web run build', rootDir, {
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
  console.log(\`SWAVE Video (On-Device Mode) running at \${url}\`);
  console.log('All editing, AI subtitles, and export run locally on your device.');
  console.log('Press Ctrl+C to stop.');
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
title SWAVE Video - On-Device Mode (100%% Local)
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
echo [INFO] Node.js or Python 3 is required to start the local static viewer.
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
  echo "Opening SWAVE Video (On-Device) at http://localhost:4173 ..."
  (sleep 1 && (xdg-open "http://localhost:4173" || open "http://localhost:4173") >/dev/null 2>&1) &
  python3 -m http.server 4173 --directory web
else
  echo "[ERROR] Please install Node.js or Python 3 first."
  exit 1
fi
`;
const shPath = path.join(bundleDir, 'jalankan-di-perangkat.sh');
fs.writeFileSync(shPath, shLauncher, 'utf8');
fs.chmodSync(shPath, 0o755);

const readmeTxt = `SWAVE Video (Self-Hosted & Web-Native Visual Editor) - Portable On-Device Bundle
===============================================================================
Semua proses (preview WebGL2, AI Whisper subtitle, edit video, & ekspor MP4)
berjalan 100% langsung di perangkat ini tanpa perlu server PC maupun npm install.
(All processing runs 100% locally on your device — no server or npm install needed.)

Cara Menjalankan / How to Run:
- Windows      : Double-click "Jalankan-Di-Perangkat.bat"
- Linux / macOS: Run "./jalankan-di-perangkat.sh"

Open http://localhost:4173 in Chrome / Edge / Safari.
`;
fs.writeFileSync(path.join(bundleDir, 'README-HOW-TO-RUN.txt'), readmeTxt, 'utf8');

console.log(`\nStandalone On-Device bundle created cleanly at:\n  ${bundleDir}`);
