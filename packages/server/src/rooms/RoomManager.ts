import { randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  cleanName,
  getVariant,
  normalizeRoomCode,
  parseAction,
  randomSeed,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  rulesForPlayerCount,
  sanitizeRules,
  VARIANT_CATALOG,
  type Ack,
  type BotDifficulty,
  type ClientToServerEvents,
  type GameUpdate,
  type JoinedRoom,
  type ServerToClientEvents,
} from '@uno/shared';
import { DEFAULT_RUNNER_OPTIONS, GameRunner, type RunnerOptions } from '../game/GameRunner.js';
import { Room, RoomError } from './Room.js';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface RoomManagerOptions {
  /** How long a disconnected player keeps their lobby seat. */
  disconnectGraceMs: number;
  /** A game with no connected humans is closed after this long. */
  abandonedGameMs: number;
  runner: RunnerOptions;
}

export const DEFAULT_ROOM_OPTIONS: RoomManagerOptions = {
  disconnectGraceMs: 60_000,
  abandonedGameMs: 5 * 60_000,
  runner: DEFAULT_RUNNER_OPTIONS,
};

interface Binding {
  code: string;
  playerId: string;
}

const seatKey = (code: string, playerId: string) => `${code}:${playerId}`;

/** Owns every room and routes socket events to them. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly games = new Map<string, GameRunner>();
  /** socket.id → the seat it controls. */
  private readonly bindings = new Map<string, Binding>();
  /** seatKey → socket.id controlling that seat. */
  private readonly seatSockets = new Map<string, string>();
  /** seatKey → timer that drops a disconnected player from the lobby. */
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();
  /** room code → timer that closes a game everyone has left. */
  private readonly abandonTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly io: GameServer,
    private readonly options: RoomManagerOptions = DEFAULT_ROOM_OPTIONS,
  ) {}

  get roomCount(): number {
    return this.rooms.size;
  }

  attach(socket: GameSocket): void {
    socket.on('room:create', (req, ack) => this.handle(ack, () => this.create(socket, req)));
    socket.on('room:join', (req, ack) => this.handle(ack, () => this.join(socket, req)));
    socket.on('room:leave', () => this.leave(socket));
    socket.on('room:updateRules', (rules, ack) =>
      this.handle(ack, () => {
        const { room, playerId } = this.requireBinding(socket);
        room.updateRules(playerId, sanitizeRules(getVariant(room.variantId), rules));
        this.broadcast(room);
        return {};
      }),
    );
    socket.on('room:addBot', (req, ack) =>
      this.handle(ack, () => {
        const { room, playerId } = this.requireBinding(socket);
        const difficulty: BotDifficulty = req?.difficulty === 'easy' ? 'easy' : 'normal';
        room.addBot(playerId, difficulty);
        this.broadcast(room);
        return {};
      }),
    );
    socket.on('room:removeSeat', (req, ack) =>
      this.handle(ack, () => {
        const { room, playerId } = this.requireBinding(socket);
        const removed = room.removeSeat(playerId, String(req?.playerId));
        if (!removed.isBot) {
          this.clearGrace(room.code, removed.id);
          this.detachSeat(room.code, removed.id, 'removed');
        }
        this.broadcast(room);
        return {};
      }),
    );
    socket.on('room:start', (ack) =>
      this.handle(ack, () => {
        const { room, playerId } = this.requireBinding(socket);
        this.startGame(room, playerId);
        return {};
      }),
    );
    socket.on('room:returnToLobby', (ack) =>
      this.handle(ack, () => {
        const { room, playerId } = this.requireBinding(socket);
        room.returnToLobby(playerId);
        this.endGame(room);
        this.broadcast(room);
        return {};
      }),
    );
    socket.on('game:action', (action, ack) =>
      this.handle(ack, () => {
        const { game, playerId } = this.requireGame(socket);
        const parsed = parseAction(action);
        if (!parsed) throw new RoomError('That move was not understood');
        const error = game.apply(playerId, parsed);
        if (error) throw new RoomError(error);
        return {};
      }),
    );
    socket.on('game:nextRound', (ack) =>
      this.handle(ack, () => {
        const { room, game, playerId } = this.requireGame(socket);
        if (playerId !== room.hostId) throw new RoomError('Only the host can do that');
        const error = game.nextRound();
        if (error) throw new RoomError(error);
        return {};
      }),
    );
    socket.on('disconnect', () => this.disconnected(socket));
  }

  /** Stops all timers and games (used when shutting down). */
  dispose(): void {
    for (const game of this.games.values()) game.dispose();
    for (const timer of [...this.graceTimers.values(), ...this.abandonTimers.values()]) clearTimeout(timer);
    this.games.clear();
    this.graceTimers.clear();
    this.abandonTimers.clear();
  }

  // ---------------------------------------------------------------------------

  private create(socket: GameSocket, req: { name: string; variantId: string }): JoinedRoom {
    const name = cleanName(req?.name);
    if (!name) throw new RoomError('Enter your name first');
    const listing = VARIANT_CATALOG.find((v) => v.id === req?.variantId);
    if (!listing || listing.locked) throw new RoomError('That game is not available yet');
    const variant = getVariant(listing.id);

    this.leave(socket);
    const room = new Room(this.newCode(), variant.id, variant.defaultRules);
    this.rooms.set(room.code, room);
    const seat = room.addHuman(name);
    this.bind(socket, room, seat.id);
    console.log(`room ${room.code} created (${this.rooms.size} open)`);
    return { code: room.code, playerId: seat.id, token: seat.token!, lobby: room.toLobbyState(), game: null };
  }

  private join(socket: GameSocket, req: { code: string; name: string; token?: string }): JoinedRoom {
    const code = normalizeRoomCode(String(req?.code ?? ''));
    const room = this.rooms.get(code);
    if (!room) throw new RoomError(`No room with code ${code || '(blank)'}`);

    // Reclaim a seat after a refresh or a dropped connection.
    const existing = typeof req.token === 'string' ? room.findByToken(req.token) : undefined;
    if (existing) {
      const current = this.bindings.get(socket.id);
      if (current && (current.code !== code || current.playerId !== existing.id)) this.leave(socket);
      this.detachSeat(code, existing.id, 'replaced', socket.id);
      this.clearGrace(code, existing.id);
      this.clearAbandon(code);
      room.setConnected(existing.id, true);
      const game = this.games.get(code);
      game?.playerReconnected(existing.id);
      this.bind(socket, room, existing.id);
      return {
        code,
        playerId: existing.id,
        token: existing.token!,
        lobby: room.toLobbyState(),
        game: game?.updateFor(existing.id) ?? null,
      };
    }

    const name = cleanName(req.name);
    if (!name) throw new RoomError('Enter your name first');
    this.leave(socket);
    const seat = room.addHuman(name);
    this.bind(socket, room, seat.id);
    return { code, playerId: seat.id, token: seat.token!, lobby: room.toLobbyState(), game: null };
  }

  private startGame(room: Room, playerId: string): void {
    // "Play again" from the results screen deals straight away.
    if (room.status === 'playing' && this.games.get(room.code)?.phase === 'gameOver') {
      room.returnToLobby(playerId);
      this.endGame(room);
    }
    room.start(playerId);
    const variant = getVariant(room.variantId);
    const rules = rulesForPlayerCount(room.rules, room.seats.length);
    const seats = room.seats.map(({ id, name, isBot, difficulty }) => ({ id, name, isBot, difficulty }));
    const game = new GameRunner(
      variant,
      seats,
      rules,
      randomSeed(),
      (id, update) => this.sendGame(room.code, id, update),
      this.options.runner,
    );
    this.games.set(room.code, game);
    // Players still reconnecting keep their seat for the whole game; a bot covers them meanwhile.
    for (const seat of room.seats) {
      if (!seat.isBot && !seat.connected) {
        this.clearGrace(room.code, seat.id);
        game.playerDisconnected(seat.id);
      }
    }
    this.broadcast(room);
  }

  private endGame(room: Room): void {
    this.games.get(room.code)?.dispose();
    this.games.delete(room.code);
    this.clearAbandon(room.code);
    // Back in the lobby, anyone still disconnected gets the normal grace period.
    for (const seat of room.seats) {
      if (!seat.isBot && !seat.connected) this.startGrace(room, seat.id);
    }
  }

  private leave(socket: GameSocket): void {
    const binding = this.bindings.get(socket.id);
    if (!binding) return;
    this.unbind(socket.id);
    socket.leave(binding.code);
    this.dropPlayer(binding.code, binding.playerId);
  }

  private disconnected(socket: GameSocket): void {
    const binding = this.bindings.get(socket.id);
    if (!binding) return;
    this.unbind(socket.id);
    const room = this.rooms.get(binding.code);
    if (!room) return;
    room.setConnected(binding.playerId, false);
    this.broadcast(room);

    if (room.status === 'playing') {
      this.games.get(room.code)?.playerDisconnected(binding.playerId);
      this.checkAbandoned(room);
    } else {
      this.startGrace(room, binding.playerId);
    }
  }

  /**
   * Removes a player for good. In a game their seat stays and a bot plays it.
   * Closes the room if no humans are left.
   */
  private dropPlayer(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    this.clearGrace(code, playerId);
    if (room.status === 'playing') {
      room.convertToBot(playerId);
      this.games.get(code)?.playerLeft(playerId);
    } else {
      room.leave(playerId);
    }

    if (!room.hasHumans()) {
      this.closeRoom(code);
      return;
    }
    this.broadcast(room);
    if (room.status === 'playing') this.checkAbandoned(room);
  }

  private closeRoom(code: string): void {
    this.games.get(code)?.dispose();
    this.games.delete(code);
    this.clearAbandon(code);
    this.rooms.delete(code);
    console.log(`room ${code} closed (${this.rooms.size} open)`);
  }

  private startGrace(room: Room, playerId: string): void {
    const key = seatKey(room.code, playerId);
    clearTimeout(this.graceTimers.get(key));
    this.graceTimers.set(
      key,
      setTimeout(() => {
        this.graceTimers.delete(key);
        if (room.seat(playerId)?.connected === false) this.dropPlayer(room.code, playerId);
      }, this.options.disconnectGraceMs),
    );
  }

  private clearGrace(code: string, playerId: string): void {
    const key = seatKey(code, playerId);
    clearTimeout(this.graceTimers.get(key));
    this.graceTimers.delete(key);
  }

  /** Bots shouldn't play on forever for nobody: close a game when every human has gone. */
  private checkAbandoned(room: Room): void {
    if (room.hasConnectedHumans() || this.abandonTimers.has(room.code)) return;
    this.abandonTimers.set(
      room.code,
      setTimeout(() => {
        this.abandonTimers.delete(room.code);
        if (!room.hasConnectedHumans()) this.closeRoom(room.code);
      }, this.options.abandonedGameMs),
    );
  }

  private clearAbandon(code: string): void {
    clearTimeout(this.abandonTimers.get(code));
    this.abandonTimers.delete(code);
  }

  /** Disconnects whichever socket controls a seat, telling it why. */
  private detachSeat(code: string, playerId: string, reason: 'removed' | 'replaced', exceptSocketId?: string): void {
    const socketId = this.seatSockets.get(seatKey(code, playerId));
    if (!socketId || socketId === exceptSocketId) return;
    this.unbind(socketId);
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(code);
      socket.emit('room:kicked', reason);
    }
  }

  private bind(socket: GameSocket, room: Room, playerId: string): void {
    this.bindings.set(socket.id, { code: room.code, playerId });
    this.seatSockets.set(seatKey(room.code, playerId), socket.id);
    socket.join(room.code);
    this.broadcast(room);
  }

  private unbind(socketId: string): void {
    const binding = this.bindings.get(socketId);
    if (!binding) return;
    this.bindings.delete(socketId);
    const key = seatKey(binding.code, binding.playerId);
    if (this.seatSockets.get(key) === socketId) this.seatSockets.delete(key);
  }

  private requireBinding(socket: GameSocket): { room: Room; playerId: string } {
    const binding = this.bindings.get(socket.id);
    const room = binding && this.rooms.get(binding.code);
    if (!binding || !room) throw new RoomError('You are not in a room');
    return { room, playerId: binding.playerId };
  }

  private requireGame(socket: GameSocket): { room: Room; game: GameRunner; playerId: string } {
    const { room, playerId } = this.requireBinding(socket);
    const game = this.games.get(room.code);
    if (!game) throw new RoomError('The game has not started');
    return { room, game, playerId };
  }

  private broadcast(room: Room): void {
    this.io.to(room.code).emit('room:state', room.toLobbyState());
  }

  private sendGame(code: string, playerId: string, update: GameUpdate): void {
    const socketId = this.seatSockets.get(seatKey(code, playerId));
    if (socketId) this.io.to(socketId).emit('game:state', update);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  /** Runs a request handler, replying with its result or a friendly error. */
  private handle<T extends object>(ack: Ack<T> | undefined, run: () => T): void {
    const reply: Ack<T> = typeof ack === 'function' ? ack : () => {};
    try {
      reply({ ok: true, ...run() });
    } catch (err) {
      if (err instanceof RoomError) {
        reply({ ok: false, error: err.message });
      } else {
        console.error(err);
        reply({ ok: false, error: 'Something went wrong on the server' });
      }
    }
  }
}
