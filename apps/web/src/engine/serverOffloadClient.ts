import {
  DEFAULT_CHUNK_SIZE_BYTES,
  type ChunkUploadCompleteResponse,
  type ChunkUploadInitRequest,
  type ChunkUploadInitResponse,
  type MediaAsset,
  type MediaKind,
  type ProjectDocument,
  type ProjectSummary,
  type RenderJobRecord,
  type ServerCapabilities,
  type ServerEncoderCapability,
  type ServerNetworkInfo,
  type ServerTranscribeRequest,
  type ServerTranscribeResponse,
} from '@swave/shared';

const SERVER_URL_STORAGE_KEY = 'swave_server_base_url';

export interface ServerMediaAssetItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  relativePath: string;
  kind: MediaKind;
  duration: number;
  width: number;
  height: number;
  createdAt: string;
  mediaUrl: string;
}

export function getServerBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(SERVER_URL_STORAGE_KEY) || '')
      .trim()
      .replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function normalizeServerBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export function setServerBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const cleaned = normalizeServerBaseUrl(url);
    if (cleaned) {
      localStorage.setItem(SERVER_URL_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(SERVER_URL_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota / privacy errors
  }
}

export async function testAndConnectServer(
  rawUrl: string
): Promise<ServerCapabilities | null> {
  setServerBaseUrl(rawUrl);
  return fetchServerCapabilities();
}

export function resolveServerUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getServerBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export async function fetchServerCapabilities(): Promise<ServerCapabilities | null> {
  try {
    const res = await fetch(resolveServerUrl('/api/capabilities'));
    if (!res.ok) return null;
    return (await res.json()) as ServerCapabilities;
  } catch {
    return null;
  }
}

export async function fetchServerNetworkInfo(): Promise<ServerNetworkInfo | null> {
  try {
    const res = await fetch(resolveServerUrl('/api/network'));
    if (!res.ok) return null;
    return (await res.json()) as ServerNetworkInfo;
  } catch {
    return null;
  }
}

export async function fetchServerMediaAssets(): Promise<ServerMediaAssetItem[]> {
  try {
    const res = await fetch(resolveServerUrl('/api/assets'));
    if (!res.ok) return [];
    const items = (await res.json()) as ServerMediaAssetItem[];
    return items.map((item) => ({
      ...item,
      mediaUrl: resolveServerUrl(item.mediaUrl),
    }));
  } catch {
    return [];
  }
}

export async function uploadBlobInChunks(options: {
  blob: Blob;
  asset: MediaAsset;
  chunkSize?: number;
  onProgress?: (percent: number, chunkIndex: number, totalChunks: number) => void;
  signal?: AbortSignal;
}): Promise<ChunkUploadCompleteResponse> {
  const {
    blob,
    asset,
    chunkSize = DEFAULT_CHUNK_SIZE_BYTES,
    onProgress,
    signal,
  } = options;

  const totalChunks = Math.max(1, Math.ceil(blob.size / chunkSize));
  const initBody: ChunkUploadInitRequest = {
    filename: asset.name,
    mimeType: asset.mimeType,
    totalSize: blob.size,
    chunkSize,
    totalChunks,
    kind: asset.kind,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
  };

  const initRes = await fetch(resolveServerUrl('/api/upload/init'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(initBody),
    signal,
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Chunked upload init failed: ${err}`);
  }

  const session = (await initRes.json()) as ChunkUploadInitResponse;

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) throw new Error('Upload dibatalkan.');
    if (session.receivedChunks.includes(i)) continue;

    const start = i * chunkSize;
    const end = Math.min(blob.size, start + chunkSize);
    const slice = blob.slice(start, end);

    const chunkRes = await fetch(
      resolveServerUrl(
        `/api/upload/chunk?uploadId=${encodeURIComponent(session.uploadId)}&chunkIndex=${i}`
      ),
      {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: slice,
        signal,
      }
    );

    if (!chunkRes.ok) {
      throw new Error(`Chunk ${i} upload failed (${chunkRes.status})`);
    }

    const pct = Math.round(((i + 1) / totalChunks) * 95);
    onProgress?.(pct, i + 1, totalChunks);
  }

  const completeRes = await fetch(resolveServerUrl('/api/upload/complete'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uploadId: session.uploadId }),
    signal,
  });

  if (!completeRes.ok) {
    const errText = await completeRes.text();
    throw new Error(`Upload complete failed: ${errText}`);
  }

  const completed = (await completeRes.json()) as ChunkUploadCompleteResponse;
  completed.mediaUrl = resolveServerUrl(completed.mediaUrl);
  onProgress?.(100, totalChunks, totalChunks);
  return completed;
}

export async function saveProjectToServer(
  project: ProjectDocument
): Promise<ProjectDocument> {
  const res = await fetch(
    resolveServerUrl(`/api/projects/${encodeURIComponent(project.id)}`),
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(project),
    }
  );
  if (!res.ok) {
    throw new Error(`Gagal menyimpan proyek ke server (${res.status})`);
  }
  return (await res.json()) as ProjectDocument;
}

export async function listServerProjects(): Promise<ProjectSummary[]> {
  try {
    const res = await fetch(resolveServerUrl('/api/projects'));
    if (!res.ok) return [];
    return (await res.json()) as ProjectSummary[];
  } catch {
    return [];
  }
}

export async function loadProjectFromServer(
  projectId: string
): Promise<ProjectDocument> {
  const res = await fetch(
    resolveServerUrl(`/api/projects/${encodeURIComponent(projectId)}`)
  );
  if (!res.ok) throw new Error('Proyek tidak ditemukan di server.');
  return (await res.json()) as ProjectDocument;
}

export async function deleteProjectOnServer(projectId: string): Promise<boolean> {
  const res = await fetch(
    resolveServerUrl(`/api/projects/${encodeURIComponent(projectId)}`),
    { method: 'DELETE' }
  );
  return res.ok;
}

export async function startServerRenderJob(options: {
  project: ProjectDocument;
  quality?: 'draft' | 'standard' | 'high';
  preferredEncoder?: ServerEncoderCapability;
}): Promise<RenderJobRecord> {
  const res = await fetch(resolveServerUrl('/api/render/jobs'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    throw new Error(`Gagal memulai render server (${res.status})`);
  }
  const job = (await res.json()) as RenderJobRecord;
  if (job.outputUrl) {
    job.outputUrl = resolveServerUrl(job.outputUrl);
  }
  return job;
}

export async function fetchRenderJobStatus(
  jobId: string
): Promise<RenderJobRecord> {
  const res = await fetch(
    resolveServerUrl(`/api/render/jobs/${encodeURIComponent(jobId)}`)
  );
  if (!res.ok) {
    throw new Error(`Render job ${jobId} tidak ditemukan`);
  }
  const job = (await res.json()) as RenderJobRecord;
  if (job.outputUrl) {
    job.outputUrl = resolveServerUrl(job.outputUrl);
  }
  return job;
}

export async function fetchSubtitleCapabilities(): Promise<{
  ffmpegAvailable: boolean;
  whisperAvailable: boolean;
  whisperEngine: string | null;
  providers: string[];
} | null> {
  try {
    const res = await fetch(resolveServerUrl('/api/subtitles/capabilities'));
    if (!res.ok) return null;
    return (await res.json()) as {
      ffmpegAvailable: boolean;
      whisperAvailable: boolean;
      whisperEngine: string | null;
      providers: string[];
    };
  } catch {
    return null;
  }
}

export async function transcribeOnServer(
  req: ServerTranscribeRequest
): Promise<ServerTranscribeResponse> {
  const res = await fetch(resolveServerUrl('/api/subtitles/transcribe'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Transkripsi server gagal (${res.status}): ${errText}`);
  }
  return (await res.json()) as ServerTranscribeResponse;
}
