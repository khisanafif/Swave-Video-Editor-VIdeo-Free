import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  ProjectDocument,
  ServerCapabilities,
  ServerEncoderCapability,
} from '@velocut/shared';
import {
  DEFAULT_CHUNK_SIZE_BYTES,
  MAX_CLOUDFLARE_CHUNK_BYTES,
} from '@velocut/shared';
import type { VeloCutDatabase } from '../db/database.js';
import { resolveSafeStoragePath } from '../utils/pathSecurity.js';
import { buildFfmpegRenderPlan } from './ffmpegPlanner.js';

const execFileAsync = promisify(execFile);

let cachedProbe: {
  checkedAt: number;
  ffmpegAvailable: boolean;
  ffmpegVersion: string | null;
  availableEncoders: ServerEncoderCapability[];
} | null = null;

export async function probeFfmpegCapabilities(
  force = false
): Promise<Omit<ServerCapabilities, 'status' | 'version' | 'maxChunkSizeBytes' | 'recommendedChunkSizeBytes' | 'storageDir'>> {
  const now = Date.now();
  if (!force && cachedProbe && now - cachedProbe.checkedAt < 30_000) {
    return {
      ffmpegAvailable: cachedProbe.ffmpegAvailable,
      ffmpegVersion: cachedProbe.ffmpegVersion,
      availableEncoders: cachedProbe.availableEncoders,
      preferredEncoder: cachedProbe.availableEncoders[0] ?? null,
    };
  }

  try {
    const { stdout: versionOut } = await execFileAsync('ffmpeg', ['-version'], {
      timeout: 3000,
    });
    const firstLine = versionOut.split(/\r?\n/)[0] ?? 'ffmpeg available';

    const { stdout: encodersOut } = await execFileAsync(
      'ffmpeg',
      ['-hide_banner', '-encoders'],
      { timeout: 3000 }
    );

    const priorityOrder: ServerEncoderCapability[] = [
      'h264_nvenc',
      'h264_vaapi',
      'h264_qsv',
      'libx264',
    ];
    const availableEncoders = priorityOrder.filter((enc) =>
      encodersOut.includes(enc)
    );

    cachedProbe = {
      checkedAt: now,
      ffmpegAvailable: true,
      ffmpegVersion: firstLine.trim(),
      availableEncoders,
    };
  } catch {
    cachedProbe = {
      checkedAt: now,
      ffmpegAvailable: false,
      ffmpegVersion: null,
      availableEncoders: [],
    };
  }

  return {
    ffmpegAvailable: cachedProbe.ffmpegAvailable,
    ffmpegVersion: cachedProbe.ffmpegVersion,
    availableEncoders: cachedProbe.availableEncoders,
    preferredEncoder: cachedProbe.availableEncoders[0] ?? null,
  };
}

export async function getServerCapabilities(
  storageDir: string
): Promise<ServerCapabilities> {
  const probe = await probeFfmpegCapabilities();
  return {
    status: 'online',
    version: '0.1.0',
    ...probe,
    maxChunkSizeBytes: MAX_CLOUDFLARE_CHUNK_BYTES,
    recommendedChunkSizeBytes: DEFAULT_CHUNK_SIZE_BYTES,
    storageDir,
  };
}

export async function enqueueServerRenderJob(options: {
  db: VeloCutDatabase;
  storageDir: string;
  jobId: string;
  project: ProjectDocument;
  quality?: 'draft' | 'standard' | 'high';
  preferredEncoder?: ServerEncoderCapability;
}): Promise<void> {
  const { db, storageDir, jobId, project, quality, preferredEncoder } = options;
  const probe = await probeFfmpegCapabilities();
  const encoder: ServerEncoderCapability =
    (preferredEncoder && probe.availableEncoders.includes(preferredEncoder)
      ? preferredEncoder
      : probe.preferredEncoder) ?? 'libx264';

  const outputRelativePath = `renders/${jobId}.mp4`;
  const outputFullPath = resolveSafeStoragePath(storageDir, outputRelativePath);
  fs.mkdirSync(path.dirname(outputFullPath), { recursive: true });

  const plan = buildFfmpegRenderPlan({
    project,
    outputPath: outputFullPath,
    encoder,
    quality,
    resolveAssetPath: (assetId) => {
      const row = db.getMediaAsset(assetId);
      if (!row) return null;
      const fullPath = resolveSafeStoragePath(storageDir, row.relativePath);
      return fs.existsSync(fullPath) ? fullPath : null;
    },
  });

  const now = new Date().toISOString();
  db.insertRenderJob({
    id: jobId,
    projectId: project.id,
    status: 'queued',
    progress: 0,
    encoder: plan.encoder,
    ffmpegCommand: plan.commandPreview,
    outputRelativePath: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  });

  if (plan.missingAssets.length > 0) {
    db.updateRenderJob(jobId, {
      status: 'failed',
      error: `Missing uploaded server media for asset(s): ${plan.missingAssets.join(', ')}. Upload assets to the local server first before server render.`,
    });
    return;
  }

  if (!probe.ffmpegAvailable) {
    db.updateRenderJob(jobId, {
      status: 'failed',
      error:
        'Native ffmpeg binary was not found on the server PATH. Install FFmpeg (with NVENC/VAAPI or libx264) on the local host server to run server-side renders.',
    });
    return;
  }

  setImmediate(() => {
    db.updateRenderJob(jobId, { status: 'processing', progress: 1 });
    const spawnArgs = ['-progress', 'pipe:1', '-nostats', ...plan.args];
    const child = spawn('ffmpeg', spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrBuffer = '';
    const totalMs = Math.max(1000, plan.totalDuration * 1000);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const match = /out_time_ms=(\d+)/.exec(text);
      if (match) {
        const outMs = Number(match[1]) / 1000;
        const pct = Math.max(1, Math.min(99, Math.round((outMs / totalMs) * 100)));
        db.updateRenderJob(jobId, { progress: pct });
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer = (stderrBuffer + chunk.toString('utf8')).slice(-4000);
    });

    child.on('error', (err) => {
      db.updateRenderJob(jobId, {
        status: 'failed',
        error: `FFmpeg process error: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputFullPath)) {
        db.updateRenderJob(jobId, {
          status: 'completed',
          progress: 100,
          outputRelativePath,
          error: null,
        });
      } else {
        db.updateRenderJob(jobId, {
          status: 'failed',
          error: stderrBuffer || `FFmpeg exited with status code ${code}`,
        });
      }
    });
  });
}

