export function formatTimecode(seconds: number, fps = 30): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * fps);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(
    2,
    '0'
  )}:${String(frames).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

