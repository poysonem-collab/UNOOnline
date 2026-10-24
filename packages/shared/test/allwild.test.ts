import { describe, expect, it } from 'vitest';
import {
  allWild,
  allWildPoints,
  BOT_LEVELS,
  buildAllWildDecks,
  describeEvent,
  nextRandom,
  sanitizeRules,
  type Action,
  type ActionResult,
  type GameState,
} from '../src/index.js';
import { cardId, makeState, totalCards } from './helpers.js';

const { applyAction, createGame, chooseBotMove, getPlayerView } = allWild;

/** An All Wild table. Hands use helper notation: 'wild', 'wild2', 'wild4', 'wildSkip', ... */
function table(opts: Parameters<typeof makeState>[0]): GameState {
  return makeState({ ...opts, variantId: 'all-wild' });
}

function ok(result: ActionResult): Extract<ActionResult, { ok: true }> {
  if (!result.ok) throw new Error(result.error);
  return result;
}
const act = (state: GameState, seat: number, action: Action) => ok(applyAction(state, seat, action)).state;
const play = (state: GameState, seat: number, index: number, extra: Partial<Extract<Action, { type: 'play' }>> = {}) =>
  act(state, seat, { type: 'play', cardIds: [cardId(state, seat, index)], ...extra });

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    const [r, next] = nextRandom(s);
    s = next;
    return r;
  };
}

describe('UNO All Wild deck', () => {
  it('has 112 cards, every one of them wild', () => {
    const deck = buildAllWildDecks(1);
    expect(deck).toHaveLength(112);
    expect(deck.every((c) => c.color === 'wild')).toBe(true);
    const count = (value: string) => deck.filter((c) => c.value === value).length;
    expect([count('wild'), count('wild2'), count('wildSkip'), count('wildReverse'), count('wildSkip2'), count('wildTarget2'), count('wild4'), count('wildSwap')])
      .toEqual([54, 10, 14, 14, 6, 4, 6, 4]);
  });

  it('scores a plain Wild 20 and every action card 50', () => {
    expect(allWildPoints({ color: 'wild', value: 'wild' })).toBe(20);
    expect(allWildPoints({ color: 'wild', value: 'wildSwap' })).toBe(50);
  });

  it('starts on a plain Wild and only offers the rules that make sense', () => {
    const players = [{ id: 'a', name: 'A', isBot: false }, { id: 'b', name: 'B', isBot: false }, { id: 'c', name: 'C', isBot: false }];
    for (let seed = 0; seed < 20; seed++) {
      const state = createGame(players, allWild.defaultRules, seed);
      expect(state.discardPile[0]!.value).toBe('wild');
      expect(totalCards(state)).toBe(112);
    }
    const rules = sanitizeRules(allWild, { sevenZero: true, stackSameNumber: true, challengeWild4: true, stackDraws: true });
    expect(rules).toMatchObject({ sevenZero: false, stackSameNumber: false, challengeWild4: false, stackDraws: true });
  });
});

