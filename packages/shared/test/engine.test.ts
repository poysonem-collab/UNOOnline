import { describe, expect, it } from 'vitest';
import {
  classic,
  DEFAULT_RULES,
  type Action,
  type ActionResult,
  type Color,
  type GameState,
  type PlayerInfo,
} from '../src/index.js';
import { cardId, makeState, totalCards } from './helpers.js';

const { applyAction, createGame, startNextRound, getPlayerView } = classic;

function players(n: number): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: false }));
}

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(`Expected success, got: ${result.error}`);
  return result.state;
}

function err(result: ActionResult): string {
  if (result.ok) throw new Error('Expected an error');
  return result.error;
}

function play(state: GameState, seat: number, index: number, color?: Color) {
  return applyAction(state, seat, { type: 'play', cardIds: [cardId(state, seat, index)], color });
}

describe('createGame', () => {
  it('deals hands and flips a non-wild start card', () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = createGame(players(4), DEFAULT_RULES, seed);
      const dealtCounts = state.players.map((p) => p.hand.length);
      // A starting +2 gives the first player two extra cards.
      expect(dealtCounts.filter((n) => n === 7).length).toBeGreaterThanOrEqual(3);
      expect(state.discardPile).toHaveLength(1);
      expect(state.discardPile[0]!.color).not.toBe('wild');
      expect(totalCards(state)).toBe(108);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(createGame(players(3), DEFAULT_RULES, 7)).toEqual(createGame(players(3), DEFAULT_RULES, 7));
  });

  it('supports 2 to 10 players', () => {
    expect(() => createGame(players(1), DEFAULT_RULES, 1)).toThrow();
    expect(() => createGame(players(11), DEFAULT_RULES, 1)).toThrow();
    expect(createGame(players(10), DEFAULT_RULES, 1).players).toHaveLength(10);
  });

  it('requires two decks for huge hands', () => {
    const rules = { ...DEFAULT_RULES, handSize: 10 };
    expect(() => createGame(players(10), rules, 1)).toThrow();
    expect(totalCards(createGame(players(10), { ...rules, deckCount: 2 }, 1))).toBe(216);
  });
});

describe('playing cards', () => {
  it('allows matching color or value', () => {
    const state = makeState({ hands: [['r9', 'b5', 'g2'], ['y1']], top: 'r5' });
    expect(play(state, 0, 0).ok).toBe(true); // color
    expect(play(state, 0, 1).ok).toBe(true); // number
    expect(err(play(state, 0, 2))).toMatch(/cannot be played/);
  });

  it('does not mutate the previous state', () => {
    const state = makeState({ hands: [['r9', 'b5'], ['y1']], top: 'r5' });
    const before = structuredClone(state);
    ok(play(state, 0, 0));
    expect(state).toEqual(before);
  });

  it('rejects out-of-turn plays and unknown cards', () => {
    const state = makeState({ hands: [['r9'], ['r1']], top: 'r5' });
    expect(err(play(state, 1, 0))).toMatch(/not your turn/);
    expect(err(applyAction(state, 0, { type: 'play', cardIds: ['nope'] }))).toMatch(/do not have/);
  });

  it('requires a color for wilds and sets it', () => {
    const state = makeState({ hands: [['wild', 'r1'], ['y1']], top: 'r5' });
    expect(err(play(state, 0, 0))).toMatch(/Choose a color/);
    const next = ok(play(state, 0, 0, 'blue'));
    expect(next.currentColor).toBe('blue');
    expect(next.currentPlayer).toBe(1);
  });

  it('only matches the chosen color after a wild', () => {
    const state = makeState({ hands: [['r9', 'b2'], ['y1']], top: 'wild', color: 'blue' });
    expect(play(state, 0, 0).ok).toBe(false);
    expect(play(state, 0, 1).ok).toBe(true);
  });

  it('skip skips the next player', () => {
    const state = makeState({ hands: [['rskip', 'r1'], ['y1'], ['g1']], top: 'r5' });
    expect(ok(play(state, 0, 0)).currentPlayer).toBe(2);
  });

  it('reverse flips direction', () => {
    const state = makeState({ hands: [['rreverse', 'r1'], ['y1'], ['g1']], top: 'r5' });
    const next = ok(play(state, 0, 0));
    expect(next.direction).toBe(-1);
    expect(next.currentPlayer).toBe(2);
  });

  it('reverse acts as skip with two players', () => {
    const state = makeState({ hands: [['rreverse', 'r1'], ['y1']], top: 'r5' });
    expect(ok(play(state, 0, 0)).currentPlayer).toBe(0);
  });

  it('+2 makes the next player draw 2 and lose their turn', () => {
    const state = makeState({ hands: [['rdraw2', 'r1'], ['y1'], ['g1']], top: 'r5' });
    const next = ok(play(state, 0, 0));
    expect(next.players[1]!.hand).toHaveLength(3);
    expect(next.currentPlayer).toBe(2);
  });

  it('wild +4 makes the next player draw 4 and lose their turn', () => {
    const state = makeState({ hands: [['wild4', 'r1'], ['y1'], ['g1']], top: 'r5' });
    const next = ok(play(state, 0, 0, 'green'));
    expect(next.players[1]!.hand).toHaveLength(5);
    expect(next.currentPlayer).toBe(2);
    expect(next.currentColor).toBe('green');
  });
});

