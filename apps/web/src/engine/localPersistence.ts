import type { ProjectDocument } from '@velocut/shared';
import { mediaRegistry } from './opfsStorage';
import { resolveServerUrl } from './serverOffloadClient';

const LOCAL_PROJECT_STORAGE_KEY = 'velocut_local_project_v1';

interface VeloCutNativeBridge {
  saveBase64File?: (
    base64Data: string,
    filename: string,
    mimeType: string
  ) => string | boolean;
}

export function saveProjectLocally(project: ProjectDocument): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(project);
    localStorage.setItem(LOCAL_PROJECT_STORAGE_KEY, serialized);
  } catch {
    try {
      const compact: ProjectDocument = {
        ...project,
        assets: Object.fromEntries(
          Object.entries(project.assets).map(([id, asset]) => [
            id,
            { ...asset, thumbnailUrl: undefined },
          ])
        ),
      };
      localStorage.setItem(LOCAL_PROJECT_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // Ignore quota errors
    }
  }
}

export function loadLocalProjectSnapshot(): ProjectDocument | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_PROJECT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectDocument;
    if (!parsed || !parsed.tracks || !parsed.trackOrder || !parsed.clips) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLocalProjectSnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LOCAL_PROJECT_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export async function hydrateProjectMediaAssets(
  doc: ProjectDocument
): Promise<void> {
  for (const asset of Object.values(doc.assets)) {
    if (asset.opfsPath) {
      const restored = await mediaRegistry.restoreAssetFromOpfs(
        asset.id,
        asset.opfsPath
      );
      if (restored) continue;
    }
    if (asset.serverUrl) {
      mediaRegistry.registerRemoteAsset(
        asset.id,
        resolveServerUrl(asset.serverUrl)
      );
    }
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca data file.'));
    reader.readAsDataURL(blob);
  });
}

export async function saveBlobToDevice(
  blob: Blob,
  filename: string
): Promise<'native-saved' | 'downloaded'> {
  if (typeof window !== 'undefined') {
    const nativeBridge = (
      window as unknown as { VeloCutNative?: VeloCutNativeBridge }
    ).VeloCutNative;
    if (nativeBridge && typeof nativeBridge.saveBase64File === 'function') {
      try {
        const b64 = await blobToBase64(blob);
        const saved = nativeBridge.saveBase64File(
          b64,
          filename,
          blob.type || 'application/octet-stream'
        );
        if (saved) return 'native-saved';
      } catch {
        // Fallback to browser download
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export function canShareFilesOnDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  );
}

export async function shareBlobWithSystemSheet(
  blob: Blob,
  filename: string,
  title = 'Hasil Edit VeloCut Studio'
): Promise<boolean> {
  if (!canShareFilesOnDevice()) return false;
  const file = new File([blob], filename, {
    type: blob.type || 'video/mp4',
  });
  if (!navigator.canShare({ files: [file] })) return false;
  await navigator.share({
    title,
    files: [file],
  });
  return true;
}

export function exportProjectJsonToDevice(project: ProjectDocument): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const safeName = (project.name || 'velocut-project').replace(/[^\w.-]/g, '_');
  void saveBlobToDevice(blob, `${safeName}.velocut.json`);
}

export async function parseProjectJsonFile(
  file: File
): Promise<ProjectDocument> {
  const text = await file.text();
  const parsed = JSON.parse(text) as ProjectDocument;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.tracks ||
    !parsed.trackOrder ||
    !parsed.clips
  ) {
    throw new Error('File bukan proyek VeloCut (.velocut.json) yang valid.');
  }
  return parsed;
}
