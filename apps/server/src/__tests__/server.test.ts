import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ProjectDocument } from '@velocut/shared';
import { createServerApp } from '../app.js';

const tempDirs: string[] = [];
const openApps: FastifyInstance[] = [];

async function createTestServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velocut-srv-test-'));
  tempDirs.push(dir);
  const created = await createServerApp({ storageDir: dir });
  openApps.push(created.app);
  return created;
}

afterEach(async () => {
  while (openApps.length > 0) {
    const app = openApps.pop()!;
    await app.close();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

describe('VeloCut Local Server API', () => {
  it('sets COOP/COEP headers on health and API responses', async () => {
    const { app } = await createTestServer();

    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(res.json().status).toBe('ok');
  });

  it('assembles multi-chunk binary uploads in order and streams byte ranges safely', async () => {
    const { app } = await createTestServer();

    const chunk0 = Buffer.from('VELOCUT-CHUNK-ZERO-');
    const chunk1 = Buffer.from('AND-CHUNK-ONE-DATA');
    const fullBuffer = Buffer.concat([chunk0, chunk1]);

    const initRes = await app.inject({
      method: 'POST',
      url: '/api/upload/init',
      payload: {
        filename: '../../evil/demo clip.mp4',
        mimeType: 'video/mp4',
        totalSize: fullBuffer.length,
        chunkSize: chunk0.length,
        totalChunks: 2,
        kind: 'video',
        duration: 5.5,
      },
    });
    expect(initRes.statusCode).toBe(201);
    const { uploadId, assetId } = initRes.json();

    // Upload chunk 1 first, then chunk 0 (testing out-of-order upload resilience)
    const c1Res = await app.inject({
      method: 'PUT',
      url: `/api/upload/chunk?uploadId=${uploadId}&chunkIndex=1`,
      headers: { 'content-type': 'application/octet-stream' },
      payload: chunk1,
    });
    expect(c1Res.statusCode).toBe(200);

    const c0Res = await app.inject({
      method: 'PUT',
      url: `/api/upload/chunk?uploadId=${uploadId}&chunkIndex=0`,
      headers: { 'content-type': 'application/octet-stream' },
      payload: chunk0,
    });
    expect(c0Res.statusCode).toBe(200);

    const statusRes = await app.inject({
      method: 'GET',
      url: `/api/upload/status/${uploadId}`,
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().receivedChunks).toEqual([0, 1]);

    const completeRes = await app.inject({
      method: 'POST',
      url: '/api/upload/complete',
      payload: { uploadId },
    });
    expect(completeRes.statusCode).toBe(200);
    const completed = completeRes.json();
    expect(completed.assetId).toBe(assetId);
    expect(completed.size).toBe(fullBuffer.length);
    expect(completed.filename).toBe('demo clip.mp4');

    // Full download
    const mediaRes = await app.inject({
      method: 'GET',
      url: completed.mediaUrl,
    });
    expect(mediaRes.statusCode).toBe(200);
    expect(mediaRes.headers['accept-ranges']).toBe('bytes');
    expect(mediaRes.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(mediaRes.rawPayload.equals(fullBuffer)).toBe(true);

    // Partial Range request
    const rangeRes = await app.inject({
      method: 'GET',
      url: completed.mediaUrl,
      headers: { range: 'bytes=0-6' },
    });
    expect(rangeRes.statusCode).toBe(206);
    expect(rangeRes.headers['content-range']).toBe(
      `bytes 0-6/${fullBuffer.length}`
    );
    expect(rangeRes.rawPayload.toString('utf8')).toBe('VELOCUT');

    // Traversal protection (both router-normalized and encoded .. segments)
    const normalizedTraversal = await app.inject({
      method: 'GET',
      url: '/media/../../etc/passwd',
    });
    expect([403, 404]).toContain(normalizedTraversal.statusCode);

    const encodedTraversal = await app.inject({
      method: 'GET',
      url: '/media/assets/..%2f..%2fetc/passwd',
    });
    expect(encodedTraversal.statusCode).toBe(403);
  });

  it('persists, lists, and deletes project documents in SQLite WAL', async () => {
    const { app } = await createTestServer();

    const sampleProject: ProjectDocument = {
      id: 'proj-alpha',
      name: 'VeloCut Demo Edit',
      resolution: { width: 1920, height: 1080, fps: 30, label: '1080p' },
      trackOrder: ['track-1'],
      tracks: {
        'track-1': {
          id: 'track-1',
          type: 'video',
          name: 'Video Utama',
          isMuted: false,
          isLocked: false,
          clipIds: [],
        },
      },
      clips: {},
      assets: {},
      updatedAt: new Date().toISOString(),
    };

    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/projects/proj-alpha',
      payload: sampleProject,
    });
    expect(putRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/projects/proj-alpha',
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe('VeloCut Demo Edit');

    const listRes = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(1);

    const delRes = await app.inject({
      method: 'DELETE',
      url: '/api/projects/proj-alpha',
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().deleted).toBe(true);
  });

  it('exposes LAN network endpoints and serves the static web SPA bundle with COOP/COEP headers', async () => {
    const webDist = fs.mkdtempSync(path.join(os.tmpdir(), 'velocut-webdist-'));
    tempDirs.push(webDist);
    fs.writeFileSync(
      path.join(webDist, 'index.html'),
      '<!doctype html><html><body>VeloCut SPA</body></html>'
    );

    const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'velocut-srv-test-'));
    tempDirs.push(storageDir);
    const created = await createServerApp({ storageDir, webDistDir: webDist });
    openApps.push(created.app);

    const netRes = await created.app.inject({
      method: 'GET',
      url: '/api/network',
    });
    expect(netRes.statusCode).toBe(200);
    expect(netRes.json()).toHaveProperty('hostname');
    expect(Array.isArray(netRes.json().endpoints)).toBe(true);

    const spaRes = await created.app.inject({
      method: 'GET',
      url: '/?project=proj-alpha',
    });
    expect(spaRes.statusCode).toBe(200);
    expect(spaRes.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(spaRes.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(spaRes.body).toContain('VeloCut SPA');
  });

  it('detects bundled FFmpeg and completes a server-side MP4 render job end-to-end', async () => {
    const { app } = await createTestServer();

    const capsRes = await app.inject({ method: 'GET', url: '/api/capabilities' });
    expect(capsRes.statusCode).toBe(200);
    const caps = capsRes.json();
    expect(caps.ffmpegAvailable).toBe(true);
    expect(caps.preferredEncoder).toBeTruthy();

    const project: ProjectDocument = {
      id: 'proj-render-e2e',
      name: 'Server Render Test',
      resolution: { width: 320, height: 180, fps: 15, label: '320p' },
      trackOrder: ['track-2'],
      tracks: {
        'track-2': {
          id: 'track-2',
          type: 'text',
          name: 'Teks',
          isMuted: false,
          isLocked: false,
          clipIds: ['clip-txt-1'],
        },
      },
      clips: {
        'clip-txt-1': {
          id: 'clip-txt-1',
          trackId: 'track-2',
          assetId: 'text',
          type: 'text',
          name: 'Halo CapCut',
          start: 0,
          duration: 1.0,
          offset: 0,
          transforms: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          effects: [],
          textStyle: {
            content: 'VELOCUT FREE',
            fontFamily: 'Inter, sans-serif',
            fontSize: 32,
            color: '#facc15',
            backgroundColor: 'transparent',
            align: 'center',
            bold: true,
            shadow: true,
            strokeColor: '#000000',
            strokeWidth: 6,
          },
        },
      },
      assets: {},
      updatedAt: new Date().toISOString(),
    };

    const startRes = await app.inject({
      method: 'POST',
      url: '/api/render/jobs',
      payload: { project, quality: 'draft' },
    });
    expect(startRes.statusCode).toBe(202);
    const jobId = startRes.json().id;

    let finalJob = startRes.json();
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const pollRes = await app.inject({
        method: 'GET',
        url: `/api/render/jobs/${jobId}`,
      });
      finalJob = pollRes.json();
      if (finalJob.status === 'completed' || finalJob.status === 'failed') {
        break;
      }
    }

    expect(finalJob.error).toBeNull();
    expect(finalJob.status).toBe('completed');
    expect(finalJob.progress).toBe(100);
    expect(finalJob.outputUrl).toContain(`/media/renders/${jobId}.mp4`);
  }, 15000);

  it('exposes subtitle transcription capabilities and detects speech bursts via server VAD', async () => {
    const { app } = await createTestServer();

    const capsRes = await app.inject({
      method: 'GET',
      url: '/api/subtitles/capabilities',
    });
    expect(capsRes.statusCode).toBe(200);
    expect(Array.isArray(capsRes.json().providers)).toBe(true);

    // Create a valid 2.5s 16kHz mono PCM WAV with speech burst from 0.4s..1.4s
    const sampleRate = 16000;
    const numSamples = Math.floor(sampleRate * 2.5);
    const wav = Buffer.alloc(44 + numSamples * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + numSamples * 2, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(numSamples * 2, 40);

    for (let i = Math.floor(0.4 * sampleRate); i < Math.floor(1.4 * sampleRate); i++) {
      const sample = Math.round(
        0.5 * 32767 * Math.sin((2 * Math.PI * 220 * i) / sampleRate)
      );
      wav.writeInt16LE(sample, 44 + i * 2);
    }

    const sttRes = await app.inject({
      method: 'POST',
      url: '/api/subtitles/transcribe',
      payload: {
        audioBase64: wav.toString('base64'),
        provider: 'vad',
        language: 'id',
      },
    });
    expect(sttRes.statusCode).toBe(200);
    const body = sttRes.json();
    expect(body.engine).toBe('server-vad');
    expect(body.cues.length).toBeGreaterThanOrEqual(1);
    expect(body.cues[0].start).toBeGreaterThanOrEqual(0.3);
    expect(body.cues[0].end).toBeGreaterThan(body.cues[0].start);
  });
});

