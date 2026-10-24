import { randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  cleanName,
  getVariant,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  sanitizeRules,
  VARIANT_CATALOG,
  type Ack,
  type BotDifficulty,
  type ClientToServerEvents,
  type JoinedRoom,
  type ServerToClientEvents,
} from '@uno/shared';
import { Room, RoomError } from './Room.js';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface RoomManagerOptions {
  /** How long a disconnected player keeps their seat. */
  disconnectGraceMs: number;
}

interface Binding {
  code: string;
  playerId: string;
}

const seatKey = (code: string, playerId: string) => `${code}:${playerId}`;

/** Owns every room and routes socket events to them. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** socket.id → the seat it controls. */
  private readonly bindings = new Map<string, Binding>();
  /** seatKey → socket.id controlling that seat. */
  private readonly seatSockets = new Map<string, string>();
  /** seatKey → timer that drops a disconnected player. */
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly io: GameServer,
    private readonly options: RoomManagerOptions,
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
    socket.on('disconnect', () => this.disconnected(socket));
  }

  /** Stops all timers (used when shutting down). */
  dispose(): void {
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    this.graceTimers.clear();
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
    return { code: room.code, playerId: seat.id, token: seat.token!, lobby: room.toLobbyState() };
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
      room.setConnected(existing.id, true);
      this.bind(socket, room, existing.id);
      return { code, playerId: existing.id, token: existing.token!, lobby: room.toLobbyState() };
    }

    const name = cleanName(req.name);
    if (!name) throw new RoomError('Enter your name first');
    this.leave(socket);
    const seat = room.addHuman(name);
    this.bind(socket, room, seat.id);
    return { code, playerId: seat.id, token: seat.token!, lobby: room.toLobbyState() };
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

    const key = seatKey(binding.code, binding.playerId);
    this.graceTimers.set(
      key,
      setTimeout(() => {
        this.graceTimers.delete(key);
        if (room.seat(binding.playerId)?.connected === false) this.dropPlayer(binding.code, binding.playerId);
      }, this.options.disconnectGraceMs),
    );
  }

  /** Removes a player from a room, closing the room if no humans are left. */
  private dropPlayer(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    this.clearGrace(code, playerId);
    room.leave(playerId);
    if (room.hasHumans()) {
      this.broadcast(room);
    } else {
      this.rooms.delete(code);
      console.log(`room ${code} closed (${this.rooms.size} open)`);
    }
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

  private clearGrace(code: string, playerId: string): void {
    const key = seatKey(code, playerId);
    clearTimeout(this.graceTimers.get(key));
    this.graceTimers.delete(key);
  }

  private requireBinding(socket: GameSocket): { room: Room; playerId: string } {
    const binding = this.bindings.get(socket.id);
    const room = binding && this.rooms.get(binding.code);
    if (!binding || !room) throw new RoomError('You are not in a room');
    return { room, playerId: binding.playerId };
  }

  private broadcast(room: Room): void {
    this.io.to(room.code).emit('room:state', room.toLobbyState());
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