describe('drawing', () => {
  it('passes the turn when the drawn card is not playable', () => {
    const state = makeState({ hands: [['b1'], ['y1']], top: 'g5', drawPile: ['b9'] });
    const next = ok(applyAction(state, 0, { type: 'draw' }));
    expect(next.players[0]!.hand).toHaveLength(2);
    expect(next.currentPlayer).toBe(1);
    expect(next.phase).toBe('playing');
  });

  it('lets the player play or keep a playable drawn card', () => {
    const state = makeState({ hands: [['b1', 'g7'], ['y1']], top: 'g5', drawPile: ['g9'] });
    const drawn = ok(applyAction(state, 0, { type: 'draw' }));
    expect(drawn.phase).toBe('playDrawn');
    expect(drawn.currentPlayer).toBe(0);
    expect(err(applyAction(drawn, 0, { type: 'draw' }))).toMatch(/already drew/);
    expect(err(play(drawn, 0, 1))).toMatch(/only play the drawn card/);

    const played = ok(applyAction(drawn, 0, { type: 'play', cardIds: [drawn.drawnCardId!] }));
    expect(played.currentPlayer).toBe(1);

    const passed = ok(applyAction(drawn, 0, { type: 'pass' }));
    expect(passed.currentPlayer).toBe(1);
    expect(passed.players[0]!.hand).toHaveLength(3);
  });

  it('cannot pass without drawing', () => {
    const state = makeState({ hands: [['b1'], ['y1']], top: 'g5' });
    expect(err(applyAction(state, 0, { type: 'pass' }))).toMatch(/play or draw/);
  });

  it('reshuffles the discard pile when the draw pile runs out', () => {
    const state = makeState({ hands: [['b1'], ['y1']], top: 'g5', drawPile: [] });
    state.discardPile.unshift(...makeState({ hands: [], top: 'y3' }).discardPile);
    state.discardPile.unshift(...makeState({ hands: [], top: 'y4' }).discardPile);
    const top = state.discardPile.at(-1);
    const result = applyAction(state, 0, { type: 'draw' });
    const next = ok(result);
    expect(result.ok && result.events.some((e) => e.type === 'reshuffled')).toBe(true);
    expect(next.discardPile).toEqual([top]);
    expect(next.drawPile).toHaveLength(1);
    expect(next.players[0]!.hand).toHaveLength(2);
  });

  it('passes the turn when no cards are left anywhere', () => {
    const state = makeState({ hands: [['b1'], ['y1']], top: 'g5', drawPile: [] });
    const next = ok(applyAction(state, 0, { type: 'draw' }));
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.currentPlayer).toBe(1);
  });
});

