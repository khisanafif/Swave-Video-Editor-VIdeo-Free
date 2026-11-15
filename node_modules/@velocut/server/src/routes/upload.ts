import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  DEFAULT_CHUNK_SIZE_BYTES,
  MAX_CLOUDFLARE_CHUNK_BYTES,
  type ChunkUploadCompleteResponse,
  type ChunkUploadInitRequest,
  type ChunkUploadInitResponse,
  type ChunkUploadStatusResponse,
} from '@velocut/shared';
import type { VeloCutDatabase } from '../db/database.js';
import { resolveSafeStoragePath, sanitizeFilename } from '../utils/pathSecurity.js';

export function registerUploadRoutes(
  app: FastifyInstance,
  db: VeloCutDatabase,
  storageDir: string
): void {
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: MAX_CLOUDFLARE_CHUNK_BYTES },
    (_req, body, done) => {
      done(null, body);
    }
  );

  app.post<{ Body: ChunkUploadInitRequest }>(
    '/api/upload/init',
    async (request, reply) => {
      const body = request.body;
      if (
        !body ||
        typeof body.filename !== 'string' ||
        !Number.isFinite(body.totalSize) ||
        body.totalSize <= 0
      ) {
        return reply
          .code(400)
          .send({ error: 'Invalid filename or totalSize in upload init request.' });
      }

      const chunkSize = Math.min(
        MAX_CLOUDFLARE_CHUNK_BYTES,
        Math.max(1, Math.round(body.chunkSize || DEFAULT_CHUNK_SIZE_BYTES))
      );
      const totalChunks = Math.max(
        1,
        Math.ceil(body.totalSize / chunkSize)
      );

      if (totalChunks > 50_000) {
        return reply.code(400).send({
          error: 'Chunk size too small: totalChunks exceeds maximum 50,000.',
        });
      }

      if (body.totalChunks && body.totalChunks !== totalChunks) {
        return reply.code(400).send({
          error: `totalChunks mismatch: expected ${totalChunks}, got ${body.totalChunks}`,
        });
      }

      const uploadId = crypto.randomUUID();
      const assetId = crypto.randomUUID();
      const safeFilename = sanitizeFilename(body.filename);
      const now = new Date().toISOString();

      const chunkDir = resolveSafeStoragePath(storageDir, `chunks/${uploadId}`);
      await fsp.mkdir(chunkDir, { recursive: true });

      db.createUploadSession({
        uploadId,
        assetId,
        filename: safeFilename,
        mimeType: body.mimeType || 'application/octet-stream',
        kind: body.kind || 'video',
        totalSize: body.totalSize,
        chunkSize,
        totalChunks,
        receivedChunks: [],
        status: 'uploading',
        duration: Number(body.duration) || 0,
        width: Number(body.width) || 0,
        height: Number(body.height) || 0,
        createdAt: now,
        updatedAt: now,
      });

      const response: ChunkUploadInitResponse = {
        uploadId,
        assetId,
        chunkSize,
        totalChunks,
        receivedChunks: [],
      };
      return reply.code(201).send(response);
    }
  );

  app.put<{
    Querystring: { uploadId?: string; chunkIndex?: string };
    Body: Buffer;
  }>('/api/upload/chunk', async (request, reply) => {
    const uploadId =
      request.query.uploadId || String(request.headers['x-upload-id'] || '');
    const chunkIndexRaw =
      request.query.chunkIndex ?? String(request.headers['x-chunk-index'] || '');
    const chunkIndex = Number.parseInt(chunkIndexRaw, 10);

    if (!uploadId || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return reply
        .code(400)
        .send({ error: 'Missing or invalid uploadId or chunkIndex.' });
    }

    const session = db.getUploadSession(uploadId);
    if (!session) {
      return reply.code(404).send({ error: 'Upload session not found.' });
    }
    if (session.status !== 'uploading') {
      return reply
        .code(409)
        .send({ error: `Upload session already ${session.status}.` });
    }
    if (chunkIndex >= session.totalChunks) {
      return reply.code(400).send({
        error: `chunkIndex ${chunkIndex} out of bounds (totalChunks=${session.totalChunks}).`,
      });
    }

    const payload = Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(request.body ?? '');

    if (payload.length === 0) {
      return reply.code(400).send({ error: 'Empty chunk payload.' });
    }

    const partPath = resolveSafeStoragePath(
      storageDir,
      `chunks/${uploadId}/${chunkIndex}.part`
    );
    await fsp.mkdir(path.dirname(partPath), { recursive: true });
    await fsp.writeFile(partPath, payload);

    const updatedChunks = Array.from(
      new Set([...session.receivedChunks, chunkIndex])
    ).sort((a, b) => a - b);
    db.updateUploadSessionChunks(uploadId, updatedChunks, 'uploading');

    return reply.send({
      uploadId,
      chunkIndex,
      receivedCount: updatedChunks.length,
      totalChunks: session.totalChunks,
    });
  });

  app.get<{ Params: { uploadId: string } }>(
    '/api/upload/status/:uploadId',
    async (request, reply) => {
      const session = db.getUploadSession(request.params.uploadId);
      if (!session) {
        return reply.code(404).send({ error: 'Upload session not found.' });
      }
      const asset = db.getMediaAsset(session.assetId);
      const response: ChunkUploadStatusResponse = {
        uploadId: session.uploadId,
        assetId: session.assetId,
        filename: session.filename,
        totalSize: session.totalSize,
        totalChunks: session.totalChunks,
        receivedChunks: session.receivedChunks,
        status: session.status,
        mediaUrl: asset ? `/media/${asset.relativePath}` : undefined,
      };
      return reply.send(response);
    }
  );

  app.post<{ Body: { uploadId: string } }>(
    '/api/upload/complete',
    async (request, reply) => {
      const uploadId = request.body?.uploadId;
      if (!uploadId) {
        return reply.code(400).send({ error: 'Missing uploadId.' });
      }

      const session = db.getUploadSession(uploadId);
      if (!session) {
        return reply.code(404).send({ error: 'Upload session not found.' });
      }

      if (session.receivedChunks.length !== session.totalChunks) {
        return reply.code(400).send({
          error: `Incomplete chunks: received ${session.receivedChunks.length} of ${session.totalChunks}`,
          receivedChunks: session.receivedChunks,
        });
      }

      const assetRelativePath = `assets/${session.assetId}_${session.filename}`;
      const outputFullPath = resolveSafeStoragePath(storageDir, assetRelativePath);
      await fsp.mkdir(path.dirname(outputFullPath), { recursive: true });

      const writeStream = fs.createWriteStream(outputFullPath);
      try {
        for (let i = 0; i < session.totalChunks; i++) {
          const partPath = resolveSafeStoragePath(
            storageDir,
            `chunks/${uploadId}/${i}.part`
          );
          await new Promise<void>((resolve, reject) => {
            const readStream = fs.createReadStream(partPath);
            readStream.on('error', reject);
            readStream.on('end', resolve);
            readStream.pipe(writeStream, { end: false });
          });
        }
        await new Promise<void>((resolve, reject) => {
          writeStream.on('error', reject);
          writeStream.on('finish', resolve);
          writeStream.end();
        });
      } catch (err) {
        writeStream.destroy();
        db.updateUploadSessionChunks(uploadId, session.receivedChunks, 'failed');
        return reply.code(500).send({
          error: `Failed to assemble chunks: ${(err as Error).message}`,
        });
      }

      const stat = await fsp.stat(outputFullPath);
      if (stat.size !== session.totalSize) {
        await fsp.rm(outputFullPath, { force: true });
        db.updateUploadSessionChunks(uploadId, session.receivedChunks, 'failed');
        return reply.code(400).send({
          error: `Assembled file size ${stat.size} does not match declared totalSize ${session.totalSize}.`,
        });
      }

      const chunkDir = resolveSafeStoragePath(storageDir, `chunks/${uploadId}`);
      await fsp.rm(chunkDir, { recursive: true, force: true });

      db.insertMediaAsset({
        id: session.assetId,
        filename: session.filename,
        mimeType: session.mimeType,
        size: stat.size,
        relativePath: assetRelativePath,
        kind: session.kind,
        duration: session.duration,
        width: session.width,
        height: session.height,
        createdAt: new Date().toISOString(),
      });
      db.updateUploadSessionChunks(uploadId, session.receivedChunks, 'completed');

      const response: ChunkUploadCompleteResponse = {
        uploadId: session.uploadId,
        assetId: session.assetId,
        filename: session.filename,
        size: stat.size,
        mediaUrl: `/media/${assetRelativePath}`,
      };
      return reply.send(response);
    }
  );
}

