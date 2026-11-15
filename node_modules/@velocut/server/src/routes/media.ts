import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { VeloCutDatabase } from '../db/database.js';
import { resolveSafeStoragePath } from '../utils/pathSecurity.js';

const MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export function registerMediaRoutes(
  app: FastifyInstance,
  db: VeloCutDatabase,
  storageDir: string
): void {
  app.get('/api/assets', async () => {
    const assets = db.listMediaAssets();
    return assets.map((a) => ({
      ...a,
      mediaUrl: `/media/${a.relativePath}`,
    }));
  });

  app.get<{ Params: { '*': string } }>('/media/*', async (request, reply) => {
    const rawWildcard = request.params['*'];
    if (!rawWildcard || rawWildcard.includes('..')) {
      return reply.code(403).send({ error: 'Invalid media path.' });
    }

    let filePath: string;
    try {
      filePath = resolveSafeStoragePath(storageDir, rawWildcard);
    } catch {
      return reply.code(403).send({ error: 'Access denied.' });
    }

    let stat: fs.Stats;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return reply.code(404).send({ error: 'Media file not found.' });
    }

    if (!stat.isFile()) {
      return reply.code(404).send({ error: 'Media file not found.' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    const fileSize = stat.size;
    const rangeHeader = request.headers.range;

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', contentType);
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!match) {
        return reply.code(416).send({ error: 'Malformed Range header.' });
      }
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2]
        ? Math.min(fileSize - 1, Number.parseInt(match[2], 10))
        : fileSize - 1;

      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        start >= fileSize ||
        end < start
      ) {
        reply.header('Content-Range', `bytes */${fileSize}`);
        return reply.code(416).send({ error: 'Requested range not satisfiable.' });
      }

      const chunkLength = end - start + 1;
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      reply.header('Content-Length', chunkLength);
      return reply.send(fs.createReadStream(filePath, { start, end }));
    }

    reply.header('Content-Length', fileSize);
    return reply.send(fs.createReadStream(filePath));
  });
}

