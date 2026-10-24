import { describe, expect, it } from 'vitest';
import {
  BOT_LEVELS,
  buildNoMercyDecks,
  classic,
  getVariant,
  noMercy,
  noMercyPoints,
  nextRandom,
  sanitizeRules,
  type Action,
  type ActionResult,
  type BotDifficulty,
  type GameState,
  type RuleSet,
} from '../src/index.js';
import { c, cardId, makeState, totalCards } from './helpers.js';

const { applyAction, getPlayerView, createGame, chooseBotMove } = noMercy;

/** A No Mercy table with its built-in rules on. */
function nm(opts: Parameters<typeof makeState>[0]): GameState {
  return makeState({ ...opts, variantId: 'no-mercy', rules: { ...noMercy.defaultRules, ...opts.rules } });
}

function ok(result: ActionResult): Extract<ActionResult, { ok: true }> {
  if (!result.ok) throw new Error(result.error);
  return result;
}

function act(state: GameState, seat: number, action: Action): GameState {
  return ok(applyAction(state, seat, action)).state;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    const [r, next] = nextRandom(s);
    s = next;
    return r;
  };
}

describe('No Mercy deck', () => {
  it('has 168 cards with the No Mercy action cards', () => {
    const deck = buildNoMercyDecks(1);
    expect(deck).toHaveLength(168);
    expect(new Set(deck.map((card) => card.id)).size).toBe(168);
    const count = (value: string, color?: string) => deck.filter((card) => card.value === value && (!color || card.color === color)).length;
    expect(count('wild6')).toBe(4);
    expect(count('wild10')).toBe(4);
    expect(count('wildRev4')).toBe(8);
    expect(count('roulette')).toBe(8);
    expect(count('discardAll', 'red')).toBe(3);
    expect(count('skipAll', 'blue')).toBe(2);
    expect(count('draw4', 'green')).toBe(2);
    expect(deck.filter((card) => card.value === 0 && card.color === 'yellow')).toHaveLength(2);
    expect(buildNoMercyDecks(2)).toHaveLength(336);
  });

  it('scores numbers at face value, colored actions 20 and wilds 50', () => {
    expect(noMercyPoints(c('r7'))).toBe(7);
    expect(noMercyPoints({ color: 'red', value: 'discardAll' })).toBe(20);
    expect(noMercyPoints(c('wild10'))).toBe(50);
  });

  it('keeps stacking, 7-0 and draw-until-playable on whatever the host sends', () => {
    const rules = sanitizeRules(noMercy, { stackDraws: false, sevenZero: false, drawUntilPlayable: false, jumpIn: true });
    expect(rules).toMatchObject({ stackDraws: true, sevenZero: true, drawUntilPlayable: true, jumpIn: true });
    expect(getVariant('no-mercy')).toBe(noMercy);
  });

  it('deals a round that starts on a number card', () => {
    for (let seed = 0; seed < 30; seed++) {
      const state = createGame([{ id: 'a', name: 'A', isBot: false }, { id: 'b', name: 'B', isBot: false }], noMercy.defaultRules, seed);
      expect(typeof state.discardPile[0]!.value).toBe('number');
      expect(totalCards(state)).toBe(168);
      expect(getPlayerView(state, 0)).toMatchObject({ variantId: 'no-mercy', pointsToWin: 1000, mercyLimit: 25 });
    }
  });
});

