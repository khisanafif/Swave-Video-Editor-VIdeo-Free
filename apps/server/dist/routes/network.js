import os from 'node:os';
export function discoverLanEndpoints(port) {
    const interfaces = os.networkInterfaces();
    const endpoints = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
        if (!addrs)
            continue;
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
        const score = (ip) => ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2;
        return score(a.address) - score(b.address);
    });
    return endpoints;
}
export function registerNetworkRoutes(app, db, defaultPort) {
    app.get('/api/network', async (request) => {
        const hostHeader = request.headers.host || '';
        const portMatch = /:(\d+)$/.exec(hostHeader);
        const activePort = portMatch ? Number(portMatch[1]) : defaultPort;
        const endpoints = discoverLanEndpoints(activePort);
        const projects = db.listProjects();
        const assets = db.listMediaAssets();
        const info = {
            hostname: os.hostname(),
            port: activePort,
            endpoints,
            projectCount: projects.length,
            assetCount: assets.length,
        };
        return info;
    });
}
