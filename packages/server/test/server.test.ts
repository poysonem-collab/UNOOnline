import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  DEFAULT_RULES,
  type AckResult,
  type ClientToServerEvents,
  type KickReason,
  type LobbyState,
  type ServerToClientEvents,
} from '@uno/shared';
import { startServer } from '../src/server.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: Awaited<ReturnType<typeof startServer>>;
const clients: Client[] = [];

beforeEach(async () => {
  server = await startServer({ port: 0, disconnectGraceMs: 300 });
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

function nextState(c: Client): Promise<LobbyState> {
  return new Promise((resolve) => c.once('room:state', resolve));
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