describe('No Mercy cards', () => {
  it('stacks only an equal or higher draw card', () => {
    const state = nm({
      hands: [['wild6', 'r1'], ['rdraw2', 'wild10', 'rdraw4', 'r9'], ['b1', 'b2']],
      top: 'r5',
      drawPile: Array.from({ length: 20 }, () => 'g3'),
    });
    const after = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'red' });
    expect(after.pendingDraw).toBe(6);
    // A +2 or +4 can't go on a +6...
    expect(applyAction(after, 1, { type: 'play', cardIds: [cardId(after, 1, 0)] }).ok).toBe(false);
    expect(applyAction(after, 1, { type: 'play', cardIds: [cardId(after, 1, 2)] }).ok).toBe(false);
    // ...but a +10 can, passing 16 on.
    const stacked = act(after, 1, { type: 'play', cardIds: [cardId(after, 1, 1)], color: 'blue' });
    expect(stacked.pendingDraw).toBe(16);
    expect(stacked.currentPlayer).toBe(2);
    const took = act(stacked, 2, { type: 'draw' });
    expect(took.players[2]!.hand).toHaveLength(18);
    expect(took.currentPlayer).toBe(0);
  });

  it('Wild Reverse Draw 4 turns play around and hits the player on the other side', () => {
    const state = nm({ hands: [['wildRev4', 'r1'], ['b1', 'b2'], ['g1', 'g2']], top: 'r5' });
    const after = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'green' });
    expect(after.direction).toBe(-1);
    expect(after.pendingDraw).toBe(4);
    expect(after.currentPlayer).toBe(2);
  });

  it('Discard All throws away every card of its color', () => {
    const state = nm({ hands: [['rdiscardAll', 'r3', 'r9', 'rskip', 'b2', 'g4'], ['b1', 'b2']], top: 'r5' });
    const after = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] });
    expect(after.players[0]!.hand.map((card) => card.color)).toEqual(['blue', 'green']);
    expect(after.discardPile.at(-1)!.value).toBe('discardAll');
    expect(after.discardPile).toHaveLength(5);
    expect(after.currentPlayer).toBe(1);
    expect(totalCards(after)).toBe(totalCards(state));
  });

  it('Skip Everyone gives the same player another turn', () => {
    const state = nm({ hands: [['rskipAll', 'r1'], ['b1'], ['g1']], top: 'r5' });
    expect(act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] }).currentPlayer).toBe(0);
  });

  it('Color Roulette: the next player picks a color and draws until it turns up', () => {
    const state = nm({
      hands: [['roulette', 'r1'], ['b1', 'b2'], ['g1', 'g2']],
      top: 'r5',
      drawPile: ['r2', 'wild', 'y3', 'g7', 'b8'],
    });
    const played = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] });
    expect(played.phase).toBe('roulette');
    expect(played.currentPlayer).toBe(1);
    // Only the victim can answer, and only by picking a color.
    expect(applyAction(played, 0, { type: 'chooseColor', color: 'green' }).ok).toBe(false);
    expect(applyAction(played, 1, { type: 'draw' }).ok).toBe(false);
    const result = ok(applyAction(played, 1, { type: 'chooseColor', color: 'green' }));
    // Red, wild (doesn't count), yellow, then green.
    expect(result.state.players[1]!.hand).toHaveLength(6);
    expect(result.state.currentColor).toBe('green');
    expect(result.state.currentPlayer).toBe(2);
    expect(result.events).toContainEqual({ type: 'roulette', seat: 1, color: 'green', count: 4 });
  });

  it('plays a 7 to swap and a 0 to pass hands along, always', () => {
    const state = nm({ hands: [['r7', 'r1'], ['b1', 'b2', 'b3'], ['g1']], top: 'r5' });
    expect(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] }).ok).toBe(false);
    const swapped = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], swapWith: 1 });
    expect(swapped.players[0]!.hand).toHaveLength(3);
  });
});

