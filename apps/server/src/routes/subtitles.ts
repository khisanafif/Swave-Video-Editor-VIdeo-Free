import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FastifyInstance } from 'fastify';
import type {
  ServerTranscribeRequest,
  ServerTranscribeResponse,
  SubtitleCue,
  SubtitleWord,
} from '@velocut/shared';
import type { VeloCutDatabase } from '../db/database.js';
import { resolveSafeStoragePath } from '../utils/pathSecurity.js';
import {
  probeFfmpegCapabilities,
  resolveFfmpegBinary,
} from '../worker/ffmpegWorker.js';

const execFileAsync = promisify(execFile);

function findWavDataChunk(buf: Buffer): {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
} | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return null;

  let offset = 12;
  let sampleRate = 16000;
  let channels = 1;
  let bitsPerSample = 16;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const payloadStart = offset + 8;

    if (id === 'fmt ' && payloadStart + 16 <= buf.length) {
      channels = buf.readUInt16LE(payloadStart + 2);
      sampleRate = buf.readUInt32LE(payloadStart + 4);
      bitsPerSample = buf.readUInt16LE(payloadStart + 14);
    } else if (id === 'data') {
      return {
        sampleRate: Math.max(8000, sampleRate),
        channels: Math.max(1, channels),
        bitsPerSample: bitsPerSample || 16,
        dataOffset: payloadStart,
        dataLength: Math.min(size, buf.length - payloadStart),
      };
    }

    offset = payloadStart + size + (size % 2);
  }
  return null;
}

export function detectWavSpeechSegmentsVad(wavBuffer: Buffer): SubtitleCue[] {
  const info = findWavDataChunk(wavBuffer);
  if (!info || info.bitsPerSample !== 16) return [];

  const bytesPerFrame = info.channels * 2;
  const totalFrames = Math.floor(info.dataLength / bytesPerFrame);
  if (totalFrames <= 0) return [];

  const windowSec = 0.04; // 40ms frames
  const frameStep = Math.max(1, Math.floor(info.sampleRate * windowSec));
  const energies: number[] = [];

  for (let startFrame = 0; startFrame < totalFrames; startFrame += frameStep) {
    const endFrame = Math.min(totalFrames, startFrame + frameStep);
    let sumSq = 0;
    let count = 0;
    for (let f = startFrame; f < endFrame; f++) {
      const bytePos = info.dataOffset + f * bytesPerFrame;
      if (bytePos + 2 > wavBuffer.length) break;
      const sample = wavBuffer.readInt16LE(bytePos) / 32768;
      sumSq += sample * sample;
      count++;
    }
    energies.push(count > 0 ? Math.sqrt(sumSq / count) : 0);
  }

  if (energies.length === 0) return [];
  const sorted = [...energies].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.2)] || 0.005;
  const peak = sorted[Math.floor(sorted.length * 0.95)] || 0.05;
  const threshold = Math.max(0.015, noiseFloor * 2.4, peak * 0.16);

  const cues: SubtitleCue[] = [];
  let activeStart: number | null = null;
  let silenceRun = 0;
  const hangoverFrames = 7; // ~280ms grace pause

  for (let i = 0; i < energies.length; i++) {
    const isSpeech = energies[i] >= threshold;
    if (isSpeech) {
      if (activeStart === null) {
        activeStart = i * windowSec;
      }
      silenceRun = 0;
    } else if (activeStart !== null) {
      silenceRun++;
      if (silenceRun >= hangoverFrames) {
        const end = Math.max(
          activeStart + 0.3,
          (i - silenceRun + 2) * windowSec
        );
        if (end - activeStart >= 0.25) {
          cues.push({
            start: Number(activeStart.toFixed(3)),
            end: Number(end.toFixed(3)),
            text: '',
          });
        }
        activeStart = null;
        silenceRun = 0;
      }
    }
  }

  if (activeStart !== null) {
    const end = energies.length * windowSec;
    if (end - activeStart >= 0.25) {
      cues.push({
        start: Number(activeStart.toFixed(3)),
        end: Number(end.toFixed(3)),
        text: '',
      });
    }
  }

  return cues;
}

