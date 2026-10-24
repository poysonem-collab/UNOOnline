import { describe, expect, it } from 'vitest';
import {
  classic,
  COLORS,
  DEFAULT_RULES,
  nextRandom,
  playableIdsFromView,
  type Action,
  type ActionResult,
  type GameState,
  type RuleSet,
} from '../src/index.js';
import { jumpInCards } from '../src/variants/classic/rules.js';
import { cardId, makeState, totalCards } from './helpers.js';

const { applyAction, getPlayerView } = classic;

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(`Expected success, got: ${result.error}`);
  return result.state;
}

function err(result: ActionResult): string {
  if (result.ok) throw new Error('Expected an error');
  return result.error;
}

function play(state: GameState, seat: number, indexes: number[], extra: Partial<Action & { type: 'play' }> = {}) {
  return applyAction(state, seat, { type: 'play', cardIds: indexes.map((i) => cardId(state, seat, i)), ...extra });
}

const hand = (state: GameState, seat: number) => state.players[seat]!.hand.map((c) => `${c.color[0]}${c.value}`);

describe('stacking +2 / +4', () => {
  const rules = { stackDraws: true };

  it('passes the penalty on instead of drawing at once', () => {
    const state = makeState({ hands: [['rdraw2', 'r1'], ['bdraw2', 'g1'], ['y1', 'y2']], top: 'r5', rules });
    const s1 = ok(play(state, 0, [0]));
    expect(s1.pendingDraw).toBe(2);
    expect(s1.currentPlayer).toBe(1);
    expect(s1.players[1]!.hand).toHaveLength(2);

    const s2 = ok(play(s1, 1, [0]));
    expect(s2.pendingDraw).toBe(4);
    expect(s2.currentPlayer).toBe(2);

    const s3 = ok(applyAction(s2, 2, { type: 'draw' }));
    expect(s3.players[2]!.hand).toHaveLength(6);
    expect(s3.pendingDraw).toBe(0);
    expect(s3.currentPlayer).toBe(0);
  });

  it('only allows draw cards while a penalty is waiting', () => {
    const state = makeState({ hands: [['rdraw2', 'r1'], ['r9', 'wild4'], ['y1']], top: 'r5', rules });
    const s1 = ok(play(state, 0, [0]));
    expect(err(play(s1, 1, [0]))).toMatch(/Stack a draw card or take 2/);
    expect(ok(play(s1, 1, [1], { color: 'blue' })).pendingDraw).toBe(6);
  });

  it('allows +2 on a +4 only with the extra option, and in the chosen color', () => {
    const base = makeState({ hands: [['wild4', 'r1'], ['bdraw2', 'gdraw2'], ['y1']], top: 'r5', rules });
    const s1 = ok(play(base, 0, [0], { color: 'blue' }));
    expect(err(play(s1, 1, [0]))).toMatch(/Stack a draw card/);

    const withOption = makeState({ hands: [['wild4', 'r1'], ['bdraw2', 'gdraw2'], ['y1']], top: 'r5', rules: { ...rules, stackPlus2OnPlus4: true } });
    const s2 = ok(play(withOption, 0, [0], { color: 'blue' }));
    expect(err(play(s2, 1, [1]))).toMatch(/Stack a draw card/);
    expect(ok(play(s2, 1, [0])).pendingDraw).toBe(6);
  });

  it('going out on a draw card still makes the next player draw', () => {
    const state = makeState({ hands: [['rdraw2'], ['y1']], top: 'r5', rules });
    const s1 = ok(play(state, 0, [0]));
    expect(s1.phase).toBe('gameOver');
    expect(s1.players[1]!.hand).toHaveLength(3);
  });
});

