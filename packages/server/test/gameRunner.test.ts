import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classic, DEFAULT_RULES, nextRandom, playableIdsFromView, type GameUpdate, type RuleSet } from '@uno/shared';
import { GameRunner, type RunnerOptions, type RunnerSeat } from '../src/game/GameRunner.js';

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    const [r, next] = nextRandom(s);
    s = next;
    return r;
  };
}

const OPTIONS: RunnerOptions = { botDelayMs: [100, 200], takeoverMs: 5_000, nextRoundMs: 3_000, random: seeded(1) };

const human = (id: string): RunnerSeat => ({ id, name: id, isBot: false, difficulty: null });
const bot = (id: string): RunnerSeat => ({ id, name: id, isBot: true, difficulty: 'normal' });

/** Starts a runner and records the last update each player received. */
function start(seats: RunnerSeat[], rules: Partial<RuleSet> = {}, seed = 7) {
  const latest = new Map<string, GameUpdate>();
  const received: { to: string; update: GameUpdate }[] = [];
  const runner = new GameRunner(classic, seats, { ...DEFAULT_RULES, ...rules }, seed, (to, update) => {
    latest.set(to, update);
    received.push({ to, update });
  }, { ...OPTIONS, random: seeded(seed) });
  const view = (id: string) => latest.get(id)!.view;
  const currentId = () => seats[view(seats[0]!.id).currentPlayer]!.id;
  return { runner, latest, received, view, currentId };
}

/** A legal move for a human, worked out only from what they can see. */
function humanMove(update: GameUpdate) {
  const playable = [...playableIdsFromView(update.view)];
  if (playable.length) {
    const card = update.view.hand.find((c) => c.id === playable[0])!;
    return { type: 'play' as const, cardIds: [card.id], ...(card.color === 'wild' ? { color: 'red' as const } : {}) };
  }
  return update.view.phase === 'playDrawn' ? { type: 'pass' as const } : { type: 'draw' as const };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GameRunner', () => {
  it('plays a full game of one human against bots', () => {
    const { runner, latest, received, view } = start([human('me'), bot('b1'), bot('b2'), bot('b3')]);
    for (let i = 0; i < 5_000 && runner.phase !== 'gameOver'; i++) {
      const update = latest.get('me')!;
      if (update.view.currentPlayer === 0 && runner.phase !== 'roundOver') {
        expect(runner.apply('me', humanMove(update))).toBeNull();
      } else {
        vi.advanceTimersByTime(300);
      }
    }
    expect(runner.phase).toBe('gameOver');
    expect(view('me').gameWinner).not.toBeNull();
    // Updates only ever go to humans, and only contain their own hand.
    expect(received.every((r) => r.to === 'me' && r.update.view.you === 0)).toBe(true);
    runner.dispose();
  });

  it('sends each human only their own cards', () => {
    const { latest, runner } = start([human('a'), human('b'), bot('c')]);
    const a = latest.get('a')!.view;
    const b = latest.get('b')!.view;
    expect(a.you).toBe(0);
    expect(b.you).toBe(1);
    expect(a.hand.some((card) => b.hand.some((other) => other.id === card.id))).toBe(false);
    runner.dispose();
  });

  it('rejects moves out of turn', () => {
    const { runner, view, currentId } = start([human('a'), human('b')]);
    const other = currentId() === 'a' ? 'b' : 'a';
    expect(runner.apply(other, { type: 'draw' })).toMatch(/not your turn/);
    expect(view('a').currentPlayer).toBe(view('b').currentPlayer);
    runner.dispose();
  });

  it('draws for a player whose turn timer runs out', () => {
    const { runner, latest, currentId } = start([human('a'), human('b')], { turnTimerSeconds: 15 });
    const slow = currentId();
    const handBefore = latest.get(slow)!.view.hand.length;
    expect(latest.get(slow)!.turnEndsInMs).toBe(15_000);
    vi.advanceTimersByTime(14_999);
    expect(currentId()).toBe(slow);
    vi.advanceTimersByTime(1);
    expect(currentId()).not.toBe(slow);
    expect(latest.get(slow)!.view.hand.length).toBe(handBefore + 1);
    runner.dispose();
  });

  it('a bot covers a disconnected player after a while', () => {
    const { runner, currentId } = start([human('a'), human('b')]);
    const away = currentId();
    runner.playerDisconnected(away);
    vi.advanceTimersByTime(OPTIONS.takeoverMs - 1);
    expect(currentId()).toBe(away);
    vi.advanceTimersByTime(1 + 500);
    expect(currentId()).not.toBe(away);
    runner.dispose();
  });

  it('coming back in time cancels the takeover', () => {
    const { runner, currentId } = start([human('a'), human('b')]);
    const player = currentId();
    runner.playerDisconnected(player);
    vi.advanceTimersByTime(OPTIONS.takeoverMs / 2);
    runner.playerReconnected(player);
    vi.advanceTimersByTime(OPTIONS.takeoverMs * 2);
    expect(currentId()).toBe(player);
    runner.dispose();
  });

  it('a bot takes over the seat of a player who leaves', () => {
    const { runner, view, currentId } = start([human('a'), human('b')]);
    const leaver = currentId();
    const stayer = leaver === 'a' ? 'b' : 'a';
    runner.playerLeft(leaver);
    expect(view(stayer).players.find((p) => p.id === leaver)!.isBot).toBe(true);
    vi.advanceTimersByTime(500);
    expect(currentId()).toBe(stayer);
    runner.dispose();
  });

  it('starts the next round by itself after a pause', () => {
    const { runner } = start([human('watcher'), bot('b1'), bot('b2')], { winCondition: 'points500' });
    runner.playerLeft('watcher'); // all bots, so the round plays itself
    for (let i = 0; i < 5_000 && runner.phase !== 'roundOver'; i++) vi.advanceTimersByTime(300);
    expect(runner.phase).toBe('roundOver');
    // Time moves in 300ms steps, so the round may have ended a little before we looked.
    expect(runner.updateFor('watcher')!.nextRoundInMs).toBeGreaterThan(OPTIONS.nextRoundMs - 300);
    vi.advanceTimersByTime(OPTIONS.nextRoundMs);
    expect(runner.phase).toBe('playing');
    expect(runner.updateFor('watcher')!.view.round).toBe(2);
    runner.dispose();
  });

  it('stops everything when disposed', () => {
    const { runner, received } = start([human('a'), bot('b'), bot('c')]);
    runner.playerLeft('a');
    const count = received.length;
    runner.dispose();
    vi.advanceTimersByTime(60_000);
    expect(received.length).toBe(count);
  });
});