async function runExternalWhisperApi(options: {
  wavBuffer: Buffer;
  provider: 'openai' | 'groq';
  apiKey: string;
  language?: string;
  model?: string;
}): Promise<SubtitleCue[]> {
  const { wavBuffer, provider, apiKey, language, model } = options;
  const endpoint =
    provider === 'groq'
      ? 'https://api.groq.com/openai/v1/audio/transcriptions'
      : 'https://api.openai.com/v1/audio/transcriptions';
  const resolvedModel =
    model || (provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1');

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }),
    'audio.wav'
  );
  form.append('model', resolvedModel);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('timestamp_granularities[]', 'word');
  if (language && language !== 'auto') {
    form.append('language', language);
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `${provider.toUpperCase()} Whisper error (${res.status}): ${errText.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as {
    text?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
    words?: Array<{ word: string; start: number; end: number }>;
  };

  const allWords: SubtitleWord[] = Array.isArray(data.words)
    ? data.words
        .filter((w) => typeof w.word === 'string' && Number.isFinite(w.start))
        .map((w) => ({
          word: w.word.trim(),
          start: Number(w.start),
          end: Number(w.end ?? w.start + 0.25),
        }))
    : [];

  if (Array.isArray(data.segments) && data.segments.length > 0) {
    return data.segments
      .map((seg) => {
        const segStart = Number(seg.start || 0);
        const segEnd = Math.max(segStart + 0.2, Number(seg.end || segStart + 1));
        const segWords = allWords
          .filter((w) => w.start >= segStart - 0.08 && w.end <= segEnd + 0.08)
          .map((w) => ({
            word: w.word,
            start: Number(Math.max(0, w.start - segStart).toFixed(3)),
            end: Number(Math.max(0.05, w.end - segStart).toFixed(3)),
          }));
        return {
          start: Number(segStart.toFixed(3)),
          end: Number(segEnd.toFixed(3)),
          text: String(seg.text || '').trim(),
          words: segWords.length > 0 ? segWords : undefined,
        };
      })
      .filter((c) => c.text.length > 0);
  }

  if (data.text?.trim()) {
    return [{ start: 0, end: 4, text: data.text.trim() }];
  }
  return [];
}

async function runLocalPythonFasterWhisper(
  wavPath: string,
  language?: string,
  model = 'base'
): Promise<SubtitleCue[]> {
  const pyScript = `
import json, sys
from faster_whisper import WhisperModel
wav_path = sys.argv[1]
lang = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "auto" else None
model_name = sys.argv[3] if len(sys.argv) > 3 else "base"
model = WhisperModel(model_name, device="auto", compute_type="int8")
segments, info = model.transcribe(wav_path, language=lang, word_timestamps=True)
out = []
for s in segments:
    words = []
    if s.words:
        for w in s.words:
            words.append({"word": w.word.strip(), "start": round(max(0.0, w.start - s.start), 3), "end": round(max(0.05, w.end - s.start), 3)})
    out.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip(), "words": words})
