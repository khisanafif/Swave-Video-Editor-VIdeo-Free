import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ProjectDocument, RenderJobRecord } from '@velocut/shared';

export interface MediaAssetRow {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  relativePath: string;
  kind: string;
  duration: number;
  width: number;
  height: number;
  createdAt: string;
}

export interface UploadSessionRow {
  uploadId: string;
  assetId: string;
  filename: string;
  mimeType: string;
  kind: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  status: 'uploading' | 'completed' | 'failed';
  duration: number;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

export class VeloCutDatabase {
  public readonly db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        relative_path TEXT NOT NULL,
        kind TEXT NOT NULL,
        duration REAL NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS upload_sessions (
        upload_id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        kind TEXT NOT NULL,
        total_size INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        total_chunks INTEGER NOT NULL,
        received_chunks_json TEXT NOT NULL,
        status TEXT NOT NULL,
        duration REAL NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS render_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        encoder TEXT NOT NULL,
        ffmpeg_command TEXT NOT NULL,
        output_relative_path TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private isClosed = false;

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.db.close();
  }

  upsertProject(project: ProjectDocument): void {
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, data_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      project.id,
      project.name,
      JSON.stringify(project),
      project.updatedAt || new Date().toISOString()
    );
  }

  getProject(id: string): ProjectDocument | null {
    const stmt = this.db.prepare(`SELECT data_json FROM projects WHERE id = ?`);
    const row = stmt.get(id) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as ProjectDocument) : null;
  }

  listProjects(): Array<{ id: string; name: string; updatedAt: string }> {
    const stmt = this.db.prepare(
      `SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC`
    );
    const rows = stmt.all() as Array<{
      id: string;
      name: string;
      updated_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      updatedAt: r.updated_at,
    }));
  }

  deleteProject(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM projects WHERE id = ?`);
    const res = stmt.run(id);
    return Number(res.changes) > 0;
  }

  createUploadSession(session: UploadSessionRow): void {
    const stmt = this.db.prepare(`
      INSERT INTO upload_sessions (
        upload_id, asset_id, filename, mime_type, kind,
        total_size, chunk_size, total_chunks, received_chunks_json,
        status, duration, width, height, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.uploadId,
      session.assetId,
      session.filename,
      session.mimeType,
      session.kind,
      session.totalSize,
      session.chunkSize,
      session.totalChunks,
      JSON.stringify(session.receivedChunks),
      session.status,
      session.duration,
      session.width,
      session.height,
      session.createdAt,
      session.updatedAt
    );
  }

  getUploadSession(uploadId: string): UploadSessionRow | null {
    const stmt = this.db.prepare(
      `SELECT * FROM upload_sessions WHERE upload_id = ?`
    );
    const row = stmt.get(uploadId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      uploadId: String(row.upload_id),
      assetId: String(row.asset_id),
      filename: String(row.filename),
      mimeType: String(row.mime_type),
      kind: String(row.kind),
      totalSize: Number(row.total_size),
      chunkSize: Number(row.chunk_size),
      totalChunks: Number(row.total_chunks),
      receivedChunks: JSON.parse(String(row.received_chunks_json)) as number[],
      status: String(row.status) as UploadSessionRow['status'],
      duration: Number(row.duration),
      width: Number(row.width),
      height: Number(row.height),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  updateUploadSessionChunks(
    uploadId: string,
    receivedChunks: number[],
    status: UploadSessionRow['status']
  ): void {
    const stmt = this.db.prepare(`
      UPDATE upload_sessions
      SET received_chunks_json = ?, status = ?, updated_at = ?
      WHERE upload_id = ?
    `);
    stmt.run(
      JSON.stringify(receivedChunks),
      status,
      new Date().toISOString(),
      uploadId
    );
  }

  insertMediaAsset(asset: MediaAssetRow): void {
    const stmt = this.db.prepare(`
      INSERT INTO media_assets (
        id, filename, mime_type, size, relative_path,
        kind, duration, width, height, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        filename = excluded.filename,
        size = excluded.size,
        relative_path = excluded.relative_path
    `);
    stmt.run(
      asset.id,
      asset.filename,
      asset.mimeType,
      asset.size,
      asset.relativePath,
      asset.kind,
      asset.duration,
      asset.width,
      asset.height,
      asset.createdAt
    );
  }

  getMediaAsset(id: string): MediaAssetRow | null {
    const stmt = this.db.prepare(`SELECT * FROM media_assets WHERE id = ?`);
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      filename: String(row.filename),
      mimeType: String(row.mime_type),
      size: Number(row.size),
      relativePath: String(row.relative_path),
      kind: String(row.kind),
      duration: Number(row.duration),
      width: Number(row.width),
      height: Number(row.height),
      createdAt: String(row.created_at),
    };
  }

  listMediaAssets(): MediaAssetRow[] {
    const stmt = this.db.prepare(
      `SELECT * FROM media_assets ORDER BY created_at DESC`
    );
    const rows = stmt.all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      filename: String(row.filename),
      mimeType: String(row.mime_type),
      size: Number(row.size),
      relativePath: String(row.relative_path),
      kind: String(row.kind),
      duration: Number(row.duration),
      width: Number(row.width),
      height: Number(row.height),
      createdAt: String(row.created_at),
    }));
  }

  insertRenderJob(
    job: Omit<RenderJobRecord, 'outputUrl'> & { outputRelativePath: string | null }
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO render_jobs (
        id, project_id, status, progress, encoder,
        ffmpeg_command, output_relative_path, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      job.id,
      job.projectId,
      job.status,
      job.progress,
      job.encoder,
      job.ffmpegCommand,
      job.outputRelativePath,
      job.error,
      job.createdAt,
      job.updatedAt
    );
  }

  updateRenderJob(
    id: string,
    patch: {
      status?: RenderJobRecord['status'];
      progress?: number;
      outputRelativePath?: string | null;
      error?: string | null;
    }
  ): void {
    const existing = this.getRenderJobRaw(id);
    if (!existing) return;
    const stmt = this.db.prepare(`
      UPDATE render_jobs
      SET status = ?, progress = ?, output_relative_path = ?, error = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      patch.status ?? existing.status,
      patch.progress ?? existing.progress,
      patch.outputRelativePath !== undefined
        ? patch.outputRelativePath
        : existing.outputRelativePath,
      patch.error !== undefined ? patch.error : existing.error,
      new Date().toISOString(),
      id
    );
  }

  private getRenderJobRaw(
    id: string
  ):
    | (Omit<RenderJobRecord, 'outputUrl'> & { outputRelativePath: string | null })
    | null {
    const stmt = this.db.prepare(`SELECT * FROM render_jobs WHERE id = ?`);
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      status: String(row.status) as RenderJobRecord['status'],
      progress: Number(row.progress),
      encoder: String(row.encoder),
      ffmpegCommand: String(row.ffmpeg_command),
      outputRelativePath: row.output_relative_path
        ? String(row.output_relative_path)
        : null,
      error: row.error ? String(row.error) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  getRenderJob(id: string): RenderJobRecord | null {
    const raw = this.getRenderJobRaw(id);
    if (!raw) return null;
    return {
      id: raw.id,
      projectId: raw.projectId,
      status: raw.status,
      progress: raw.progress,
      encoder: raw.encoder,
      ffmpegCommand: raw.ffmpegCommand,
      outputUrl: raw.outputRelativePath
        ? `/media/${raw.outputRelativePath.replace(/^\/+/, '')}`
        : null,
      error: raw.error,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  listRenderJobs(): RenderJobRecord[] {
    const stmt = this.db.prepare(
      `SELECT id FROM render_jobs ORDER BY created_at DESC LIMIT 30`
    );
    const rows = stmt.all() as Array<{ id: string }>;
    return rows
      .map((r) => this.getRenderJob(r.id))
      .filter((r): r is RenderJobRecord => r !== null);
  }
}