describe('the Mercy rule', () => {
  const bigHand = (n: number, color = 'b') => Array.from({ length: n }, (_, i) => `${color}${(i % 9) + 1}`);
  const pile = Array.from({ length: 30 }, () => 'r1');

  it('knocks out a player who reaches 25 cards, and their cards go back in the deck', () => {
    const state = nm({ hands: [['wild10', 'r1'], bigHand(15), ['g1', 'g2']], top: 'r5', drawPile: pile, rules: { stackDraws: false } });
    // (stacking is built in, but taking the +10 straight away is the same thing)
    const result = ok(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'green' }));
    expect(result.state.out[1]).toBe(true);
    expect(result.state.players[1]!.hand).toHaveLength(0);
    expect(result.events).toContainEqual({ type: 'eliminated', seat: 1 });
    expect(result.state.currentPlayer).toBe(2);
    expect(totalCards(result.state)).toBe(totalCards(state));
  });

  it('also counts cards drawn from a stack, and skips knocked-out players afterwards', () => {
    const state = nm({ hands: [['wild10', 'r1', 'r2'], bigHand(15), ['g1', 'g2'], ['y1', 'y2']], top: 'r5', drawPile: pile });
    const played = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'red' });
    const took = act(played, 1, { type: 'draw' });
    expect(took.out[1]).toBe(true);
    expect(took.currentPlayer).toBe(2);
    expect(applyAction(took, 1, { type: 'draw' }).ok).toBe(false);
    // Going round, seat 1 is passed over.
    const after2 = act(took, 2, { type: 'draw' });
    const after3 = act(after2.phase === 'playDrawn' ? act(after2, 2, { type: 'pass' }) : after2, 3, { type: 'draw' });
    const next = after3.phase === 'playDrawn' ? act(after3, 3, { type: 'pass' }) : after3;
    expect(next.currentPlayer).toBe(0);
    expect(getPlayerView(next, 0).players[1]).toMatchObject({ out: true, handCount: 0 });
  });

  it('a knocked-out player sits out of 7-0 swaps and rotations', () => {
    const state = nm({ hands: [['r0', 'r1'], ['b1', 'b2'], [], ['y1', 'y2', 'y3']], top: 'r5' });
    state.out[2] = true;
    const rotated = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] });
    expect(rotated.players.map((p) => p.hand.length)).toEqual([3, 1, 0, 2]);
    const seven = nm({ hands: [['r7', 'r1'], ['b1'], [], ['y1']], top: 'r5' });
    seven.out[2] = true;
    expect(applyAction(seven, 0, { type: 'play', cardIds: [cardId(seven, 0, 0)], swapWith: 2 }).ok).toBe(false);
  });

  it('the last player standing wins the round', () => {
    const state = nm({ hands: [['wild10', 'r1', 'r2'], bigHand(20)], top: 'r5', drawPile: pile, rules: { winCondition: 'points500' } });
    const played = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'red' });
    const result = ok(applyAction(played, 1, { type: 'draw' }));
    expect(result.state.out[1]).toBe(true);
    expect(result.state.phase).toBe('roundOver');
    expect(result.state.roundWinner).toBe(0);
    // Their cards went back into the deck, but still count for the winner (20 blues worth 93, plus ten 1s).
    expect(result.state.scores[0]).toBe(103);
    // Next round, everyone's back in.
    const next = ok(noMercy.startNextRound(result.state)).state;
    expect(next.out).toEqual([false, false]);
  });

  it('plays to 1000 points', () => {
    const state = nm({ hands: [['r1'], ['wild10', 'wild6', 'b5']], top: 'r5', rules: { winCondition: 'points500' } });
    const result = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] });
    expect(result.scores[0]).toBe(105);
    expect(result.phase).toBe('roundOver');
    const nearly = nm({ hands: [['r1'], ['wild10', 'wild6', 'b5']], top: 'r5', rules: { winCondition: 'points500' } });
    nearly.scores[0] = 600;
    expect(act(nearly, 0, { type: 'play', cardIds: [cardId(nearly, 0, 0)] }).phase).toBe('roundOver');
    nearly.scores[0] = 900;
    expect(act(nearly, 0, { type: 'play', cardIds: [cardId(nearly, 0, 0)] }).phase).toBe('gameOver');
  });

  it('lets you call UNO before a Discard All takes you to one card', () => {
    const state = nm({ hands: [['rdiscardAll', 'r3', 'r9', 'b2'], ['b1', 'b2']], top: 'r5' });
    const called = act(state, 0, { type: 'callUno' });
    const after = act(called, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] });
    expect(after.players[0]!.hand).toHaveLength(1);
    expect(after.unoVulnerable).toBeNull();
  });
});

