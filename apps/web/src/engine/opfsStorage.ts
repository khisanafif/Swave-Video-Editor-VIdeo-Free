const OPFS_FOLDER = 'velocut-media';

class MediaBlobRegistry {
  private readonly blobMap = new Map<string, Blob>();
  private readonly urlMap = new Map<string, string>();

  async saveAssetFile(
    assetId: string,
    file: Blob,
    filename: string
  ): Promise<{ objectUrl: string; opfsPath?: string }> {
    this.blobMap.set(assetId, file);
    const prevUrl = this.urlMap.get(assetId);
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    this.urlMap.set(assetId, objectUrl);

    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
    ) {
      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(OPFS_FOLDER, { create: true });
        const safeName = `${assetId}_${filename.replace(/[^\w.-]/g, '_')}`;
        const fileHandle = await dir.getFileHandle(safeName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
        return { objectUrl, opfsPath: `${OPFS_FOLDER}/${safeName}` };
      } catch {
        // Fallback to in-memory Blob URL when OPFS is blocked (e.g. insecure LAN HTTP)
      }
    }

    return { objectUrl };
  }

  getObjectUrl(assetId: string): string | undefined {
    return this.urlMap.get(assetId);
  }

  getBlob(assetId: string): Blob | undefined {
    return this.blobMap.get(assetId);
  }

  registerRemoteAsset(assetId: string, remoteUrl: string): void {
    this.urlMap.set(assetId, remoteUrl);
  }

  async deleteAsset(assetId: string, opfsPath?: string): Promise<void> {
    const url = this.urlMap.get(assetId);
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
    this.urlMap.delete(assetId);
    this.blobMap.delete(assetId);

    if (
      opfsPath &&
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
    ) {
      try {
        const parts = opfsPath.split('/');
        const filename = parts.pop();
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(OPFS_FOLDER);
        if (filename) await dir.removeEntry(filename);
      } catch {
        // Ignore missing OPFS file
      }
    }
  }
}

export const mediaRegistry = new MediaBlobRegistry();