describe('stacking same numbers', () => {
  const rules = { stackSameNumber: true };

  it('plays several cards of one number; the last sets the color', () => {
    const state = makeState({ hands: [['r5', 'b5', 'g5', 'y9'], ['y1']], top: 'r2', rules });
    const s1 = ok(play(state, 0, [0, 1, 2]));
    expect(hand(s1, 0)).toEqual(['y9']);
    expect(s1.currentColor).toBe('green');
    expect(s1.discardPile.at(-1)!.color).toBe('green');
  });

  it('lets you call UNO before playing down from several cards to one', () => {
    const state = makeState({ hands: [['r5', 'b5', 'g9'], ['y1']], top: 'r2', rules });
    const called = ok(applyAction(state, 0, { type: 'callUno' }));
    expect(ok(play(called, 0, [0, 1])).unoVulnerable).toBeNull();
    // An early call doesn't carry over to later turns.
    const early = ok(play(called, 0, [0]));
    expect(early.players[0]!.calledUno).toBe(false);
  });

  it('needs the rule, matching numbers, and a playable first card', () => {
    const off = makeState({ hands: [['r5', 'b5'], ['y1']], top: 'r2' });
    expect(err(play(off, 0, [0, 1]))).toMatch(/one card at a time/);

    const state = makeState({ hands: [['r5', 'b6', 'b5', 'rskip'], ['y1']], top: 'r2', rules });
    expect(err(play(state, 0, [0, 1]))).toMatch(/same number/);
    expect(err(play(state, 0, [2, 0]))).toMatch(/cannot be played/);
    expect(err(play(state, 0, [3, 3]))).toMatch(/same card twice/);
  });
});

describe('7-0', () => {
  const rules = { sevenZero: true };

  it('a 7 swaps hands with the chosen player', () => {
    const state = makeState({ hands: [['r7', 'r1', 'r2'], ['y1'], ['g1', 'g2']], top: 'r5', rules });
    expect(err(play(state, 0, [0]))).toMatch(/swap hands/);
    expect(err(play(state, 0, [0], { swapWith: 0 }))).toMatch(/swap hands/);
    const s1 = ok(play(state, 0, [0], { swapWith: 1 }));
    expect(hand(s1, 0)).toEqual(['y1']);
    expect(hand(s1, 1)).toEqual(['r1', 'r2']);
    expect(s1.currentPlayer).toBe(1);
    expect(s1.unoVulnerable).toBeNull();
  });

  it('a 0 passes every hand along in the direction of play', () => {
    const state = makeState({ hands: [['r0', 'r1'], ['y1'], ['g1', 'g2']], top: 'r5', rules });
    const s1 = ok(play(state, 0, [0]));
    // Direction 1: seat 0's hand goes to seat 1, seat 1's to seat 2, seat 2's to seat 0.
    expect(hand(s1, 1)).toEqual(['r1']);
    expect(hand(s1, 2)).toEqual(['y1']);
    expect(hand(s1, 0)).toEqual(['g1', 'g2']);
  });

  it('a 7 as your last card just wins', () => {
    const state = makeState({ hands: [['r7'], ['y1']], top: 'r5', rules });
    expect(ok(play(state, 0, [0])).phase).toBe('gameOver');
  });

  it('without the rule, 7 and 0 are plain numbers', () => {
    const state = makeState({ hands: [['r7', 'r1'], ['y1']], top: 'r5' });
    expect(hand(ok(play(state, 0, [0])), 0)).toEqual(['r1']);
  });
});

describe('jump-in', () => {
  const rules = { jumpIn: true };

  it('lets anyone play an identical card out of turn; play continues from them', () => {
    const state = makeState({ hands: [['b1', 'b2'], ['y1', 'y2'], ['r5', 'g3']], top: 'r5', current: 0, rules });
    expect(jumpInCards(state, 2).map((c) => c.id)).toEqual([cardId(state, 2, 0)]);
    const s1 = ok(play(state, 2, [0]));
    expect(s1.currentPlayer).toBe(0); // the player after seat 2
    expect(hand(s1, 2)).toEqual(['g3']);
  });

  it('rejects jump-ins that are not identical, wilds, and jump-ins without the rule', () => {
    const state = makeState({ hands: [['b1'], ['y1'], ['g5', 'wild', 'r6']], top: 'r5', rules });
    expect(err(play(state, 2, [0]))).toMatch(/identical/);
    expect(err(play(state, 2, [1], { color: 'red' }))).toMatch(/identical/);
    expect(err(play(state, 2, [2]))).toMatch(/identical/);
    const off = makeState({ hands: [['b1'], ['y1'], ['r5', 'g3']], top: 'r5' });
    expect(err(play(off, 2, [0]))).toMatch(/not your turn/);
  });

  it('cuts off a player who had just drawn', () => {
    const state = makeState({ hands: [['b1', 'b2'], ['r5', 'g3']], top: 'r5', drawPile: ['r9'], rules });
    const drawn = ok(applyAction(state, 0, { type: 'draw' }));
    expect(drawn.phase).toBe('playDrawn');
    const s1 = ok(play(drawn, 1, [0]));
    expect(s1.phase).toBe('playing');
    expect(s1.drawnCardId).toBeNull();
    expect(s1.currentPlayer).toBe(0);
  });

  it('shows jump-in cards as playable in your view when it is not your turn', () => {
    const state = makeState({ hands: [['b1'], ['r5', 'g3']], top: 'r5', rules });
    expect([...playableIdsFromView(getPlayerView(state, 1))]).toEqual([cardId(state, 1, 0)]);
  });
});