print(json.dumps({"language": info.language, "cues": out}))
`;
  const { stdout } = await execFileAsync(
    'python3',
    ['-c', pyScript, wavPath, language || 'auto', model || 'base'],
    { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
  );
  const parsed = JSON.parse(stdout) as { cues?: SubtitleCue[] };
  return Array.isArray(parsed.cues) ? parsed.cues : [];
}

async function runLocalOpenAiWhisperCli(
  wavPath: string,
  outDir: string,
  language?: string,
  model = 'base'
): Promise<SubtitleCue[]> {
  const args = [
    wavPath,
    '--model',
    model || 'base',
    '--output_format',
    'json',
    '--output_dir',
    outDir,
    '--fp16',
    'False',
  ];
  if (language && language !== 'auto') {
    args.push('--language', language);
  }
  await execFileAsync('whisper', args, { timeout: 180_000 });
  const baseName = path.basename(wavPath, path.extname(wavPath));
  const jsonPath = path.join(outDir, `${baseName}.json`);
  if (!fs.existsSync(jsonPath)) return [];
  const data = JSON.parse(await fsp.readFile(jsonPath, 'utf8')) as {
    segments?: Array<{ start: number; end: number; text: string }>;
  };
  return (data.segments || [])
    .map((s) => ({
      start: Number(Number(s.start || 0).toFixed(3)),
      end: Number(Math.max(Number(s.start || 0) + 0.2, Number(s.end || 0)).toFixed(3)),
      text: String(s.text || '').trim(),
    }))
    .filter((c) => c.text.length > 0);
}

export function registerSubtitleRoutes(
  app: FastifyInstance,
  db: VeloCutDatabase,
  storageDir: string
): void {
  app.get('/api/subtitles/capabilities', async () => {
    const caps = await probeFfmpegCapabilities();
    const providers = ['auto', 'vad', 'openai', 'groq'];
    if (caps.whisperEngine) {
      providers.unshift('local-whisper');
    }
    return {
      ffmpegAvailable: caps.ffmpegAvailable,
      whisperAvailable: Boolean(caps.whisperAvailable),
      whisperEngine: caps.whisperEngine ?? null,
      providers,
    };
  });

  app.post<{ Body: ServerTranscribeRequest }>(
    '/api/subtitles/transcribe',
    async (request, reply) => {
      const body = request.body || {};
      const language = (body.language || 'auto').trim() || 'auto';
      const provider = body.provider || 'auto';
      const caps = await probeFfmpegCapabilities();
      const ffmpegBin = resolveFfmpegBinary();

      const tempDir = await fsp.mkdtemp(
        path.join(os.tmpdir(), 'velocut-stt-')
      );
      const wavPath = path.join(tempDir, `${crypto.randomUUID()}.wav`);

      try {
        let wavBuffer: Buffer | null = null;

        if (body.audioBase64) {
          const rawBuf = Buffer.from(body.audioBase64, 'base64');
          const rawPath = path.join(tempDir, 'input.audio');
          await fsp.writeFile(rawPath, rawBuf);

          if (findWavDataChunk(rawBuf) && !caps.ffmpegAvailable) {
            wavBuffer = rawBuf;
          } else if (caps.ffmpegAvailable) {
            await execFileAsync(
              ffmpegBin,
              [
                '-y',
                '-i',
                rawPath,
                '-vn',
                '-ar',
                '16000',
                '-ac',
                '1',
                '-c:a',
                'pcm_s16le',
                wavPath,
              ],
              { timeout: 60_000 }
            );
            wavBuffer = await fsp.readFile(wavPath);
          } else {
            wavBuffer = rawBuf;
          }
        } else if (body.assetId) {
          const row = db.getMediaAsset(body.assetId);
          if (!row) {
            return reply.code(404).send({ error: 'Media asset not found on server.' });
          }
          const sourcePath = resolveSafeStoragePath(storageDir, row.relativePath);
          if (!fs.existsSync(sourcePath)) {
            return reply.code(404).send({ error: 'Media file missing on disk.' });
          }
          if (!caps.ffmpegAvailable) {
            const raw = await fsp.readFile(sourcePath);
            if (findWavDataChunk(raw)) {
              wavBuffer = raw;
              await fsp.writeFile(wavPath, raw);
            } else {
              return reply.code(400).send({
                error: 'FFmpeg not available on server to decode non-WAV media.',
              });
            }
          } else {
            await execFileAsync(
              ffmpegBin,
              [
                '-y',
                '-i',
                sourcePath,
                '-vn',
                '-ar',
                '16000',
                '-ac',
                '1',
                '-c:a',
                'pcm_s16le',
                wavPath,
              ],
              { timeout: 90_000 }
            );
            wavBuffer = await fsp.readFile(wavPath);
          }
        } else {
          return reply.code(400).send({
            error: 'Provide either assetId or audioBase64 in transcribe request.',
          });
        }

        if (!wavBuffer || wavBuffer.length < 44) {
          return reply.code(400).send({ error: 'Empty or invalid audio data.' });
        }

        if (!fs.existsSync(wavPath)) {
          await fsp.writeFile(wavPath, wavBuffer);
        }

        // 1. External API (OpenAI or Groq Whisper) when requested & key supplied
        if (provider === 'groq' || provider === 'openai') {
          const envKey =
            provider === 'groq'
              ? process.env.GROQ_API_KEY
              : process.env.OPENAI_API_KEY;
          const apiKey = (body.apiKey || envKey || '').trim();
          if (!apiKey) {
            return reply.code(400).send({
              error: `API key ${provider.toUpperCase()} diperlukan untuk mode transkripsi cloud.`,
            });
          }
          const cues = await runExternalWhisperApi({
            wavBuffer,
            provider,
            apiKey,
            language,
            model: body.model,
          });
          const res: ServerTranscribeResponse = {
            engine: `${provider}-whisper`,
            language,
            cues,
          };
          return reply.send(res);
        }

        // 2. Local Python Faster-Whisper or OpenAI-Whisper CLI on PC Server if available
        if (
          (provider === 'local-whisper' || provider === 'auto') &&
          caps.whisperEngine === 'python-faster-whisper'
        ) {
          const cues = await runLocalPythonFasterWhisper(
            wavPath,
            language,
            body.model || 'base'
          );
          const res: ServerTranscribeResponse = {
            engine: 'python-faster-whisper',
            language,
            cues,
          };
          return reply.send(res);
        }

        if (
          (provider === 'local-whisper' || provider === 'auto') &&
          caps.whisperEngine === 'openai-whisper-cli'
        ) {
          const cues = await runLocalOpenAiWhisperCli(
            wavPath,
            tempDir,
            language,
            body.model || 'base'
          );
          const res: ServerTranscribeResponse = {
            engine: 'openai-whisper-cli',
            language,
            cues,
          };
          return reply.send(res);
        }

        // 3. Server Adaptive VAD Fallback (always works offline with 0 extra deps)
        const cues = detectWavSpeechSegmentsVad(wavBuffer);
        const res: ServerTranscribeResponse = {
          engine: 'server-vad',
          language,
          cues,
          warning:
            'Whisper lokal belum terpasang di Server PC; segmen bicara dideteksi via VAD otomatis. Gunakan "AI Whisper di Browser" (100% gratis) atau tempel naskah untuk teks otomatis penuh.',
        };
        return reply.send(res);
      } catch (err) {
        return reply.code(500).send({
          error: `Gagal transkripsi audio: ${(err as Error).message}`,
        });
      } finally {
        await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  );
}
