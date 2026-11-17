import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  Clip,
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
import {
  buildAssSubtitleDocument,
  buildFfmpegRenderPlan,
} from './ffmpegPlanner.js';

const execFileAsync = promisify(execFile);
const requireModule = createRequire(import.meta.url);

export function resolveFfmpegBinary(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  try {
    const staticPath = requireModule('ffmpeg-static') as string | null;
    if (staticPath && fs.existsSync(staticPath)) {
      return staticPath;
    }
  } catch {
    // Fallback to system PATH
  }
  return 'ffmpeg';
}

async function canInitializeEncoder(
  ffmpegBin: string,
  encoder: ServerEncoderCapability
): Promise<boolean> {
  if (encoder === 'libx264') return true;
  try {
    await execFileAsync(
      ffmpegBin,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=64x64:d=0.04',
        '-frames:v',
        '1',
        '-c:v',
        encoder,
        '-f',
        'null',
        '-',
      ],
      { timeout: 2500 }
    );
    return true;
  } catch {
    return false;
  }
}

async function fileHasAudioStream(
  ffmpegBin: string,
  filePath: string
): Promise<boolean> {
  try {
    await execFileAsync(ffmpegBin, ['-hide_banner', '-i', filePath], {
      timeout: 2500,
    });
    return true;
  } catch (err) {
    const stderr = (err as { stderr?: string })?.stderr || '';
    if (stderr.includes('Stream #')) {
      return /Stream #\d+:\d+.*Audio:/i.test(stderr);
    }
    return false;
  }
}

export async function detectLocalWhisperEngine(): Promise<string | null> {
  try {
    await execFileAsync('whisper-cli', ['--help'], { timeout: 1500 });
    return 'whisper-cli';
  } catch {
    // Not installed
  }
  try {
    await execFileAsync(
      'python3',
      ['-c', 'import faster_whisper; print("ok")'],
      { timeout: 2000 }
    );
    return 'python-faster-whisper';
  } catch {
    // Not installed
  }
  try {
    await execFileAsync('whisper', ['--help'], { timeout: 2000 });
    return 'openai-whisper-cli';
  } catch {
    // Not installed
  }
  return null;
}

let cachedProbe: {
  checkedAt: number;
  ffmpegBin: string;
  ffmpegAvailable: boolean;
  ffmpegVersion: string | null;
  availableEncoders: ServerEncoderCapability[];
  supportsDrawtext: boolean;
  supportsAss: boolean;
  whisperEngine: string | null;
} | null = null;

export async function probeFfmpegCapabilities(
  force = false
): Promise<
  Omit<
    ServerCapabilities,
    | 'status'
    | 'version'
    | 'maxChunkSizeBytes'
    | 'recommendedChunkSizeBytes'
    | 'storageDir'
  > & {
    supportsDrawtext: boolean;
    supportsAss: boolean;
  }
> {
  const now = Date.now();
  if (!force && cachedProbe && now - cachedProbe.checkedAt < 30_000) {
    return {
      ffmpegAvailable: cachedProbe.ffmpegAvailable,
      ffmpegVersion: cachedProbe.ffmpegVersion,
      availableEncoders: cachedProbe.availableEncoders,
      preferredEncoder: cachedProbe.availableEncoders[0] ?? null,
      whisperAvailable: Boolean(cachedProbe.whisperEngine),
      whisperEngine: cachedProbe.whisperEngine,
      supportsDrawtext: cachedProbe.supportsDrawtext,
      supportsAss: cachedProbe.supportsAss,
    };
  }

  const ffmpegBin = resolveFfmpegBinary();
  const whisperEngine = await detectLocalWhisperEngine();

  try {
    const { stdout: versionOut } = await execFileAsync(
      ffmpegBin,
      ['-version'],
      {
        timeout: 4000,
      }
    );
    const firstLine = versionOut.split(/\r?\n/)[0] ?? 'ffmpeg available';

    const [{ stdout: encodersOut }, { stdout: filtersOut }] = await Promise.all([
      execFileAsync(ffmpegBin, ['-hide_banner', '-encoders'], { timeout: 4000 }),
      execFileAsync(ffmpegBin, ['-hide_banner', '-filters'], { timeout: 4000 }),
    ]);

    const supportsDrawtext = /\bdrawtext\b/.test(filtersOut);
    const supportsAss = /\bass\b/.test(filtersOut);

    const priorityOrder: ServerEncoderCapability[] = [
      'h264_nvenc',
      'h264_vaapi',
      'h264_qsv',
      'libx264',
    ];
    const listedEncoders = priorityOrder.filter((enc) =>
      encodersOut.includes(enc)
    );

    const verifiedEncoders: ServerEncoderCapability[] = [];
    for (const enc of listedEncoders) {
      if (await canInitializeEncoder(ffmpegBin, enc)) {
        verifiedEncoders.push(enc);
      }
    }
    if (verifiedEncoders.length === 0) {
      verifiedEncoders.push('libx264');
    }

    cachedProbe = {
      checkedAt: now,
      ffmpegBin,
      ffmpegAvailable: true,
      ffmpegVersion: firstLine.trim(),
      availableEncoders: verifiedEncoders,
      supportsDrawtext,
      supportsAss,
      whisperEngine,
    };
  } catch {
    cachedProbe = {
      checkedAt: now,
      ffmpegBin,
      ffmpegAvailable: false,
      ffmpegVersion: null,
      availableEncoders: [],
      supportsDrawtext: false,
      supportsAss: false,
      whisperEngine,
    };
  }

  return {
    ffmpegAvailable: cachedProbe.ffmpegAvailable,
    ffmpegVersion: cachedProbe.ffmpegVersion,
    availableEncoders: cachedProbe.availableEncoders,
    preferredEncoder: cachedProbe.availableEncoders[0] ?? null,
    whisperAvailable: Boolean(cachedProbe.whisperEngine),
    whisperEngine: cachedProbe.whisperEngine,
    supportsDrawtext: cachedProbe.supportsDrawtext,
    supportsAss: cachedProbe.supportsAss,
  };
}

