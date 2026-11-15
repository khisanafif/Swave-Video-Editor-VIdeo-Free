export function registerProjectRoutes(app, db) {
    app.get('/api/projects', async () => {
        return db.listProjects();
    });
    app.get('/api/projects/:id', async (request, reply) => {
        const project = db.getProject(request.params.id);
        if (!project) {
            return reply.code(404).send({ error: 'Project not found.' });
        }
        return project;
    });
    app.put('/api/projects/:id', async (request, reply) => {
        const payload = request.body;
        if (!payload || !payload.name || !payload.tracks) {
            return reply.code(400).send({ error: 'Invalid project payload.' });
        }
        const project = {
            ...payload,
            id: request.params.id,
            updatedAt: new Date().toISOString(),
        };
        db.upsertProject(project);
        return reply.send(project);
    });
    app.delete('/api/projects/:id', async (request, reply) => {
        const deleted = db.deleteProject(request.params.id);
        if (!deleted) {
            return reply.code(404).send({ error: 'Project not found.' });
        }
        return reply.send({ deleted: true, id: request.params.id });
    });
}
