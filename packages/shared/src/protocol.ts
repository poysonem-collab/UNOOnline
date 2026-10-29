import { ALL_COLORS, MAX_PLAYERS, type Action, type Color, type GameEvent, type PlayerView, type RuleSet } from './types.js';
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

/** Sent to each player after every change in an online game. */
export interface GameUpdate {
  /** Only what this player is allowed to see. */
  view: PlayerView;
  /** What just happened, for the log and animations. */
  events: GameEvent[];
  /** Time left on the current player's turn timer, or null if none is running. */
  turnEndsInMs: number | null;
  /** Time until the next round starts by itself, while a round is over. */
  nextRoundInMs: number | null;
}

/** Returned to a player when they enter a room. Keep `token` secret: it reclaims the seat. */
export interface JoinedRoom {
  code: string;
  playerId: string;
  token: string;
  lobby: LobbyState;
  /** The game in progress, when rejoining mid-game. */
  game: GameUpdate | null;
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
  /** Host only: deal a game for everyone in the room. */
  'room:start': (ack: Ack) => void;
  /** Host only: end the game and go back to the lobby. */
  'room:returnToLobby': (ack: Ack) => void;
  'game:action': (action: Action, ack: Ack) => void;
  /** Host only: start the next round now instead of waiting. */
  'game:nextRound': (ack: Ack) => void;
}

export type KickReason = 'removed' | 'replaced';

export interface ServerToClientEvents {
  'room:state': (lobby: LobbyState) => void;
  /** This connection no longer has a seat: kicked by the host, or the seat was reclaimed in another tab. */
  'room:kicked': (reason: KickReason) => void;
  'game:state': (update: GameUpdate) => void;
}

const MAX_CARDS_PER_PLAY = 10;

/** Checks a move sent by a browser. Returns null if it isn't a well-formed action. */
export function parseAction(input: unknown): Action | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  switch (raw.type) {
    case 'draw':
    case 'pass':
    case 'callUno':
    case 'challenge':
      return { type: raw.type };
    case 'chooseColor':
      return ALL_COLORS.includes(raw.color as Color) ? { type: 'chooseColor', color: raw.color as Color } : null;
    case 'catchUno':
      return Number.isInteger(raw.target) && (raw.target as number) >= 0 && (raw.target as number) < MAX_PLAYERS
        ? { type: 'catchUno', target: raw.target as number }
        : null;
    case 'play': {
      const ids = raw.cardIds;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_CARDS_PER_PLAY) return null;
      if (!ids.every((id) => typeof id === 'string' && id.length <= 20)) return null;
      if (raw.color !== undefined && !ALL_COLORS.includes(raw.color as Color)) return null;
      const isSeat = (v: unknown) => v === undefined || (Number.isInteger(v) && (v as number) >= 0 && (v as number) < MAX_PLAYERS);
      const { swapWith, target } = raw;
      const swapsOk = Array.isArray(swapWith) ? swapWith.length <= MAX_CARDS_PER_PLAY && swapWith.every((s) => s !== undefined && isSeat(s)) : isSeat(swapWith);
      if (!swapsOk || !isSeat(target)) return null;
      const action: Action = { type: 'play', cardIds: ids as string[] };
      if (raw.color !== undefined) action.color = raw.color as Color;
      if (swapWith !== undefined) action.swapWith = swapWith as number | number[];
      if (target !== undefined) action.target = target as number;
      if (raw.flex === true) action.flex = true;
      if (raw.discardColor !== undefined) {
        if (!ALL_COLORS.includes(raw.discardColor as Color)) return null;
        action.discardColor = raw.discardColor as Color;
      }
      return action;
    }
    default:
      return null;
  }
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function cleanName(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}