export async function getServerCapabilities(
  storageDir: string
): Promise<ServerCapabilities> {
  const probe = await probeFfmpegCapabilities();
  return {
    status: 'online',
    version: '0.2.0',
    ffmpegAvailable: probe.ffmpegAvailable,
    ffmpegVersion: probe.ffmpegVersion,
    availableEncoders: probe.availableEncoders,
    preferredEncoder: probe.preferredEncoder,
    whisperAvailable: probe.whisperAvailable,
    whisperEngine: probe.whisperEngine,
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
  const ffmpegBin = cachedProbe?.ffmpegBin || resolveFfmpegBinary();

  const encoder: ServerEncoderCapability =
    (preferredEncoder && probe.availableEncoders.includes(preferredEncoder)
      ? preferredEncoder
      : probe.preferredEncoder) ?? 'libx264';

  const outputRelativePath = `renders/${jobId}.mp4`;
  const outputFullPath = resolveSafeStoragePath(storageDir, outputRelativePath);
  fs.mkdirSync(path.dirname(outputFullPath), { recursive: true });

  const sanitizedProject: ProjectDocument = structuredClone(project);
  if (probe.ffmpegAvailable) {
    for (const asset of Object.values(sanitizedProject.assets)) {
      if (asset.kind === 'video' && asset.hasAudio) {
        const row = db.getMediaAsset(asset.serverAssetId || asset.id);
        if (row) {
          const fullPath = resolveSafeStoragePath(storageDir, row.relativePath);
          if (fs.existsSync(fullPath)) {
            asset.hasAudio = await fileHasAudioStream(ffmpegBin, fullPath);
          }
        }
      }
    }
  }

  // Collect unmuted text/subtitle clips
  const activeTextClips: Clip[] = [];
  for (const tid of sanitizedProject.trackOrder) {
    const tr = sanitizedProject.tracks[tid];
    if (!tr || tr.isMuted) continue;
    for (const cid of tr.clipIds) {
      const clip = sanitizedProject.clips[cid];
      if (clip && clip.type === 'text' && clip.textStyle && clip.duration > 0) {
        activeTextClips.push(clip);
      }
    }
  }

  let assFullPath: string | undefined;
  if (activeTextClips.length > 0 && probe.supportsAss) {
    assFullPath = resolveSafeStoragePath(storageDir, `renders/${jobId}.ass`);
    const assDoc = buildAssSubtitleDocument(sanitizedProject, activeTextClips);
    fs.writeFileSync(assFullPath, assDoc, 'utf8');
  }

  const plan = buildFfmpegRenderPlan({
    project: sanitizedProject,
    outputPath: outputFullPath,
    encoder,
    quality,
    assFilePath: assFullPath,
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
    const child = spawn(ffmpegBin, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrBuffer = '';
    const totalMs = Math.max(1000, plan.totalDuration * 1000);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const match = /out_time_ms=(\d+)/.exec(text);
      if (match) {
        const outMs = Number(match[1]) / 1000;
        const pct = Math.max(
          1,
          Math.min(99, Math.round((outMs / totalMs) * 100))
        );
        db.updateRenderJob(jobId, { progress: pct });
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer = (stderrBuffer + chunk.toString('utf8')).slice(-4000);
    });

    child.on('error', (err) => {
      if (assFullPath && fs.existsSync(assFullPath)) {
        fs.rmSync(assFullPath, { force: true });
      }
      db.updateRenderJob(jobId, {
        status: 'failed',
        error: `FFmpeg process error: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      if (assFullPath && fs.existsSync(assFullPath)) {
        fs.rmSync(assFullPath, { force: true });
      }
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
