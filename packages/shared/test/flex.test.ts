import { describe, expect, it } from 'vitest';
import {
  BOT_LEVELS,
  buildFlexDecks,
  flex,
  nextRandom,
  type Action,
  type ActionResult,
  type Color,
  type GameState,
  type WildFlex,
} from '../src/index.js';
import { cardId, makeState, totalCards } from './helpers.js';

const { applyAction, createGame, chooseBotMove, getPlayerView } = flex;

/**
 * A Flex table. `flexes` gives cards a flex side, by [seat, index, flex]; everyone's Power Card
 * starts green unless `power` says otherwise.
 */
function table(opts: Parameters<typeof makeState>[0] & { flexes?: [number, number, Color | WildFlex][]; power?: boolean[]; flips?: [number, number][] }): GameState {
  const state = makeState({ ...opts, variantId: 'flex' });
  for (const [seat, index, side] of opts.flexes ?? []) state.players[seat]!.hand[index]!.flex = side;
  for (const [seat, index] of opts.flips ?? []) state.players[seat]!.hand[index]!.flip = true;
  state.power = opts.power ?? state.players.map(() => true);
  return state;
}

function ok(result: ActionResult): Extract<ActionResult, { ok: true }> {
  if (!result.ok) throw new Error(result.error);
  return result;
}
const flexPlay = (state: GameState, seat: number, index: number, extra: Partial<Extract<Action, { type: 'play' }>> = {}) =>
  applyAction(state, seat, { type: 'play', cardIds: [cardId(state, seat, index)], flex: true, ...extra });
const sizes = (state: GameState) => state.players.map((p) => p.hand.length);

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    const [r, next] = nextRandom(s);
    s = next;
    return r;
  };
}

describe('UNO Flex deck', () => {
  it('has 104 cards: per color 1-8 twice, regular and Flex actions; and the wilds', () => {
    const deck = buildFlexDecks(1);
    expect(deck).toHaveLength(104);
    const red = deck.filter((c) => c.color === 'red');
    expect(red).toHaveLength(22);
    expect(red.filter((c) => c.flex)).toHaveLength(11);
    // A Flex card's second color is always a different one.
    expect(red.filter((c) => c.flex).every((c) => c.flex !== 'red')).toBe(true);
    expect(deck.filter((c) => c.value === 'wildAllFlip')).toHaveLength(6);
    expect(deck.filter((c) => c.value === 'wild' && c.flex === 'target2')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'wild' && c.flex === 'all2')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'wild4' && c.flex === 'target4')).toHaveLength(2);
    expect(deck.filter((c) => c.flip)).toHaveLength(8);
    expect(deck.some((c) => c.value === 0 || c.value === 9)).toBe(false);
  });

  it('starts everyone with a green Power Card', () => {
    const players = [{ id: 'a', name: 'A', isBot: false }, { id: 'b', name: 'B', isBot: false }];
    const state = createGame(players, flex.defaultRules, 4);
    expect(state.power).toEqual([true, true]);
    expect(totalCards(state)).toBe(104);
    expect(getPlayerView(state, 0).players.map((p) => p.power)).toEqual([true, true]);
  });
});

describe('flexing', () => {
  it('plays a card as its flex color; the color in play stays; the Power Card turns red', () => {
    // A blue 5 with a red flex side, on a red 2.
    const state = table({ hands: [['b5', 'g1'], ['y1'], ['y2']], top: 'r2', flexes: [[0, 0, 'red']] });
    expect(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] }).ok).toBe(false);
    const result = ok(flexPlay(state, 0, 0));
    expect(result.state.currentColor).toBe('red');
    expect(result.state.power).toEqual([false, true, true]);
    expect(result.events).toContainEqual({ type: 'flexed', seat: 0 });
    expect(result.state.currentPlayer).toBe(1);
  });

  it("needs a green Power Card, a matching flex color, your own turn, and no draw cards waiting", () => {
    const red = table({ hands: [['b5', 'g1'], ['y1']], top: 'r2', flexes: [[0, 0, 'red']], power: [false, true] });
    expect(flexPlay(red, 0, 0)).toMatchObject({ ok: false, error: expect.stringMatching(/Power Card is red/) });
    const wrongColor = table({ hands: [['b5', 'g1'], ['y1']], top: 'r2', flexes: [[0, 0, 'green']] });
    expect(flexPlay(wrongColor, 0, 0).ok).toBe(false);
    const noFlex = table({ hands: [['b5', 'g1'], ['y1']], top: 'r2' });
    expect(flexPlay(noFlex, 0, 0).ok).toBe(false);
    const pending = table({ hands: [['b5', 'g1'], ['y1']], top: 'rdraw2', flexes: [[0, 0, 'red']], rules: { stackDraws: true } });
    pending.pendingDraw = 2;
    expect(flexPlay(pending, 0, 0).ok).toBe(false);
  });

  it('Flex Draw Two: everyone else draws 1', () => {
    const state = table({ hands: [['bdraw2', 'g1'], ['y1'], ['y2']], top: 'r2', flexes: [[0, 0, 'red']] });
    const after = ok(flexPlay(state, 0, 0)).state;
    expect(sizes(after)).toEqual([1, 2, 2]);
    expect(after.currentPlayer).toBe(1);
  });

  it('Flex Skip: you play again; Flex Reverse: reverse and skip the next player', () => {
    const skip = table({ hands: [['bskip', 'g1'], ['y1'], ['y2'], ['y3']], top: 'r2', flexes: [[0, 0, 'red']] });
    expect(ok(flexPlay(skip, 0, 0)).state.currentPlayer).toBe(0);
    const rev = table({ hands: [['breverse', 'g1'], ['y1'], ['y2'], ['y3']], top: 'r2', flexes: [[0, 0, 'red']] });
    const after = ok(flexPlay(rev, 0, 0)).state;
    expect([after.direction, after.currentPlayer]).toEqual([-1, 2]);
  });

  it('Flex Wilds: pick who draws 2, or everyone else draws 2; Flex Wild Draw Four: pick who draws 4', () => {
    const target = table({ hands: [['wild', 'g1'], ['y1'], ['y2']], top: 'r2', flexes: [[0, 0, 'target2']] });
    expect(flexPlay(target, 0, 0, { color: 'green' }).ok).toBe(false);
    const t = ok(flexPlay(target, 0, 0, { color: 'green', target: 2 })).state;
    expect([sizes(t), t.currentColor, t.currentPlayer]).toEqual([[1, 1, 3], 'green', 1]);

    const all = table({ hands: [['wild', 'g1'], ['y1'], ['y2']], top: 'r2', flexes: [[0, 0, 'all2']] });
    expect(sizes(ok(flexPlay(all, 0, 0, { color: 'blue' })).state)).toEqual([1, 3, 3]);

    const four = table({ hands: [['wild4', 'g1'], ['y1'], ['y2'], ['y3']], top: 'r2', flexes: [[0, 0, 'target4']] });
    const far = ok(flexPlay(four, 0, 0, { color: 'blue', target: 2 })).state;
    expect([sizes(far), far.currentPlayer]).toEqual([[1, 1, 5, 1], 1]);
    // Aimed at the next player, it costs them their turn too.
    const near = ok(flexPlay(four, 0, 0, { color: 'blue', target: 1 })).state;
    expect([sizes(near), near.currentPlayer]).toEqual([[1, 5, 1, 1], 2]);
  });

  it('a card played normally ignores its flex side', () => {
    const state = table({ hands: [['rdraw2', 'g1'], ['y1'], ['y2']], top: 'r2', flexes: [[0, 0, 'blue']] });
    const after = ok(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] })).state;
    expect([sizes(after), after.power]).toEqual([[1, 3, 1], [true, true, true]]);
  });
});

