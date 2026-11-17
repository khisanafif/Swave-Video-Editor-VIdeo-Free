import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { NetworkEndpointInfo, ServerNetworkInfo } from '@swave/shared';
import type { StudioDatabase } from '../db/database.js';

export function discoverLanEndpoints(port: number): NetworkEndpointInfo[] {
  const interfaces = os.networkInterfaces();
  const endpoints: NetworkEndpointInfo[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        endpoints.push({
          interfaceName: name,
          address: addr.address,
          url: `http://${addr.address}:${port}`,
        });
      }
    }
  }

  // Prioritize private LAN subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  endpoints.sort((a, b) => {
    const score = (ip: string) =>
      ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2;
    return score(a.address) - score(b.address);
  });

  return endpoints;
}

export function registerNetworkRoutes(
  app: FastifyInstance,
  db: StudioDatabase,
  defaultPort: number
): void {
  app.get('/api/network', async (request) => {
    const hostHeader = request.headers.host || '';
    const portMatch = /:(\d+)$/.exec(hostHeader);
    const activePort = portMatch ? Number(portMatch[1]) : defaultPort;

    const endpoints = discoverLanEndpoints(activePort);
    const projects = db.listProjects();
    const assets = db.listMediaAssets();

    const info: ServerNetworkInfo = {
      hostname: os.hostname(),
      port: activePort,
      endpoints,
      projectCount: projects.length,
      assetCount: assets.length,
    };
    return info;
  });
}

