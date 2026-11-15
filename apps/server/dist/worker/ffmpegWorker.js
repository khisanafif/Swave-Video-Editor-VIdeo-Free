import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_CHUNK_SIZE_BYTES, MAX_CLOUDFLARE_CHUNK_BYTES, } from '@velocut/shared';
import { resolveSafeStoragePath } from '../utils/pathSecurity.js';
import { buildFfmpegRenderPlan } from './ffmpegPlanner.js';
const execFileAsync = promisify(execFile);
const requireModule = createRequire(import.meta.url);
function resolveFfmpegBinary() {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }
    try {
        const staticPath = requireModule('ffmpeg-static');
        if (staticPath && fs.existsSync(staticPath)) {
            return staticPath;
        }
    }
    catch {
        // Fallback to system PATH
    }
    return 'ffmpeg';
}
async function canInitializeEncoder(ffmpegBin, encoder) {
    if (encoder === 'libx264')
        return true;
    try {
        await execFileAsync(ffmpegBin, [
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
        ], { timeout: 2500 });
        return true;
    }
    catch {
        return false;
    }
}
async function fileHasAudioStream(ffmpegBin, filePath) {
    try {
        await execFileAsync(ffmpegBin, ['-hide_banner', '-i', filePath], {
            timeout: 2500,
        });
        return true;
    }
    catch (err) {
        const stderr = err?.stderr || '';
        if (stderr.includes('Stream #')) {
            return /Stream #\d+:\d+.*Audio:/i.test(stderr);
        }
        return false;
    }
}
let cachedProbe = null;
export async function probeFfmpegCapabilities(force = false) {
    const now = Date.now();
    if (!force && cachedProbe && now - cachedProbe.checkedAt < 30_000) {
        return {
            ffmpegAvailable: cachedProbe.ffmpegAvailable,
            ffmpegVersion: cachedProbe.ffmpegVersion,
            availableEncoders: cachedProbe.availableEncoders,
            preferredEncoder: cachedProbe.availableEncoders[0] ?? null,
        };
    }
    const ffmpegBin = resolveFfmpegBinary();
    try {
        const { stdout: versionOut } = await execFileAsync(ffmpegBin, ['-version'], {
            timeout: 4000,
        });
        const firstLine = versionOut.split(/\r?\n/)[0] ?? 'ffmpeg available';
        const { stdout: encodersOut } = await execFileAsync(ffmpegBin, ['-hide_banner', '-encoders'], { timeout: 4000 });
        const priorityOrder = [
            'h264_nvenc',
            'h264_vaapi',
            'h264_qsv',
            'libx264',
        ];
        const listedEncoders = priorityOrder.filter((enc) => encodersOut.includes(enc));
        const verifiedEncoders = [];
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
        };
    }
    catch {
        cachedProbe = {
            checkedAt: now,
            ffmpegBin,
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
export async function getServerCapabilities(storageDir) {
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
export async function enqueueServerRenderJob(options) {
    const { db, storageDir, jobId, project, quality, preferredEncoder } = options;
    const probe = await probeFfmpegCapabilities();
    const ffmpegBin = cachedProbe?.ffmpegBin || resolveFfmpegBinary();
    const encoder = (preferredEncoder && probe.availableEncoders.includes(preferredEncoder)
        ? preferredEncoder
        : probe.preferredEncoder) ?? 'libx264';
    const outputRelativePath = `renders/${jobId}.mp4`;
    const outputFullPath = resolveSafeStoragePath(storageDir, outputRelativePath);
    fs.mkdirSync(path.dirname(outputFullPath), { recursive: true });
    // Clone project and verify actual audio streams on disk so video-only files
    // never cause FFmpeg ":a matches no streams" errors
    const sanitizedProject = structuredClone(project);
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
    const plan = buildFfmpegRenderPlan({
        project: sanitizedProject,
        outputPath: outputFullPath,
        encoder,
        quality,
        resolveAssetPath: (assetId) => {
            const row = db.getMediaAsset(assetId);
            if (!row)
                return null;
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
            error: 'Native ffmpeg binary was not found on the server PATH. Install FFmpeg (with NVENC/VAAPI or libx264) on the local host server to run server-side renders.',
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
        child.stdout.on('data', (chunk) => {
            const text = chunk.toString('utf8');
            const match = /out_time_ms=(\d+)/.exec(text);
            if (match) {
                const outMs = Number(match[1]) / 1000;
                const pct = Math.max(1, Math.min(99, Math.round((outMs / totalMs) * 100)));
                db.updateRenderJob(jobId, { progress: pct });
            }
        });
        child.stderr.on('data', (chunk) => {
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
            }
            else {
                db.updateRenderJob(jobId, {
                    status: 'failed',
                    error: stderrBuffer || `FFmpeg exited with status code ${code}`,
                });
            }
        });
    });
}
