import { io, type Socket } from 'socket.io-client';
import type {
  AckResult,
  BotDifficulty,
  ClientToServerEvents,
  JoinedRoom,
  RuleSet,
  ServerToClientEvents,
} from '@uno/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const ONLINE_AVAILABLE = import.meta.env.VITE_ONLINE !== 'off';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

const REQUEST_TIMEOUT_MS = 8_000;
/** Free hosting puts the server to sleep; waking it can take close to a minute. */
const CONNECT_TIMEOUT_MS = 75_000;

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  socket ??= io(SERVER_URL, { autoConnect: false });
  return socket;
}

/** Connects if needed. Rejects if the server can't be reached in time. */
export function ensureConnected(): Promise<GameSocket> {
  const s = getSocket();
  if (s.connected) return Promise.resolve(s);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off('connect', onConnect);
      reject(new Error("Couldn't reach the game server. Check your connection and try again."));
    }, CONNECT_TIMEOUT_MS);
    const onConnect = () => {
      clearTimeout(timer);
      resolve(s);
    };
    s.once('connect', onConnect);
    s.connect();
  });
}

async function call<T>(send: (s: GameSocket) => Promise<AckResult<T>>): Promise<T> {
  const s = await ensureConnected();
  let result: AckResult<T>;
  try {
    result = await send(s.timeout(REQUEST_TIMEOUT_MS) as GameSocket);
  } catch {
    throw new Error('The server took too long to answer. Try again.');
  }
  if (!result.ok) throw new Error(result.error);
  return result;
}

export const api = {
  createRoom: (name: string, variantId: string) =>
    call<JoinedRoom>((s) => s.emitWithAck('room:create', { name, variantId })),
  joinRoom: (code: string, name: string, token?: string) =>
    call<JoinedRoom>((s) => s.emitWithAck('room:join', { code, name, token })),
  updateRules: (rules: RuleSet) => call((s) => s.emitWithAck('room:updateRules', rules)),
  addBot: (difficulty: BotDifficulty) => call((s) => s.emitWithAck('room:addBot', { difficulty })),
  removeSeat: (playerId: string) => call((s) => s.emitWithAck('room:removeSeat', { playerId })),
  leaveRoom: () => {
    getSocket().emit('room:leave');
  },
};
