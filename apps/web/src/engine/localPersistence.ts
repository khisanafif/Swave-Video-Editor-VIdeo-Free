import type { ProjectDocument } from '@velocut/shared';
import { mediaRegistry } from './opfsStorage';
import { resolveServerUrl } from './serverOffloadClient';

const LOCAL_PROJECT_STORAGE_KEY = 'velocut_local_project_v1';

export function saveProjectLocally(project: ProjectDocument): void {
  if (typeof window === 'undefined') return;
  try {
    // Strip huge inline thumbnail data URLs only if storage quota gets tight
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