describe('Power Cards', () => {
  it('a flip symbol turns your Power Card green again', () => {
    const state = table({ hands: [['r4', 'g1'], ['y1'], ['y2']], top: 'r2', flips: [[0, 0]], power: [false, true, true] });
    const result = ok(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] }));
    expect(result.state.power).toEqual([true, true, true]);
    expect(result.events).toContainEqual({ type: 'powerRestored', seat: 0 });
  });

  it("Wild All Flip turns everyone's Power Card over", () => {
    const state = table({ hands: [['wildAllFlip', 'g1'], ['y1'], ['y2']], top: 'r2', power: [true, false, true] });
    const after = ok(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'green' })).state;
    expect(after.power).toEqual([false, true, false]);
  });

  it('when every Power Card is red, they all turn green again', () => {
    const state = table({ hands: [['b5', 'g1'], ['y1'], ['y2']], top: 'r2', flexes: [[0, 0, 'red']], power: [true, false, false] });
    const result = ok(flexPlay(state, 0, 0));
    expect(result.state.power).toEqual([true, true, true]);
    expect(result.events).toContainEqual({ type: 'powerReset' });
  });
});

describe('UNO Flex bots', () => {
  it('flex when nothing else fits', () => {
    const state = table({ hands: [['b5', 'g1', 'y7'], ['y1'], ['y2', 'y3', 'y4']], top: 'r2', flexes: [[0, 0, 'red']] });
    for (const level of ['normal', 'hard', 'expert'] as const) {
      const move = chooseBotMove(state, 0, level, () => 0.5).at(-1)!;
      expect(move).toMatchObject({ type: 'play', cardIds: [cardId(state, 0, 0)], flex: true });
      expect(applyAction(state, 0, move).ok).toBe(true);
    }
  });

  it('strong bots spend the Power Card on a Flex Wild Draw Four at the player about to win', () => {
    const state = table({ hands: [['wild4', 'r5', 'r6', 'g1'], ['y1', 'y2', 'y3', 'y4'], ['y5']], top: 'r2', flexes: [[0, 0, 'target4']] });
    const move = chooseBotMove(state, 0, 'hard', () => 0.5).at(-1)!;
    expect(move).toMatchObject({ type: 'play', flex: true, target: 2 });
    expect(applyAction(state, 0, move).ok).toBe(true);
  });

  it('play whole games at every size and level, flexing along the way', { timeout: 120_000 }, () => {
    let flexes = 0;
    for (let seed = 0; seed < 60; seed++) {
      const n = 2 + (seed % 9);
      const levels = Array.from({ length: n }, (_, i) => BOT_LEVELS[(i + seed) % 4]!);
      const players = levels.map((_, i) => ({ id: `b${i}`, name: `Bot ${i}`, isBot: true }));
      const rules = { ...flex.defaultRules, stackDraws: seed % 2 === 0, stackSameNumber: seed % 3 === 0, sevenZero: seed % 4 === 0 };
      let state = createGame(players, rules, seed);
      const random = seeded(seed + 9);
      for (let step = 0; step < 20_000 && (state.phase === 'playing' || state.phase === 'playDrawn'); step++) {
        const seat = state.currentPlayer;
        for (const action of chooseBotMove(state, seat, levels[seat]!, random)) {
          const result = applyAction(state, seat, action);
          if (!result.ok) throw new Error(`seed ${seed}: ${result.error} (${JSON.stringify(action)})`);
          state = result.state;
          flexes += result.events.filter((e) => e.type === 'flexed').length;
        }
        expect(totalCards(state)).toBe(104 * state.rules.deckCount);
      }
      expect(['roundOver', 'gameOver']).toContain(state.phase);
    }
    expect(flexes).toBeGreaterThan(20);
  });
});
