import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { RunnerOptions } from './game/GameRunner.js';
import { DEFAULT_ROOM_OPTIONS, RoomManager, type GameServer } from './rooms/RoomManager.js';

export interface ServerOptions {
  port: number;
  /** Folder with the built website; defaults to packages/client/dist. */
  clientDir?: string;
  disconnectGraceMs?: number;
  abandonedGameMs?: number;
  runner?: Partial<RunnerOptions>;
  /** Other sites allowed to connect (e.g. a GitHub Pages copy of the client). */
  corsOrigins?: string[];
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const DEFAULT_CLIENT_DIR = fileURLToPath(new URL('../../client/dist/', import.meta.url));

export async function startServer(options: ServerOptions) {
  const clientDir = options.clientDir ?? DEFAULT_CLIENT_DIR;
  const http = createServer((req, res) => serveStatic(clientDir, req, res));
  const io: GameServer = new Server(http, {
    cors: options.corsOrigins?.length ? { origin: options.corsOrigins } : undefined,
    maxHttpBufferSize: 16_000,
  });
  const rooms = new RoomManager(io, {
    disconnectGraceMs: options.disconnectGraceMs ?? DEFAULT_ROOM_OPTIONS.disconnectGraceMs,
    abandonedGameMs: options.abandonedGameMs ?? DEFAULT_ROOM_OPTIONS.abandonedGameMs,
    runner: { ...DEFAULT_ROOM_OPTIONS.runner, ...options.runner },
  });
  io.on('connection', (socket) => rooms.attach(socket));

  await new Promise<void>((resolve) => http.listen(options.port, resolve));
  const { port } = http.address() as AddressInfo;

  return {
    port,
    rooms,
    close: async () => {
      rooms.dispose();
      await io.close();
    },
  };
}

function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = normalize(join(root, pathname));
  if (!file.startsWith(normalize(root + sep)) && file !== normalize(root)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('The website has not been built. Run npm run build.');
    return;
  }

  const isHashedAsset = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'content-type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}
