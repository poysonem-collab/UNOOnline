import { describe, expect, it } from 'vitest';
import {
  BOT_LEVELS,
  buildGiantDecks,
  classic,
  CUSTOM_EFFECTS,
  describeCard,
  describeEvent,
  giant,
  getVariant,
  nextRandom,
  sanitizeRules,
  type Action,
  type ActionResult,
  type CustomEffect,
  type GameState,
  type RuleSet,
} from '../src/index.js';
import { cardId, makeState, totalCards } from './helpers.js';

const { applyAction, createGame, chooseBotMove } = giant;

/** A Giant UNO table where the first blank wild (custom1) does `effect`. */
function table(effect: CustomEffect, opts: Parameters<typeof makeState>[0]): GameState {
  return makeState({
    ...opts,
    variantId: 'giant',
    rules: { ...giant.defaultRules, customWilds: [{ name: '', effect }, { name: 'Party time', effect: 'wild' }], ...opts.rules },
  });
}

function ok(result: ActionResult): Extract<ActionResult, { ok: true }> {
  if (!result.ok) throw new Error(result.error);
  return result;
}

const act = (state: GameState, seat: number, action: Action) => ok(applyAction(state, seat, action)).state;
const sizes = (state: GameState) => state.players.map((p) => p.hand.length);

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    const [r, next] = nextRandom(s);
    s = next;
    return r;
  };
}

describe('Giant UNO deck and rules', () => {
  it('is the classic 108 cards plus two blank wilds', () => {
    const deck = buildGiantDecks(1);
    expect(deck).toHaveLength(110);
    expect(deck.filter((c) => c.value === 'custom1' || c.value === 'custom2')).toHaveLength(2);
    expect(buildGiantDecks(2)).toHaveLength(220);
    expect(new Set(buildGiantDecks(2).map((c) => c.id)).size).toBe(220);
    const players = [{ id: 'a', name: 'A', isBot: false }, { id: 'b', name: 'B', isBot: false }];
    expect(totalCards(createGame(players, giant.defaultRules, 3))).toBe(110);
    expect(getVariant('giant')).toBe(giant);
  });

  it('lets the host write on the blank cards, within reason', () => {
    const rules = sanitizeRules(giant, {
      customWilds: [{ name: '  Everybody\u0007   dance now please ok  ', effect: 'swapHands' }, { name: 42, effect: 'explode' }, { name: 'extra', effect: 'wild' }],
    });
    expect(rules.customWilds).toEqual([
      { name: 'Everybody dance now', effect: 'swapHands' },
      { name: '', effect: 'everyoneDraws2' },
    ]);
    expect(sanitizeRules(giant, { customWilds: 'nope' }).customWilds).toEqual(giant.defaultRules.customWilds);
    // Other games have no blank cards.
    expect(sanitizeRules(classic, { customWilds: [{ name: 'x', effect: 'wild' }] }).customWilds).toEqual([]);
  });

  it("names a blank card by what's written on it", () => {
    const rules = { customWilds: [{ name: '', effect: 'shuffleHands' as const }, { name: 'Party time', effect: 'wild' as const }] };
    expect(describeCard({ color: 'wild', value: 'custom1' }, rules)).toBe('Wild: Shuffle hands');
    expect(describeCard({ color: 'wild', value: 'custom2' }, rules)).toBe('Wild: Party time');
    expect(describeCard({ color: 'wild', value: 'custom1' })).toBe('Blank Wild');
  });
});

