import type { FastifyInstance } from 'fastify';
import type { ProjectDocument } from '@swave/shared';
import type { StudioDatabase } from '../db/database.js';

export function registerProjectRoutes(
  app: FastifyInstance,
  db: StudioDatabase
): void {
  app.get('/api/projects', async () => {
    return db.listProjects();
  });

  app.get<{ Params: { id: string } }>(
    '/api/projects/:id',
    async (request, reply) => {
      const project = db.getProject(request.params.id);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found.' });
      }
      return project;
    }
  );

  app.put<{ Params: { id: string }; Body: ProjectDocument }>(
    '/api/projects/:id',
    async (request, reply) => {
      const payload = request.body;
      if (!payload || !payload.name || !payload.tracks) {
        return reply.code(400).send({ error: 'Invalid project payload.' });
      }
      const project: ProjectDocument = {
        ...payload,
        id: request.params.id,
        updatedAt: new Date().toISOString(),
      };
      db.upsertProject(project);
      return reply.send(project);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/api/projects/:id',
    async (request, reply) => {
      const deleted = db.deleteProject(request.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: 'Project not found.' });
      }
      return reply.send({ deleted: true, id: request.params.id });
    }
  );
}

