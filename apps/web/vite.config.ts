import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const ORT_RUNTIME_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];

function findOrtDistDir(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../node_modules/onnxruntime-web/dist'),
    path.resolve(__dirname, 'node_modules/onnxruntime-web/dist'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/**
 * Serves and bundles ONNX Runtime Web (.mjs + .wasm) under `/ort/` on the same origin
 * so Whisper AI in GitHub Pages, Capacitor APK, and Offline bundles works without external CDN dependency.
 */
function ortAssetsPlugin(): Plugin {
  const sendOrtFile = (
    reqUrl: string | undefined,
    res: { setHeader: (k: string, v: string) => void; end: (buf: Buffer) => void },
    next: () => void
  ) => {
    const cleanPath = (reqUrl || '').split('?')[0];
    const ortIdx = cleanPath.indexOf('/ort/');
    if (ortIdx < 0) return next();
    const filename = path.basename(cleanPath.slice(ortIdx + 5));
    if (!ORT_RUNTIME_FILES.includes(filename)) return next();

    const ortDir = findOrtDistDir();
    if (!ortDir) return next();
    const fullPath = path.join(ortDir, filename);
    if (!fs.existsSync(fullPath)) return next();

    res.setHeader(
      'Content-Type',
      filename.endsWith('.wasm')
        ? 'application/wasm'
        : 'application/javascript; charset=utf-8'
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.end(fs.readFileSync(fullPath));
  };

  return {
    name: 'swave-ort-runtime-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) =>
        sendOrtFile(req.url, res, next)
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) =>
        sendOrtFile(req.url, res, next)
      );
    },
    writeBundle(options) {
      const outDir = options.dir || path.resolve(__dirname, 'dist');
      const ortDir = findOrtDistDir();
      if (!ortDir) return;
      const targetOrtDir = path.join(outDir, 'ort');
      fs.mkdirSync(targetOrtDir, { recursive: true });
      for (const file of ORT_RUNTIME_FILES) {
        const src = path.join(ortDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(targetOrtDir, file));
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), ortAssetsPlugin()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  server: {
    port: 5173,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/testSetup.ts'],
  },
});
