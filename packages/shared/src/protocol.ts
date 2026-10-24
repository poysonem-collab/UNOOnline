import type { RuleSet } from './types.js';
import type { BotDifficulty } from './variants/Variant.js';

export const ROOM_CODE_LENGTH = 4;
/** No I, L, O or 0/1-lookalikes, so codes are easy to read out loud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const MAX_NAME_LENGTH = 16;

export const BOT_NAMES = ['Ava', 'Ben', 'Cleo', 'Dex', 'Elle', 'Finn', 'Gus', 'Hana', 'Ivy', 'Jules'];

export interface LobbySeat {
  id: string;
  name: string;
  isBot: boolean;
  difficulty: BotDifficulty | null;
  /** False while a human is temporarily disconnected. */
  connected: boolean;
}

export interface LobbyState {
  code: string;
  variantId: string;
  hostId: string;
  seats: LobbySeat[];
  rules: RuleSet;
  status: 'lobby' | 'playing';
}

/** Returned to a player when they enter a room. Keep `token` secret: it reclaims the seat. */
export interface JoinedRoom {
  code: string;
  playerId: string;
  token: string;
  lobby: LobbyState;
}

export type AckResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T = object> = (result: AckResult<T>) => void;

export interface ClientToServerEvents {
  'room:create': (req: { name: string; variantId: string }, ack: Ack<JoinedRoom>) => void;
  /** With `token`, reclaims an existing seat (after a refresh or dropped connection). */
  'room:join': (req: { code: string; name: string; token?: string }, ack: Ack<JoinedRoom>) => void;
  'room:leave': () => void;
  'room:updateRules': (rules: RuleSet, ack: Ack) => void;
  'room:addBot': (req: { difficulty: BotDifficulty }, ack: Ack) => void;
  /** Host only: remove a bot or kick a player. */
  'room:removeSeat': (req: { playerId: string }, ack: Ack) => void;
}

export type KickReason = 'removed' | 'replaced';

export interface ServerToClientEvents {
  'room:state': (lobby: LobbyState) => void;
  /** This connection no longer has a seat: kicked by the host, or the seat was reclaimed in another tab. */
  'room:kicked': (reason: KickReason) => void;
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function cleanName(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}