describe('draw until playable', () => {
  it('keeps drawing until a playable card turns up', () => {
    const state = makeState({ hands: [['b1'], ['y1']], top: 'r5', drawPile: ['b2', 'g3', 'r9', 'r1'], rules: { drawUntilPlayable: true } });
    const s1 = ok(applyAction(state, 0, { type: 'draw' }));
    expect(hand(s1, 0)).toEqual(['b1', 'b2', 'g3', 'r9']);
    expect(s1.phase).toBe('playDrawn');
    expect(s1.drawnCardId).toBe(s1.players[0]!.hand[3]!.id);
  });

  it('draws one card without the rule', () => {
    const state = makeState({ hands: [['b1'], ['y1']], top: 'r5', drawPile: ['b2', 'g3', 'r9'] });
    expect(hand(ok(applyAction(state, 0, { type: 'draw' })), 0)).toEqual(['b1', 'b2']);
  });
});

describe('challenging a Wild +4', () => {
  const rules = { challengeWild4: true };

  it('catches a bluff: the +4 player takes the cards and the challenger plays on', () => {
    // Seat 0 holds a red card, so the +4 on red is illegal.
    const state = makeState({ hands: [['wild4', 'r1', 'b2'], ['y1', 'y2'], ['g1']], top: 'r5', rules });
    const s1 = ok(play(state, 0, [0], { color: 'blue' }));
    expect(s1.pendingDraw).toBe(4);
    expect(getPlayerView(s1, 1).canChallenge).toBe(true);
    const s2 = ok(applyAction(s1, 1, { type: 'challenge' }));
    expect(s2.players[0]!.hand).toHaveLength(6);
    expect(s2.players[1]!.hand).toHaveLength(2);
    expect(s2.currentPlayer).toBe(1);
    expect(s2.currentColor).toBe('blue');
  });

  it('a failed challenge costs the challenger 6 cards and their turn', () => {
    const state = makeState({ hands: [['wild4', 'b2'], ['y1', 'y2'], ['g1']], top: 'r5', rules });
    const s1 = ok(play(state, 0, [0], { color: 'blue' }));
    const s2 = ok(applyAction(s1, 1, { type: 'challenge' }));
    expect(s2.players[1]!.hand).toHaveLength(8);
    expect(s2.currentPlayer).toBe(2);
  });

  it('can be accepted by drawing 4', () => {
    const state = makeState({ hands: [['wild4', 'b2'], ['y1'], ['g1']], top: 'r5', rules });
    const s1 = ok(applyAction(ok(play(state, 0, [0], { color: 'blue' })), 1, { type: 'draw' }));
    expect(s1.players[1]!.hand).toHaveLength(5);
    expect(s1.currentPlayer).toBe(2);
  });

  it('is not available without the rule, or on a +2', () => {
    const state = makeState({ hands: [['wild4', 'b2'], ['y1'], ['g1']], top: 'r5' });
    const s1 = ok(play(state, 0, [0], { color: 'blue' }));
    expect(s1.pendingDraw).toBe(0);
    expect(err(applyAction(s1, 2, { type: 'challenge' }))).toMatch(/no Wild \+4/);

    const stack = makeState({ hands: [['rdraw2', 'b2'], ['y1'], ['g1']], top: 'r5', rules: { ...rules, stackDraws: true } });
    expect(err(applyAction(ok(play(stack, 0, [0])), 1, { type: 'challenge' }))).toMatch(/no Wild \+4/);
  });
});

