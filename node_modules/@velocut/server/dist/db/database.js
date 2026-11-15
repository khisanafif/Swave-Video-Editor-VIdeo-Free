import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
export class VeloCutDatabase {
    db;
    constructor(dbPath) {
        if (dbPath !== ':memory:') {
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        }
        this.db = new DatabaseSync(dbPath);
        this.init();
    }
    init() {
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
    isClosed = false;
    close() {
        if (this.isClosed)
            return;
        this.isClosed = true;
        this.db.close();
    }
    upsertProject(project) {
        const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, data_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);
        stmt.run(project.id, project.name, JSON.stringify(project), project.updatedAt || new Date().toISOString());
    }
    getProject(id) {
        const stmt = this.db.prepare(`SELECT data_json FROM projects WHERE id = ?`);
        const row = stmt.get(id);
        return row ? JSON.parse(row.data_json) : null;
    }
    listProjects() {
        const stmt = this.db.prepare(`SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC`);
        const rows = stmt.all();
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            updatedAt: r.updated_at,
        }));
    }
    deleteProject(id) {
        const stmt = this.db.prepare(`DELETE FROM projects WHERE id = ?`);
        const res = stmt.run(id);
        return Number(res.changes) > 0;
    }
    createUploadSession(session) {
        const stmt = this.db.prepare(`
      INSERT INTO upload_sessions (
        upload_id, asset_id, filename, mime_type, kind,
        total_size, chunk_size, total_chunks, received_chunks_json,
        status, duration, width, height, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(session.uploadId, session.assetId, session.filename, session.mimeType, session.kind, session.totalSize, session.chunkSize, session.totalChunks, JSON.stringify(session.receivedChunks), session.status, session.duration, session.width, session.height, session.createdAt, session.updatedAt);
    }
    getUploadSession(uploadId) {
        const stmt = this.db.prepare(`SELECT * FROM upload_sessions WHERE upload_id = ?`);
        const row = stmt.get(uploadId);
        if (!row)
            return null;
        return {
            uploadId: String(row.upload_id),
            assetId: String(row.asset_id),
            filename: String(row.filename),
            mimeType: String(row.mime_type),
            kind: String(row.kind),
            totalSize: Number(row.total_size),
            chunkSize: Number(row.chunk_size),
            totalChunks: Number(row.total_chunks),
            receivedChunks: JSON.parse(String(row.received_chunks_json)),
            status: String(row.status),
            duration: Number(row.duration),
            width: Number(row.width),
            height: Number(row.height),
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
        };
    }
    updateUploadSessionChunks(uploadId, receivedChunks, status) {
        const stmt = this.db.prepare(`
      UPDATE upload_sessions
      SET received_chunks_json = ?, status = ?, updated_at = ?
      WHERE upload_id = ?
    `);
        stmt.run(JSON.stringify(receivedChunks), status, new Date().toISOString(), uploadId);
    }
    insertMediaAsset(asset) {
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
        stmt.run(asset.id, asset.filename, asset.mimeType, asset.size, asset.relativePath, asset.kind, asset.duration, asset.width, asset.height, asset.createdAt);
    }
    getMediaAsset(id) {
        const stmt = this.db.prepare(`SELECT * FROM media_assets WHERE id = ?`);
        const row = stmt.get(id);
        if (!row)
            return null;
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
    listMediaAssets() {
        const stmt = this.db.prepare(`SELECT * FROM media_assets ORDER BY created_at DESC`);
        const rows = stmt.all();
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
    insertRenderJob(job) {
        const stmt = this.db.prepare(`
      INSERT INTO render_jobs (
        id, project_id, status, progress, encoder,
        ffmpeg_command, output_relative_path, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(job.id, job.projectId, job.status, job.progress, job.encoder, job.ffmpegCommand, job.outputRelativePath, job.error, job.createdAt, job.updatedAt);
    }
    updateRenderJob(id, patch) {
        const existing = this.getRenderJobRaw(id);
        if (!existing)
            return;
        const stmt = this.db.prepare(`
      UPDATE render_jobs
      SET status = ?, progress = ?, output_relative_path = ?, error = ?, updated_at = ?
      WHERE id = ?
    `);
        stmt.run(patch.status ?? existing.status, patch.progress ?? existing.progress, patch.outputRelativePath !== undefined
            ? patch.outputRelativePath
            : existing.outputRelativePath, patch.error !== undefined ? patch.error : existing.error, new Date().toISOString(), id);
    }
    getRenderJobRaw(id) {
        const stmt = this.db.prepare(`SELECT * FROM render_jobs WHERE id = ?`);
        const row = stmt.get(id);
        if (!row)
            return null;
        return {
            id: String(row.id),
            projectId: String(row.project_id),
            status: String(row.status),
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
    getRenderJob(id) {
        const raw = this.getRenderJobRaw(id);
        if (!raw)
            return null;
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
    listRenderJobs() {
        const stmt = this.db.prepare(`SELECT id FROM render_jobs ORDER BY created_at DESC LIMIT 30`);
        const rows = stmt.all();
        return rows
            .map((r) => this.getRenderJob(r.id))
            .filter((r) => r !== null);
    }
}