describe('UNO calls', () => {
  it('a player who forgets UNO can be caught and draws 2', () => {
    const state = makeState({ hands: [['r1', 'r2'], ['y1'], ['g1']], top: 'r5' });
    const next = ok(play(state, 0, 0));
    expect(next.unoVulnerable).toBe(0);
    const caught = ok(applyAction(next, 2, { type: 'catchUno', target: 0 }));
    expect(caught.players[0]!.hand).toHaveLength(3);
    expect(caught.unoVulnerable).toBeNull();
  });

  it('calling UNO before playing protects the player', () => {
    const state = makeState({ hands: [['r1', 'r2'], ['y1']], top: 'r5' });
    const called = ok(applyAction(state, 0, { type: 'callUno' }));
    const next = ok(play(called, 0, 0));
    expect(next.unoVulnerable).toBeNull();
    expect(err(applyAction(next, 1, { type: 'catchUno', target: 0 }))).toMatch(/cannot be caught/);
  });

  it('calling UNO right after playing protects the player', () => {
    const state = makeState({ hands: [['r1', 'r2'], ['y1']], top: 'r5' });
    const next = ok(applyAction(ok(play(state, 0, 0)), 0, { type: 'callUno' }));
    expect(next.unoVulnerable).toBeNull();
  });

  it('the chance to catch ends when the next player acts', () => {
    const state = makeState({ hands: [['r1', 'r2'], ['r3', 'r4'], ['g1']], top: 'r5' });
    const next = ok(play(ok(play(state, 0, 0)), 1, 0));
    expect(next.unoVulnerable).toBe(1);
    expect(err(applyAction(next, 2, { type: 'catchUno', target: 0 }))).toMatch(/cannot be caught/);
  });

  it('cannot call UNO with a big hand', () => {
    const state = makeState({ hands: [['r1', 'r2', 'r3'], ['y1']], top: 'r5' });
    expect(err(applyAction(state, 0, { type: 'callUno' }))).toMatch(/two cards or fewer/);
  });
});

describe('ending rounds', () => {
  it('first out wins the game and scores the other hands', () => {
    const state = makeState({ hands: [['r1'], ['y9', 'wild'], ['gskip']], top: 'r5' });
    const result = applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] });
    const next = ok(result);
    expect(next.phase).toBe('gameOver');
    expect(next.gameWinner).toBe(0);
    expect(next.scores[0]).toBe(9 + 50 + 20);
    expect(err(applyAction(next, 1, { type: 'draw' }))).toMatch(/round is over/);
  });

  it('a final +2 still makes the next player draw', () => {
    const state = makeState({ hands: [['rdraw2'], ['y1']], top: 'r5', drawPile: ['b2', 'b3'] });
    const next = ok(play(state, 0, 0));
    expect(next.players[1]!.hand).toHaveLength(3);
    expect(next.scores[0]).toBe(1 + 2 + 3);
  });

  it('plays several rounds to 500 points', () => {
    const state = makeState({ hands: [['r1'], ['y1']], top: 'r5', rules: { winCondition: 'points500' } });
    const after = ok(play(state, 0, 0));
    expect(after.phase).toBe('roundOver');
    expect(after.roundWinner).toBe(0);

    const round2 = ok(startNextRound(after));
    expect(round2.round).toBe(2);
    expect(round2.dealer).toBe(0);
    expect(round2.phase).toBe('playing');
    expect(round2.scores).toEqual([1, 0]);
    expect(totalCards(round2)).toBe(108);

    const nearWin = makeState({ hands: [['r1'], ['wild']], top: 'r5', rules: { winCondition: 'points500' } });
    nearWin.scores = [460, 0];
    const won = ok(play(nearWin, 0, 0));
    expect(won.phase).toBe('gameOver');
    expect(won.gameWinner).toBe(0);
  });
});

describe('player view', () => {
  it('only shows your own hand', () => {
    const state = createGame(players(3), DEFAULT_RULES, 3);
    const view = getPlayerView(state, 1);
    expect(view.hand).toEqual(state.players[1]!.hand);
    expect(view.players.map((p) => p.handCount)).toEqual(state.players.map((p) => p.hand.length));
    expect(JSON.stringify(view)).not.toContain(state.players[0]!.hand[0]!.id);
  });
});
