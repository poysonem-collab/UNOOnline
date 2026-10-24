import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, MAX_PLAYERS } from '@uno/shared';
import { Room } from '../src/rooms/Room.js';

function room() {
  const r = new Room('ABCD', 'classic', DEFAULT_RULES);
  const host = r.addHuman('Sam');
  return { r, host };
}

describe('Room', () => {
  it('makes the first player host', () => {
    const { r, host } = room();
    r.addHuman('Alex');
    expect(r.hostId).toBe(host.id);
  });

  it('keeps names distinct', () => {
    const { r } = room();
    expect(r.addHuman('sam').name).toBe('sam 2');
    expect(r.addHuman('Sam').name).toBe('Sam 3');
  });

  it('caps the room at 10 seats, humans and bots together', () => {
    const { r, host } = room();
    for (let i = 1; i < MAX_PLAYERS - 3; i++) r.addHuman(`P${i}`);
    for (let i = 0; i < 3; i++) r.addBot(host.id, 'normal');
    expect(r.seats).toHaveLength(MAX_PLAYERS);
    expect(() => r.addHuman('Late')).toThrow(/full/);
    expect(() => r.addBot(host.id, 'easy')).toThrow(/full/);
  });

  it('gives bots unique names', () => {
    const { r, host } = room();
    const names = [r.addBot(host.id, 'easy'), r.addBot(host.id, 'normal')].map((s) => s.name);
    expect(new Set(names).size).toBe(2);
  });

  it('only lets the host change rules, add bots and remove seats', () => {
    const { r, host } = room();
    const guest = r.addHuman('Alex');
    expect(() => r.updateRules(guest.id, { ...DEFAULT_RULES, handSize: 5 })).toThrow(/Only the host/);
    expect(() => r.addBot(guest.id, 'easy')).toThrow(/Only the host/);
    expect(() => r.removeSeat(guest.id, host.id)).toThrow(/Only the host/);

    r.updateRules(host.id, { ...DEFAULT_RULES, handSize: 5 });
    expect(r.rules.handSize).toBe(5);
    r.removeSeat(host.id, guest.id);
    expect(r.seats).toHaveLength(1);
  });

  it('passes host to the next human when the host leaves', () => {
    const { r, host } = room();
    r.addBot(host.id, 'easy');
    const guest = r.addHuman('Alex');
    r.leave(host.id);
    expect(r.hostId).toBe(guest.id);
  });

  it('prefers a connected player as the new host', () => {
    const { r, host } = room();
    const away = r.addHuman('Away');
    const here = r.addHuman('Here');
    r.setConnected(away.id, false);
    r.leave(host.id);
    expect(r.hostId).toBe(here.id);
  });

  it('keeps host while the host is briefly disconnected', () => {
    const { r, host } = room();
    r.addHuman('Alex');
    r.setConnected(host.id, false);
    expect(r.hostId).toBe(host.id);
  });

  it('reports when only bots are left', () => {
    const { r, host } = room();
    r.addBot(host.id, 'easy');
    r.leave(host.id);
    expect(r.hasHumans()).toBe(false);
  });

  it('never exposes tokens in the lobby state', () => {
    const { r, host } = room();
    expect(JSON.stringify(r.toLobbyState())).not.toContain(host.token!);
    expect(r.findByToken(host.token!)?.id).toBe(host.id);
  });
});