describe('no finishing on action cards', () => {
  const rules = { noActionFinish: true };

  it('your last card must be a number', () => {
    const state = makeState({ hands: [['rskip'], ['y1']], top: 'r5', rules });
    expect(err(play(state, 0, [0]))).toMatch(/last card has to be a number/);
    expect(classic.playableCards(state, 0)).toHaveLength(0);
    expect(ok(play(makeState({ hands: [['r3'], ['y1']], top: 'r5', rules }), 0, [0])).phase).toBe('gameOver');
  });

  it('action cards are fine before the last one', () => {
    const state = makeState({ hands: [['rskip', 'r3'], ['y1']], top: 'r5', rules });
    expect(play(state, 0, [0]).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------

const ALL_RULES: Partial<RuleSet> = {
  stackDraws: true,
  stackPlus2OnPlus4: true,
  stackSameNumber: true,
  sevenZero: true,
  jumpIn: true,
  drawUntilPlayable: true,
  challengeWild4: true,
  noActionFinish: true,
};

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    const [r, next] = nextRandom(s);
    s = next;
    return r;
  };
}

/** Random rule mix per seed, so combinations get covered too. */
function rulesFor(seed: number): RuleSet {
  const random = seeded(seed * 7919);
  const rules = { ...DEFAULT_RULES };
  for (const [key, value] of Object.entries(ALL_RULES)) {
    (rules as Record<string, unknown>)[key] = seed % 5 === 0 ? value : random() < 0.5;
  }
  return rules;
}

describe('simulated games with house rules', () => {
  it('random legal play (with jump-ins and challenges) always finishes', { timeout: 120_000 }, () => {
    for (let seed = 0; seed < 300; seed++) {
      const n = 2 + (seed % 9);
      const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
      const rules = { ...rulesFor(seed), deckCount: n > 8 ? 2 : 1 } as RuleSet;
      let state = classic.createGame(players, rules, seed);
      const total = totalCards(state);
      const random = seeded(seed + 1);
      let steps = 0;
      while (state.phase !== 'gameOver') {
        if (++steps > 50_000) throw new Error(`seed ${seed}: game did not finish`);
        if (state.phase === 'roundOver') {
          state = ok(classic.startNextRound(state));
          continue;
        }
        // Sometimes someone jumps in.
        const jumper = state.players.findIndex((_, i) => jumpInCards(state, i).length > 0);
        let seat = state.currentPlayer;
        let action: Action;
        if (jumper !== -1 && random() < 0.3) {
          seat = jumper;
          action = { type: 'play', cardIds: [jumpInCards(state, seat)[0]!.id] };
        } else {
          const playable = classic.playableCards(state, seat);
          if (playable.length && random() < 0.9) {
            const card = playable[Math.floor(random() * playable.length)]!;
            action = { type: 'play', cardIds: [card.id], color: COLORS[Math.floor(random() * 4)] };
          } else if (getPlayerView(state, seat).canChallenge && random() < 0.5) {
            action = { type: 'challenge' };
          } else {
            action = state.phase === 'playDrawn' ? { type: 'pass' } : { type: 'draw' };
          }
        }
        if (action.type === 'play') {
          const card = state.players[seat]!.hand.find((c) => c.id === action.cardIds[0])!;
          if (card.value === 7) action.swapWith = (seat + 1 + Math.floor(random() * (n - 1))) % n;
          if (rules.stackSameNumber && typeof card.value === 'number') {
            const more = state.players[seat]!.hand.filter((c) => c.id !== card.id && c.value === card.value);
            action.cardIds.push(...more.slice(0, Math.floor(random() * (more.length + 1))).map((c) => c.id));
          }
        }
        const result = applyAction(state, seat, action);
        if (!result.ok) throw new Error(`seed ${seed} step ${steps}: ${result.error} (${JSON.stringify(action)})`);
        state = result.state;
        if (totalCards(state) !== total) throw new Error(`seed ${seed}: cards lost`);
      }
    }
  });

  it('bots handle every house rule and finish their games', { timeout: 120_000 }, () => {
    for (let seed = 0; seed < 150; seed++) {
      const n = 2 + (seed % 9);
      const players = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true }));
      const rules = { ...rulesFor(seed), deckCount: n > 8 ? 2 : 1 } as RuleSet;
      let state = classic.createGame(players, rules, seed);
      const random = seeded(seed + 3);
      for (let step = 0; state.phase !== 'gameOver'; step++) {
        if (step > 20_000) throw new Error(`seed ${seed}: bots did not finish`);
        let seat = state.currentPlayer;
        const difficulty = seat % 2 ? 'easy' : 'normal';
        let actions = classic.chooseBotMove(state, seat, difficulty, random);
        // Another bot may jump in first.
        for (let other = 0; other < n; other++) {
          const jump = classic.chooseBotJumpIn(state, other, 'normal', random);
          if (jump && random() < 0.3) {
            seat = other;
            actions = jump;
            break;
          }
        }
        for (const action of actions) {
          const result = applyAction(state, seat, action);
          if (!result.ok) throw new Error(`seed ${seed}: bot made an illegal move: ${result.error} (${JSON.stringify(action)})`);
          state = result.state;
        }
      }
    }
  });
});