describe('UNO All Wild cards', () => {
  it('any card goes on any card, and nobody picks a color', () => {
    const state = table({ hands: [['wild4', 'wild'], ['wild', 'wild'], ['wild']], top: 'wildSkip' });
    expect(allWild.playableCards(state, 0)).toHaveLength(2);
    const result = ok(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 1)] }));
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'played', color: null }));
    expect(describeEvent(result.events[0]!, state.players, 1)).toBe('Player 0 played Wild');
    expect(result.state.currentPlayer).toBe(1);
  });

  it('Wild Skip, Wild Reverse and the draw cards work like their classic versions', () => {
    const four = () => table({ hands: [['wildSkip', 'wildReverse', 'wild2', 'wild4', 'wild'], ['wild'], ['wild'], ['wild']], top: 'wild' });
    expect(play(four(), 0, 0).currentPlayer).toBe(2);
    const reversed = play(four(), 0, 1);
    expect([reversed.direction, reversed.currentPlayer]).toEqual([-1, 3]);
    const drew2 = play(four(), 0, 2);
    expect([drew2.players[1]!.hand.length, drew2.currentPlayer]).toEqual([3, 2]);
    const drew4 = play(four(), 0, 3);
    expect([drew4.players[1]!.hand.length, drew4.currentPlayer]).toEqual([5, 2]);
  });

  it('Wild Skip Two skips the next two players (with three players, you go again)', () => {
    const four = table({ hands: [['wildSkip2', 'wild'], ['wild'], ['wild'], ['wild']], top: 'wild' });
    expect(play(four, 0, 0).currentPlayer).toBe(3);
    const three = table({ hands: [['wildSkip2', 'wild'], ['wild'], ['wild']], top: 'wild' });
    expect(play(three, 0, 0).currentPlayer).toBe(0);
  });

  it('Wild Targeted Draw Two: the player you pick draws 2 and keeps their turn', () => {
    const state = table({ hands: [['wildTarget2', 'wild'], ['wild'], ['wild']], top: 'wild' });
    expect(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] }).ok).toBe(false);
    expect(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], target: 0 }).ok).toBe(false);
    const result = ok(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], target: 2 }));
    expect(result.state.players.map((p) => p.hand.length)).toEqual([1, 1, 3]);
    expect(result.state.currentPlayer).toBe(1);
    expect(describeEvent(result.events.find((e) => e.type === 'targeted')!, state.players, 2)).toBe('Player 0 made you draw 2');
  });

  it('Wild Forced Swap trades hands with the player you pick', () => {
    const state = table({ hands: [['wildSwap', 'wild', 'wild', 'wild'], ['wild'], ['wild', 'wild']], top: 'wild' });
    expect(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] }).ok).toBe(false);
    const after = play(state, 0, 0, { swapWith: 1 });
    expect(after.players.map((p) => p.hand.length)).toEqual([1, 3, 2]);
  });

  it('can stack draw cards when the host turns it on', () => {
    const state = table({ hands: [['wild2', 'wild'], ['wild4', 'wild'], ['wild']], top: 'wild', rules: { stackDraws: true } });
    const stacked = play(play(state, 0, 0), 1, 0);
    expect(stacked.pendingDraw).toBe(6);
    expect(stacked.currentPlayer).toBe(2);
  });

  it('shows no color in play', () => {
    const view = getPlayerView(table({ hands: [['wild'], ['wild']], top: 'wild' }), 0);
    expect(view.variantId).toBe('all-wild');
  });
});

describe('UNO All Wild bots', () => {
  it('give Targeted Draw Two and Forced Swap a target (the player with fewest cards, unless Easy)', () => {
    const state = table({ hands: [['wildTarget2', 'wildSwap', 'wild', 'wild', 'wild'], ['wild', 'wild', 'wild'], ['wild']], top: 'wild' });
    for (const level of BOT_LEVELS) {
      const moves = chooseBotMove(state, 0, level, () => 0.5);
      for (const action of moves) expect(applyAction(state, 0, action).ok, level).toBe(true);
    }
    // Someone is down to one card: a strong bot makes them draw.
    const move = chooseBotMove(state, 0, 'hard', () => 0.5).at(-1)!;
    expect(move).toMatchObject({ type: 'play', cardIds: [cardId(state, 0, 0)], target: 2 });
  });

  it('play whole games at every size and level', { timeout: 120_000 }, () => {
    for (let seed = 0; seed < 60; seed++) {
      const n = 2 + (seed % 9);
      const levels = Array.from({ length: n }, (_, i) => BOT_LEVELS[(i + seed) % 4]!);
      const players = levels.map((_, i) => ({ id: `b${i}`, name: `Bot ${i}`, isBot: true }));
      let state = createGame(players, { ...allWild.defaultRules, stackDraws: seed % 2 === 0 }, seed);
      const random = seeded(seed + 5);
      for (let step = 0; step < 20_000 && (state.phase === 'playing' || state.phase === 'playDrawn'); step++) {
        const seat = state.currentPlayer;
        for (const action of chooseBotMove(state, seat, levels[seat]!, random)) {
          const result = applyAction(state, seat, action);
          if (!result.ok) throw new Error(`seed ${seed}: ${result.error} (${JSON.stringify(action)})`);
          state = result.state;
        }
        expect(totalCards(state)).toBe(112 * state.rules.deckCount);
      }
      expect(['roundOver', 'gameOver']).toContain(state.phase);
    }
  });
});
