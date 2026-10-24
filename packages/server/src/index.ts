import { startServer } from './server.js';

const port = Number(process.env.PORT ?? 3001);
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);

const server = await startServer({ port, corsOrigins });
console.log(`UNO server listening on http://localhost:${server.port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
