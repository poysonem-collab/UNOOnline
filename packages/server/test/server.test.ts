import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  DEFAULT_RULES,
  playableIdsFromView,
  type AckResult,
  type ClientToServerEvents,
  type GameUpdate,
  type KickReason,
  type LobbyState,
  type ServerToClientEvents,
} from '@uno/shared';
import { startServer } from '../src/server.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: Awaited<ReturnType<typeof startServer>>;
const clients: Client[] = [];

beforeEach(async () => {
  server = await startServer({
    port: 0,
    disconnectGraceMs: 300,
    abandonedGameMs: 300,
    runner: { botDelayMs: [5, 10], takeoverMs: 150, nextRoundMs: 200 },
  });
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server.close();
});

async function client(): Promise<Client> {
  const c: Client = connect(`http://localhost:${server.port}`, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  await new Promise<void>((resolve) => c.on('connect', resolve));
  return c;
}

function ok<T>(result: AckResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result;
}

function nextState(c: Client, matches: (lobby: LobbyState) => boolean = () => true): Promise<LobbyState> {
  return new Promise((resolve) => {
    const listener = (lobby: LobbyState) => {
      if (!matches(lobby)) return;
      c.off('room:state', listener);
      resolve(lobby);
    };
    c.on('room:state', listener);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function createRoom(name = 'Host') {
  const c = await client();
  const joined = ok(await c.emitWithAck('room:create', { name, variantId: 'classic' }));
  return { c, joined };
}

async function joinRoom(code: string, name = 'Guest', token?: string) {
  const c = await client();
  const joined = ok(await c.emitWithAck('room:join', { code, name, token }));
  return { c, joined };
}

describe('lobby server', () => {
  it('creates a room with a 4-letter code', async () => {
    const { joined } = await createRoom();
    expect(joined.code).toMatch(/^[A-Z]{4}$/);
    expect(joined.lobby.hostId).toBe(joined.playerId);
    expect(joined.lobby.seats).toHaveLength(1);
  });

  it('rejects locked versions and blank names', async () => {
    const c = await client();
    expect(await c.emitWithAck('room:create', { name: 'A', variantId: 'flip' })).toMatchObject({ ok: false });
    expect(await c.emitWithAck('room:create', { name: '   ', variantId: 'classic' })).toMatchObject({ ok: false });
  });

  it('lets friends join by code (any case) and tells everyone', async () => {
    const { c: host, joined } = await createRoom();
    const update = nextState(host);
    const { joined: guest } = await joinRoom(joined.code.toLowerCase());
    expect(guest.lobby.seats.map((s) => s.name)).toEqual(['Host', 'Guest']);
    expect((await update).seats).toHaveLength(2);
  });

  it('gives a clear error for an unknown code', async () => {
    const c = await client();
    const result = await c.emitWithAck('room:join', { code: 'ZZZZ', name: 'X' });
    expect(result).toEqual({ ok: false, error: 'No room with code ZZZZ' });
  });

  it('broadcasts host rule changes, and ignores rules that are not offered yet', async () => {
    const { c: host, joined } = await createRoom();
    const { c: guest } = await joinRoom(joined.code);
    const update = nextState(guest);
    ok(await host.emitWithAck('room:updateRules', { ...DEFAULT_RULES, handSize: 5, jumpIn: true, winCondition: 'points500' }));
    const lobby = await update;
    expect(lobby.rules.handSize).toBe(5);
    expect(lobby.rules.winCondition).toBe('points500');
    expect(lobby.rules.jumpIn).toBe(false);
  });

  it('does not let guests change rules', async () => {
    const { joined } = await createRoom();
    const { c: guest } = await joinRoom(joined.code);
    const result = await guest.emitWithAck('room:updateRules', { ...DEFAULT_RULES, handSize: 5 });
    expect(result).toEqual({ ok: false, error: 'Only the host can do that' });
  });

  it('lets the host add bots up to 10 seats', async () => {
    const { c: host, joined } = await createRoom();
    for (let i = 0; i < 9; i++) ok(await host.emitWithAck('room:addBot', { difficulty: 'easy' }));
    expect(await host.emitWithAck('room:addBot', { difficulty: 'easy' })).toMatchObject({ ok: false, error: 'The room is full' });
    const late = await client();
    expect(await late.emitWithAck('room:join', { code: joined.code, name: 'Late' })).toMatchObject({ ok: false });
  });

  it('lets the host kick a player, who is told about it', async () => {
    const { c: host, joined } = await createRoom();
    const { c: guest, joined: g } = await joinRoom(joined.code);
    const kicked = new Promise<KickReason>((resolve) => guest.once('room:kicked', resolve));
    ok(await host.emitWithAck('room:removeSeat', { playerId: g.playerId }));
    expect(await kicked).toBe('removed');
    expect(await guest.emitWithAck('room:updateRules', DEFAULT_RULES)).toMatchObject({ error: 'You are not in a room' });
  });

  it('passes host on when the host leaves, and closes empty rooms', async () => {
    const { c: host, joined } = await createRoom();
    const { c: guest, joined: g } = await joinRoom(joined.code);
    const update = nextState(guest);
    host.emit('room:leave');
    expect((await update).hostId).toBe(g.playerId);

    guest.emit('room:leave');
    await wait(50);
    expect(server.rooms.roomCount).toBe(0);
  });

  it('lets a player reclaim their seat after a refresh', async () => {
    const { c: host, joined } = await createRoom();
    const { c: guest, joined: g } = await joinRoom(joined.code, 'Guest');

    const disconnected = nextState(host);
    guest.disconnect();
    expect((await disconnected).seats[1]).toMatchObject({ name: 'Guest', connected: false });

    const { joined: back } = await joinRoom(joined.code, 'ignored', g.token);
    expect(back.playerId).toBe(g.playerId);
    expect(back.lobby.seats[1]).toMatchObject({ name: 'Guest', connected: true });
    await wait(400); // past the grace period: the reclaimed seat must survive
    expect(back.lobby.seats).toHaveLength(2);
  });

  it('drops a player who does not come back', async () => {
    const { joined } = await createRoom();
    const { c: guest } = await joinRoom(joined.code);
    guest.disconnect();
    await wait(450);
    const { joined: again } = await joinRoom(joined.code, 'Third');
    expect(again.lobby.seats.map((s) => s.name)).toEqual(['Host', 'Third']);
  });

  it('moves a seat to a new tab and tells the old tab', async () => {
    const { joined } = await createRoom();
    const { c: first, joined: g } = await joinRoom(joined.code);
    const replaced = new Promise<KickReason>((resolve) => first.once('room:kicked', resolve));
    const { joined: second } = await joinRoom(joined.code, 'x', g.token);
    expect(await replaced).toBe('replaced');
    expect(second.lobby.seats).toHaveLength(2);
  });

  it('serves the health check', async () => {
    const res = await fetch(`http://localhost:${server.port}/health`);
    expect(await res.text()).toBe('ok');
  });
});

/** Keeps the latest game update a client has received. */
function trackGame(c: Client) {
  const box: { update: GameUpdate | null } = { update: null };
  c.on('game:state', (u) => (box.update = u));
  return box;
}

async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('Timed out waiting');
    await wait(10);
  }
}

describe('online games', () => {
  async function roomWithGuest() {
    const host = await createRoom('Host');
    const guest = await joinRoom(host.joined.code, 'Guest');
    return { host, guest, code: host.joined.code };
  }

  it('only the host can start, and needs at least two players', async () => {
    const solo = await createRoom('Solo');
    expect(await solo.c.emitWithAck('room:start')).toMatchObject({ ok: false, error: 'Add a bot or invite a friend first' });

    const { guest } = await roomWithGuest();
    expect(await guest.c.emitWithAck('room:start')).toMatchObject({ ok: false, error: 'Only the host can do that' });
  });

  it('deals everyone their own hand when the host starts', async () => {
    const { host, guest } = await roomWithGuest();
    ok(await host.c.emitWithAck('room:addBot', { difficulty: 'normal' }));
    const hostGame = trackGame(host.c);
    const guestGame = trackGame(guest.c);
    const lobby = nextState(guest.c, (l) => l.status === 'playing');
    ok(await host.c.emitWithAck('room:start'));

    expect((await lobby).seats).toHaveLength(3);
    await until(() => hostGame.update !== null && guestGame.update !== null);
    const h = hostGame.update!.view;
    const g = guestGame.update!.view;
    expect([h.you, g.you]).toEqual([0, 1]);
    expect(h.players.map((p) => p.name)).toEqual(['Host', 'Guest', g.players[2]!.name]);
    expect(h.hand.some((card) => g.hand.some((other) => other.id === card.id))).toBe(false);
  });

  it('plays moves through the server and shares them', async () => {
    const { host, guest } = await roomWithGuest();
    const games = [trackGame(host.c), trackGame(guest.c)];
    ok(await host.c.emitWithAck('room:start'));
    await until(() => games.every((g) => g.update));

    const turn = games[0]!.update!.view.currentPlayer;
    const mover = [host.c, guest.c][turn]!;
    const watcher = games[1 - turn]!;
    const moverView = games[turn]!.update!.view;
    const idle = [host.c, guest.c][1 - turn]!;

    expect(await idle.emitWithAck('game:action', { type: 'draw' })).toMatchObject({ ok: false, error: 'It is not your turn' });
    expect(await mover.emitWithAck('game:action', { type: 'cheat' } as never)).toMatchObject({ ok: false, error: 'That move was not understood' });

    const playable = [...playableIdsFromView(moverView)];
    const action = playable.length
      ? { type: 'play' as const, cardIds: [playable[0]!], color: 'blue' as const }
      : { type: 'draw' as const };
    const before = watcher.update;
    ok(await mover.emitWithAck('game:action', action));
    await until(() => watcher.update !== before);
    expect(watcher.update!.events.length).toBeGreaterThan(0);
  });

  it('does not let new people join a game in progress', async () => {
    const { host, code } = await roomWithGuest();
    ok(await host.c.emitWithAck('room:start'));
    const late = await client();
    expect(await late.emitWithAck('room:join', { code, name: 'Late' })).toMatchObject({ ok: false, error: 'That game has already started' });
  });

  it('puts a refreshed player back into the game with their hand', async () => {
    const { host, guest, code } = await roomWithGuest();
    const guestGame = trackGame(guest.c);
    ok(await host.c.emitWithAck('room:start'));
    await until(() => guestGame.update !== null);

    guest.c.disconnect();
    const back = await joinRoom(code, 'x', guest.joined.token);
    expect(back.joined.lobby.status).toBe('playing');
    expect(back.joined.game!.view.you).toBe(1);
    expect(back.joined.game!.view.hand.length).toBeGreaterThan(0);
  });

  it('a player who leaves mid-game is replaced by a bot', async () => {
    const { host, guest } = await roomWithGuest();
    const hostGame = trackGame(host.c);
    ok(await host.c.emitWithAck('room:start'));
    await until(() => hostGame.update !== null);
    const lobby = nextState(host.c, (l) => l.seats[1]?.isBot === true);
    guest.c.emit('room:leave');
    const after = await lobby;
    expect(after.seats[1]).toMatchObject({ name: 'Guest', isBot: true });
    await until(() => hostGame.update!.view.players[1]!.isBot);
  });

  it('keeps a disconnected player in the game and lets a bot cover them', async () => {
    const { host, guest } = await roomWithGuest();
    const hostGame = trackGame(host.c);
    ok(await host.c.emitWithAck('room:start'));
    await until(() => hostGame.update !== null);
    guest.c.disconnect();
    await wait(400); // past both the lobby grace period and the takeover delay
    const view = hostGame.update!.view;
    expect(view.players).toHaveLength(2);
    expect(view.players[1]!.isBot).toBe(false);
  });

  it('closes a game when every human is gone', async () => {
    const { host, guest } = await roomWithGuest();
    ok(await host.c.emitWithAck('room:addBot', { difficulty: 'easy' }));
    ok(await host.c.emitWithAck('room:start'));
    host.c.disconnect();
    guest.c.disconnect();
    await wait(500);
    expect(server.rooms.roomCount).toBe(0);
  });

  it('lets the host take everyone back to the lobby', async () => {
    const { host, guest } = await roomWithGuest();
    ok(await host.c.emitWithAck('room:start'));
    expect(await guest.c.emitWithAck('room:returnToLobby')).toMatchObject({ ok: false });
    const lobby = nextState(guest.c, (l) => l.status === 'lobby');
    ok(await host.c.emitWithAck('room:returnToLobby'));
    expect((await lobby).seats).toHaveLength(2);
    expect(await host.c.emitWithAck('game:action', { type: 'draw' })).toMatchObject({ error: 'The game has not started' });
    ok(await host.c.emitWithAck('room:start'));
  });

  it('cannot kick players during a game', async () => {
    const { host, guest } = await roomWithGuest();
    ok(await host.c.emitWithAck('room:start'));
    expect(await host.c.emitWithAck('room:removeSeat', { playerId: guest.joined.playerId })).toMatchObject({ ok: false });
  });
});
