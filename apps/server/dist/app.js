import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { VeloCutDatabase } from './db/database.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerNetworkRoutes } from './routes/network.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerRenderRoutes } from './routes/render.js';
import { registerUploadRoutes } from './routes/upload.js';
import { resolveSafeStoragePath } from './utils/pathSecurity.js';
const STATIC_MIME_MAP = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.woff2': 'font/woff2',
};
function resolveDefaultWebDistDir() {
    if (process.env.WEB_DIST_DIR) {
        return path.resolve(process.env.WEB_DIST_DIR);
    }
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(currentDir, '../../web/dist');
}
export async function createServerApp(options = {}) {
    const storageDir = path.resolve(options.storageDir ||
        process.env.MEDIA_STORAGE_DIR ||
        path.join(process.cwd(), 'storage'));
    const dbPath = options.dbPath ||
        process.env.VELOCUT_DB_PATH ||
        path.join(storageDir, 'velocut.sqlite');
    const webDistDir = options.webDistDir
        ? path.resolve(options.webDistDir)
        : resolveDefaultWebDistDir();
    const port = options.port || Number(process.env.PORT || 3000);
    fs.mkdirSync(storageDir, { recursive: true });
    const db = new VeloCutDatabase(dbPath);
    const app = Fastify({
        logger: options.logger ?? false,
        bodyLimit: 55 * 1024 * 1024,
    });
    await app.register(cors, {
        origin: true,
        credentials: true,
    });
    app.addHook('onRequest', async (request, reply) => {
        const rawPath = (request.raw.url || '/').split('?')[0];
        if (rawPath.includes('..') || /%2e%2e/i.test(rawPath)) {
            return reply.code(403).send({ error: 'Access denied.' });
        }
    });
    app.addHook('onSend', async (_req, reply, payload) => {
        reply.header('Cross-Origin-Opener-Policy', 'same-origin');
        reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
        if (!reply.getHeader('Cross-Origin-Resource-Policy')) {
            reply.header('Cross-Origin-Resource-Policy', 'same-origin');
        }
        return payload;
    });
    app.get('/api/health', async () => ({
        status: 'ok',
        service: 'velocut-local-server',
        timestamp: new Date().toISOString(),
    }));
    registerNetworkRoutes(app, db, port);
    registerUploadRoutes(app, db, storageDir);
    registerMediaRoutes(app, db, storageDir);
    registerProjectRoutes(app, db);
    registerRenderRoutes(app, db, storageDir);
    // Serve built Frontend Web App (apps/web/dist) with SPA fallback so any device
    // on the WiFi/LAN can open http://<PC-IP>:3000 directly without needing Nginx.
    app.setNotFoundHandler(async (request, reply) => {
        const rawPath = (request.raw.url || '/').split('?')[0];
        if (request.method !== 'GET' ||
            rawPath.startsWith('/api/') ||
            rawPath.startsWith('/media/')) {
            return reply.code(404).send({ error: 'Not found' });
        }
        if (!fs.existsSync(webDistDir)) {
            return reply.code(404).send({
                error: 'Frontend static build not found. Run "npm run build" or use "npm run dev" during development.',
            });
        }
        const relativeReq = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
        let targetFile = null;
        try {
            const candidate = resolveSafeStoragePath(webDistDir, relativeReq);
            const stat = await fsp.stat(candidate);
            if (stat.isFile()) {
                targetFile = candidate;
            }
        }
        catch {
            targetFile = null;
        }
        if (!targetFile && (rawPath === '/' || rawPath === '/index.html')) {
            const spaIndex = path.join(webDistDir, 'index.html');
            if (fs.existsSync(spaIndex)) {
                targetFile = spaIndex;
            }
        }
        if (!targetFile) {
            return reply.code(404).send({ error: 'Static asset not found' });
        }
        const ext = path.extname(targetFile).toLowerCase();
        reply.header('Content-Type', STATIC_MIME_MAP[ext] || 'application/octet-stream');
        return reply.send(fs.createReadStream(targetFile));
    });
    app.addHook('onClose', async () => {
        db.close();
    });
    return { app, db, storageDir, webDistDir };
}
