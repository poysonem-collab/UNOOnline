import { randomBytes, randomUUID } from 'node:crypto';
import {
  BOT_NAMES,
  MAX_PLAYERS,
  type BotDifficulty,
  type LobbySeat,
  type LobbyState,
  type RuleSet,
} from '@uno/shared';

/** A failed request with a message safe to show the player. */
export class RoomError extends Error {}

interface Seat extends LobbySeat {
  /** Secret that lets a human reclaim this seat; null for bots. */
  token: string | null;
}

/** Lobby state for one room. Knows nothing about sockets. */
export class Room {
  readonly seats: Seat[] = [];
  hostId = '';
  status: LobbyState['status'] = 'lobby';

  constructor(
    readonly code: string,
    readonly variantId: string,
    public rules: RuleSet,
  ) {}

  /** Adds a human player. The first one becomes host. */
  addHuman(name: string): Seat {
    if (this.status !== 'lobby') throw new RoomError('That game has already started');
    if (this.seats.length >= MAX_PLAYERS) throw new RoomError('That room is full');
    const seat: Seat = {
      id: randomBytes(6).toString('base64url'),
      name: this.uniqueName(name),
      isBot: false,
      difficulty: null,
      connected: true,
      token: randomUUID(),
    };
    this.seats.push(seat);
    if (!this.hostId) this.hostId = seat.id;
    return seat;
  }

  addBot(byId: string, difficulty: BotDifficulty): Seat {
    this.requireHost(byId);
    if (this.status !== 'lobby') throw new RoomError('The game has already started');
    if (this.seats.length >= MAX_PLAYERS) throw new RoomError('The room is full');
    const used = new Set(this.seats.map((s) => s.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? this.uniqueName('Bot');
    const seat: Seat = {
      id: `bot-${randomBytes(4).toString('base64url')}`,
      name,
      isBot: true,
      difficulty,
      connected: true,
      token: null,
    };
    this.seats.push(seat);
    return seat;
  }

  /** Host removes a bot or kicks a player. Returns the removed seat. */
  removeSeat(byId: string, targetId: string): Seat {
    this.requireHost(byId);
    if (targetId === byId) throw new RoomError('Use Leave to leave the room');
    const seat = this.seat(targetId);
    if (!seat) throw new RoomError('That player is not in the room');
    this.remove(targetId);
    return seat;
  }

  updateRules(byId: string, rules: RuleSet): void {
    this.requireHost(byId);
    if (this.status !== 'lobby') throw new RoomError('Rules can only change before the game starts');
    this.rules = rules;
  }

  /** A player leaves (or is dropped after disconnecting). Hands host to the next human. */
  leave(playerId: string): void {
    this.remove(playerId);
  }

  /** Host stays with a disconnected player during the reconnect grace period, so a refresh doesn't lose it. */
  setConnected(playerId: string, connected: boolean): void {
    const seat = this.seat(playerId);
    if (seat) seat.connected = connected;
  }

  seat(playerId: string): Seat | undefined {
    return this.seats.find((s) => s.id === playerId);
  }

  findByToken(token: string): Seat | undefined {
    return this.seats.find((s) => s.token !== null && s.token === token);
  }

  hasHumans(): boolean {
    return this.seats.some((s) => !s.isBot);
  }

  toLobbyState(): LobbyState {
    return {
      code: this.code,
      variantId: this.variantId,
      hostId: this.hostId,
      seats: this.seats.map(({ token: _token, ...seat }) => seat),
      rules: this.rules,
      status: this.status,
    };
  }

  private remove(playerId: string): void {
    const index = this.seats.findIndex((s) => s.id === playerId);
    if (index === -1) return;
    this.seats.splice(index, 1);
    if (playerId === this.hostId) this.pickNewHost();
  }

  /** Next host is the first connected human, or any human if all are disconnected. */
  private pickNewHost(): void {
    const humans = this.seats.filter((s) => !s.isBot);
    this.hostId = (humans.find((s) => s.connected) ?? humans[0])?.id ?? '';
  }

  private requireHost(playerId: string): void {
    if (playerId !== this.hostId) throw new RoomError('Only the host can do that');
  }

  /** "Sam", then "Sam 2", "Sam 3"... so names in a room are distinct. */
  private uniqueName(name: string): string {
    const taken = new Set(this.seats.map((s) => s.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }
}