describe('No Mercy bots', () => {
  it('pick a Color Roulette color with plenty of cards left to find', () => {
    const state = nm({ hands: [['r1'], ['b1', 'b2', 'b3', 'b4', 'g1'], ['y1']], top: 'roulette', color: 'red' });
    state.phase = 'roulette';
    state.currentPlayer = 1;
    for (const level of BOT_LEVELS) {
      const [move] = chooseBotMove(state, 1, level, () => 0.5);
      expect(move).toMatchObject({ type: 'chooseColor' });
      expect(applyAction(state, 1, move!).ok).toBe(true);
    }
    // Hard bots pick a color with lots of cards still unseen, not the one they hold most of.
    expect(chooseBotMove(state, 1, 'hard', () => 0.5)[0]).not.toMatchObject({ color: 'blue' });
  });

  it('use a Discard All to dump a whole color', () => {
    const state = nm({ hands: [['rdiscardAll', 'r3', 'r8', 'r9', 'r2', 'b4'], ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']], top: 'r5' });
    for (const level of ['normal', 'hard', 'expert'] as BotDifficulty[]) {
      const moves = chooseBotMove(state, 0, level, () => 0.5);
      expect(moves.at(-1)).toMatchObject({ type: 'play', cardIds: [cardId(state, 0, 0)] });
    }
  });

  it('stack back rather than take cards that would knock them out', () => {
    const stacked = nm({ hands: [['r1'], [...Array.from({ length: 18 }, (_, i) => `b${(i % 9) + 1}`), 'wild10'], ['g1', 'g2']], top: 'wild6', current: 1, color: 'red' });
    stacked.pendingDraw = 6;
    for (const level of BOT_LEVELS) {
      // Even an easy bot's "forgot to stack" slip (a low roll) doesn't apply when it would be knocked out.
      const [move] = chooseBotMove(stacked, 1, level, () => 0.01);
      expect(move).toMatchObject({ type: 'play' });
    }
  });

  it('finish games of every size, with every level, and knock players out along the way', { timeout: 180_000 }, () => {
    let knockouts = 0;
    for (let seed = 0; seed < 48; seed++) {
      const n = 2 + (seed % 9);
      const levels = Array.from({ length: n }, (_, i) => BOT_LEVELS[(i + seed) % 4]!);
      const players = levels.map((_, i) => ({ id: `b${i}`, name: `Bot ${i}`, isBot: true }));
      const expansion = seed % 4 < 2;
      const rules: RuleSet = { ...noMercy.defaultRules, jumpIn: seed % 3 === 0, stackSameNumber: seed % 2 === 0, noMercyExpansion: expansion };
      let state = createGame(players, rules, seed);
      const random = seeded(seed + 7);
      let done = false;
      for (let step = 0; step < 20_000 && !done; step++) {
        const seat = state.currentPlayer;
        expect(state.out[seat]).toBe(false);
        for (const action of chooseBotMove(state, seat, levels[seat]!, random)) {
          const result = applyAction(state, seat, action);
          if (!result.ok) throw new Error(`seed ${seed}: ${result.error} (${JSON.stringify(action)})`);
          state = result.state;
          knockouts += result.events.filter((e) => e.type === 'eliminated').length;
        }
        expect(totalCards(state)).toBe(expansion ? 188 : 168);
        done = state.phase === 'gameOver' || state.phase === 'roundOver';
      }
      expect(done).toBe(true);
    }
    expect(knockouts).toBeGreaterThan(0);
  });
});

describe('No Mercy Expansion Pack (optional)', () => {
  it('adds two 10s per color, 8 Wild Discard All and 4 Wild Reverse Draw 8', () => {
    const deck = buildNoMercyDecks(1, true);
    expect(deck).toHaveLength(188);
    expect(deck.filter((card) => card.value === 10)).toHaveLength(8);
    expect(deck.filter((card) => card.value === 10 && card.color === 'green')).toHaveLength(2);
    expect(deck.filter((card) => card.value === 'wildDiscardAll')).toHaveLength(8);
    expect(deck.filter((card) => card.value === 'wildRev8')).toHaveLength(4);
    const players = [{ id: 'a', name: 'A', isBot: false }, { id: 'b', name: 'B', isBot: false }];
    expect(totalCards(createGame(players, { ...noMercy.defaultRules, noMercyExpansion: true }, 1))).toBe(188);
    expect(totalCards(createGame(players, noMercy.defaultRules, 1))).toBe(168);
  });

  it('is only offered in No Mercy', () => {
    expect(sanitizeRules(noMercy, { noMercyExpansion: true }).noMercyExpansion).toBe(true);
    expect(sanitizeRules(classic, { noMercyExpansion: true }).noMercyExpansion).toBe(false);
  });

  it('a 10 is a number card that lets you play again', () => {
    const state = nm({ hands: [['r10', 'b10', 'g3'], ['y1'], ['y2']], top: 'r5', rules: { noMercyExpansion: true, noActionFinish: true } });
    const result = ok(applyAction(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)] }));
    expect(result.state.currentPlayer).toBe(0);
    expect(result.events).toContainEqual({ type: 'playAgain', seat: 0 });
    // 10 on 10, and it's fine as a last card even with "no finishing on action cards".
    const last = nm({ hands: [['b10'], ['y1']], top: 'r10', rules: { noMercyExpansion: true, noActionFinish: true } });
    expect(act(last, 0, { type: 'play', cardIds: [cardId(last, 0, 0)] }).phase).toBe('gameOver');
  });

  it('Wild Discard All throws away the color you name, then sets the color in play', () => {
    const state = nm({ hands: [['wildDiscardAll', 'b1', 'b7', 'bskip', 'g4', 'y2'], ['r1', 'r2']], top: 'r5', rules: { noMercyExpansion: true } });
    const id = cardId(state, 0, 0);
    expect(applyAction(state, 0, { type: 'play', cardIds: [id], color: 'green' }).ok).toBe(false);
    const after = act(state, 0, { type: 'play', cardIds: [id], color: 'green', discardColor: 'blue' });
    expect(after.players[0]!.hand.map((card) => card.color)).toEqual(['green', 'yellow']);
    expect(after.currentColor).toBe('green');
    expect(after.discardPile.at(-1)!.value).toBe('wildDiscardAll');
    expect(after.currentPlayer).toBe(1);
  });

  it('Wild Reverse Draw 8 reverses and stacks like the other draw cards', () => {
    const state = nm({ hands: [['wildRev8', 'r1'], ['b1', 'b2', 'wild6', 'wild10'], ['g1', 'g2']], top: 'r5', current: 2, rules: { noMercyExpansion: true } });
    state.currentPlayer = 0;
    const after = act(state, 0, { type: 'play', cardIds: [cardId(state, 0, 0)], color: 'blue' });
    expect(after.direction).toBe(-1);
    expect(after.pendingDraw).toBe(8);
    expect(after.currentPlayer).toBe(2);
    // Seat 2 can't stack, takes 8; then it's seat 1, who could stack a +10 on a +8 but not a +6.
    const stack = nm({ hands: [['r1'], ['b1', 'wild6', 'wild10']], top: 'wildRev8', color: 'red', current: 1 });
    stack.pendingDraw = 8;
    expect(applyAction(stack, 1, { type: 'play', cardIds: [cardId(stack, 1, 1)], color: 'red' }).ok).toBe(false);
    expect(act(stack, 1, { type: 'play', cardIds: [cardId(stack, 1, 2)], color: 'red' }).pendingDraw).toBe(18);
  });

  it('bots use a Wild Discard All on the color they hold most of', () => {
    const state = nm({ hands: [['wildDiscardAll', 'b1', 'b7', 'b3', 'g4', 'y2'], ['r1', 'r2', 'r3', 'r4', 'r6']], top: 'r5', rules: { noMercyExpansion: true } });
    for (const level of ['normal', 'hard', 'expert'] as BotDifficulty[]) {
      const move = chooseBotMove(state, 0, level, () => 0.5).at(-1)!;
      expect(move).toMatchObject({ type: 'play', cardIds: [cardId(state, 0, 0)], discardColor: 'blue' });
      expect(applyAction(state, 0, move).ok).toBe(true);
    }
  });
});