describe('blank wild effects', () => {
  it('Everyone else draws 2', () => {
    const state = table('everyoneDraws2', { hands: [['custom1', 'r1'], ['b1'], ['g1'], ['y1']], top: 'r5' });
    const result = ok(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'blue' }));
    expect(sizes(result.state)).toEqual([1, 3, 3, 3]);
    expect(result.state.currentPlayer).toBe(1);
    expect(result.state.currentColor).toBe('blue');
    expect(describeEvent(result.events.find((e) => e.type === 'everyoneDrew')!, state.players, 1)).toBe('Everyone except Player 0 draws 2');
  });

  it('Shuffle hands: all the cards are dealt back out evenly, starting with the next player', () => {
    const state = table('shuffleHands', { hands: [['custom1', 'r1', 'r2'], ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], ['g1']], top: 'r5' });
    const after = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'red' });
    // 2 + 6 + 1 = 9 cards: 3 each.
    expect(sizes(after)).toEqual([3, 3, 3]);
    expect(totalCards(after)).toBe(totalCards(state));
    expect(after.currentPlayer).toBe(1);
    // Nobody's caught out on UNO after a shuffle.
    expect(after.unoVulnerable).toBeNull();
  });

  it('Swap hands: needs someone to swap with', () => {
    const state = table('swapHands', { hands: [['custom1', 'r1', 'r2', 'r3'], ['b1'], ['g1', 'g2']], top: 'r5' });
    const id = cardId(state, 0, 0);
    expect(applyAction(state, 0, { type: 'play', cardIds: [id], color: 'red' }).ok).toBe(false);
    const after = act(state, 0, { type: 'play', cardIds: [id], color: 'red', swapWith: 1 });
    expect(sizes(after)).toEqual([1, 3, 2]);
  });

  it('Skip two players: the next two miss out (with three players, you go again)', () => {
    const four = table('skipTwo', { hands: [['custom1', 'r1'], ['b1'], ['g1'], ['y1']], top: 'r5' });
    expect(act(four, 0, { type: 'play', cardIds: [cardId(four, 0, 0)], color: 'red' }).currentPlayer).toBe(3);
    const three = table('skipTwo', { hands: [['custom1', 'r1'], ['b1'], ['g1']], top: 'r5' });
    expect(act(three, 0, { type: 'play', cardIds: [cardId(three, 0, 0)], color: 'red' }).currentPlayer).toBe(0);
  });

  it('Play again', () => {
    const state = table('playAgain', { hands: [['custom1', 'r1'], ['b1'], ['g1']], top: 'r5' });
    expect(act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'green' }).currentPlayer).toBe(0);
  });

  it('Discard a color: needs the color to throw away', () => {
    const state = table('discardColor', { hands: [['custom1', 'b1', 'b2', 'r3'], ['y1']], top: 'r5' });
    const id = cardId(state, 0, 0);
    expect(applyAction(state, 0, { type: 'play', cardIds: [id], color: 'red' }).ok).toBe(false);
    const after = act(state, 0, { type: 'play', cardIds: [id], color: 'red', discardColor: 'blue' });
    expect(after.players[0]!.hand.map((c) => c.color)).toEqual(['red']);
    expect(after.discardPile.at(-1)!.value).toBe('custom1');
  });

  it('Plain wild, and going out on a blank card ends the round', () => {
    const state = table('wild', { hands: [['custom1', 'r1'], ['b1']], top: 'r5' });
    expect(act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'green' }).currentPlayer).toBe(1);
    const last = table('shuffleHands', { hands: [['custom1'], ['b1', 'b2']], top: 'r5' });
    const done = act(last, 0, { type: 'play', cardIds: [cardId(last, 0, 0)], color: 'green' });
    expect(done.phase).toBe('gameOver');
    expect(done.players[0]!.hand).toHaveLength(0);
  });
});

describe('Giant UNO bots', () => {
  it('give every blank card what it needs (a swap target, a color to discard)', () => {
    for (const effect of CUSTOM_EFFECTS) {
      const state = table(effect, { hands: [['custom1', 'b1', 'b2', 'b7', 'g4'], ['r1', 'r2'], ['y1', 'y2', 'y3']], top: 'y5' });
      for (const level of BOT_LEVELS) {
        for (const action of chooseBotMove(state, 0, level, () => 0.5)) {
          expect(applyAction(state, 0, action).ok, `${effect} / ${level}`).toBe(true);
        }
      }
    }
  });

  it('play whole games with every kind of blank card', { timeout: 60_000 }, () => {
    for (let seed = 0; seed < 70; seed++) {
      const n = 2 + (seed % 9);
      const levels = Array.from({ length: n }, (_, i) => BOT_LEVELS[(i + seed) % 4]!);
      const players = levels.map((_, i) => ({ id: `b${i}`, name: `Bot ${i}`, isBot: true }));
      const effects = [CUSTOM_EFFECTS[seed % CUSTOM_EFFECTS.length]!, CUSTOM_EFFECTS[(seed + 3) % CUSTOM_EFFECTS.length]!];
      const rules: RuleSet = { ...giant.defaultRules, customWilds: effects.map((effect) => ({ name: '', effect })), sevenZero: seed % 3 === 0 };
      let state = createGame(players, rules, seed);
      const random = seeded(seed + 11);
      const decks = state.rules.deckCount;
      for (let step = 0; step < 20_000 && state.phase === 'playing' || state.phase === 'playDrawn'; step++) {
        const seat = state.currentPlayer;
        for (const action of chooseBotMove(state, seat, levels[seat]!, random)) {
          const result = applyAction(state, seat, action);
          if (!result.ok) throw new Error(`seed ${seed}: ${result.error} (${JSON.stringify(action)})`);
          state = result.state;
        }
        expect(totalCards(state)).toBe(110 * decks);
      }
      expect(['roundOver', 'gameOver']).toContain(state.phase);
    }
  });
});
