import { createServerApp } from './app.js';
import { discoverLanEndpoints } from './routes/network.js';
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
async function main() {
    const { app, storageDir, webDistDir } = await createServerApp({
        port: PORT,
        logger: false,
    });
    await app.listen({ port: PORT, host: HOST });
    const endpoints = discoverLanEndpoints(PORT);
    console.log('\n====================================================================');
    console.log('  VELOCUT HYBRID-EDGE STUDIO SERVER (V-HESA) — AKTIF');
    console.log('====================================================================');
    console.log(`  Akses di PC ini       : http://localhost:${PORT}`);
    if (endpoints.length > 0) {
        console.log('  Akses dari HP / Tablet / Laptop lain (WiFi/LAN yang sama):');
        for (const ep of endpoints) {
            console.log(`    -> ${ep.url}  (${ep.interfaceName})`);
        }
    }
    else {
        console.log('  (Tidak mendeteksi IP LAN aktif — pastikan WiFi/Ethernet terhubung)');
    }
    console.log(`  Media Storage         : ${storageDir}`);
    console.log(`  Web App Bundle        : ${webDistDir}`);
    console.log('====================================================================\n');
}
main().catch((err) => {
    console.error('[VeloCut Server] Fatal startup error:', err);
    process.exit(1);
});
