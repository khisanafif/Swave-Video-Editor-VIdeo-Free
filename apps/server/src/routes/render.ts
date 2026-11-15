import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { RenderJobRequest } from '@velocut/shared';
import type { VeloCutDatabase } from '../db/database.js';
import {
  enqueueServerRenderJob,
  getServerCapabilities,
} from '../worker/ffmpegWorker.js';

export function registerRenderRoutes(
  app: FastifyInstance,
  db: VeloCutDatabase,
  storageDir: string
): void {
  app.get('/api/capabilities', async () => {
    return getServerCapabilities(storageDir);
  });

  app.get('/api/render/jobs', async () => {
    return db.listRenderJobs();
  });

  app.get<{ Params: { id: string } }>(
    '/api/render/jobs/:id',
    async (request, reply) => {
      const job = db.getRenderJob(request.params.id);
      if (!job) {
        return reply.code(404).send({ error: 'Render job not found.' });
      }
      return job;
    }
  );

  app.post<{ Body: RenderJobRequest }>(
    '/api/render/jobs',
    async (request, reply) => {
      const body = request.body;
      if (!body?.project || !body.project.tracks || !body.project.trackOrder) {
        return reply.code(400).send({ error: 'Invalid project in render request.' });
      }

      const jobId = crypto.randomUUID();
      await enqueueServerRenderJob({
        db,
        storageDir,
        jobId,
        project: body.project,
        quality: body.quality,
        preferredEncoder: body.preferredEncoder,
      });

      const job = db.getRenderJob(jobId);
      return reply.code(202).send(job);
    }
  );
}

