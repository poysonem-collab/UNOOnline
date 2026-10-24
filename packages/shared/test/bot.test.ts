import { describe, expect, it } from 'vitest';
import { BOT_LEVELS, classic, DEFAULT_RULES, nextRandom, type BotDifficulty, type GameState } from '../src/index.js';
import { makeState } from './helpers.js';

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    const [r, next] = nextRandom(s);
    s = next;
    return r;
  };
}

// A middling roll: no slips (which happen on low rolls), and normal bots remember UNO.
const always = () => 0.5;

describe('normal bot', () => {
  it('draws when it has nothing to play, and keeps an unplayable state moving', () => {
    const state = makeState({ hands: [['b1'], ['y1']], top: 'g5' });
    expect(classic.chooseBotMove(state, 0, 'normal', always)).toEqual([{ type: 'draw' }]);
  });

  it('plays the drawn card when it can', () => {
    const state = makeState({ hands: [['b1'], ['y1']], top: 'g5', drawPile: ['g9'] });
    const drawn = classic.applyAction(state, 0, { type: 'draw' });
    if (!drawn.ok) throw new Error(drawn.error);
    const moves = classic.chooseBotMove(drawn.state, 0, 'normal', always);
    expect(moves.at(-1)).toEqual({ type: 'play', cardIds: [drawn.state.drawnCardId] });
  });

  it('saves wilds when a normal card works', () => {
    const state = makeState({ hands: [['wild', 'r3', 'b1'], ['y1', 'y2', 'y3']], top: 'r5' });
    const [move] = classic.chooseBotMove(state, 0, 'normal', always);
    expect(move).toMatchObject({ type: 'play', cardIds: [state.players[0]!.hand[1]!.id] });
  });

  it('picks the color it holds most of for a wild', () => {
    const state = makeState({ hands: [['wild', 'b1', 'b2', 'g3'], ['y1', 'y2', 'y3']], top: 'r5' });
    const [move] = classic.chooseBotMove(state, 0, 'normal', always);
    expect(move).toMatchObject({ type: 'play', color: 'blue' });
  });

  it('attacks a player who is about to win', () => {
    const state = makeState({ hands: [['r9', 'rskip', 'b1'], ['y1']], top: 'r5' });
    const [move] = classic.chooseBotMove(state, 0, 'normal', always);
    expect(move).toMatchObject({ cardIds: [state.players[0]!.hand[1]!.id] });
  });

  it('calls UNO before playing its second-to-last card', () => {
    const state = makeState({ hands: [['r9', 'b1'], ['y1', 'y2']], top: 'r5' });
    const moves = classic.chooseBotMove(state, 0, 'normal', always);
    expect(moves[0]).toEqual({ type: 'callUno' });
    expect(moves[1]).toMatchObject({ type: 'play' });
  });
});

describe('easy bot', () => {
  it('plays whatever matches, wilds included', () => {
    // A roll of 0.99 picks the last playable card: the wild, which a careful player would save.
    const state = makeState({ hands: [['r3', 'wild'], ['y1', 'y2', 'y3']], top: 'r5' });
    const [move] = classic.chooseBotMove(state, 0, 'easy', () => 0.99);
    expect(move).toMatchObject({ type: 'play', cardIds: [state.players[0]!.hand[1]!.id] });
  });

  it('sometimes misses a playable card and draws', () => {
    const state = makeState({ hands: [['r3', 'b1'], ['y1', 'y2', 'y3']], top: 'r5' });
    expect(classic.chooseBotMove(state, 0, 'easy', () => 0.01)).toEqual([{ type: 'draw' }]);
  });
});

describe('hard bot', () => {
  it('keeps a wild to finish on', () => {
    const state = makeState({ hands: [['wild', 'r3'], ['y1', 'y2', 'y3', 'y4']], top: 'r5' });
    const moves = classic.chooseBotMove(state, 0, 'hard', always);
    expect(moves.at(-1)).toMatchObject({ type: 'play', cardIds: [state.players[0]!.hand[1]!.id] });
  });

  it('saves a Skip when nobody is close to winning, and uses it when someone is', () => {
    const calm = makeState({ hands: [['rskip', 'r3', 'g1'], ['y1', 'y2', 'y3', 'y4', 'y5'], ['b1', 'b2', 'b3', 'b4', 'b5']], top: 'r5' });
    expect(classic.chooseBotMove(calm, 0, 'hard', always)[0]).toMatchObject({ cardIds: [calm.players[0]!.hand[1]!.id] });
    const tense = makeState({ hands: [['rskip', 'r3', 'g1'], ['y1'], ['b1', 'b2', 'b3', 'b4', 'b5']], top: 'r5' });
    expect(classic.chooseBotMove(tense, 0, 'hard', always)[0]).toMatchObject({ cardIds: [tense.players[0]!.hand[0]!.id] });
  });

  it('switches to a color the next player was seen drawing on', () => {
    const state = makeState({ hands: [['r5', 'b5', 'g2', 'y2'], ['y1', 'y2', 'y3', 'y4'], ['g1', 'g2', 'g3', 'g4']], top: 'g5' });
    state.voids[1] = ['blue'];
    expect(classic.chooseBotMove(state, 0, 'hard', always)[0]).toMatchObject({ cardIds: [state.players[0]!.hand[1]!.id] });
  });

  it('challenges a +4 from a big hand, but not from someone who drew on that color', () => {
    const rules = { challengeWild4: true };
    const base = makeState({ hands: [['wild4', 'r1', 'r2', 'b3', 'g4', 'y5', 'y6'], ['y1', 'y2']], top: 'r5', rules });
    const played = classic.applyAction(base, 0, { type: 'play', cardIds: [base.players[0]!.hand[0]!.id], color: 'blue' });
    if (!played.ok) throw new Error(played.error);
    expect(classic.chooseBotMove(played.state, 1, 'hard', always)).toEqual([{ type: 'challenge' }]);
    const drewOnRed = structuredClone(played.state);
    drewOnRed.voids[0] = ['red'];
    expect(classic.chooseBotMove(drewOnRed, 1, 'hard', always)).toEqual([{ type: 'draw' }]);
  });
});

describe('expert bot', () => {
  it('finds the winning line: Skip, then its last card', () => {
    const state = makeState({ hands: [['r4', 'rskip'], ['y1']], top: 'r5', drawPile: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8'] });
    const moves = classic.chooseBotMove(state, 0, 'expert', seeded(1));
    expect(moves.at(-1)).toMatchObject({ type: 'play', cardIds: [state.players[0]!.hand[1]!.id] });
  });

  it("avoids handing the next player the color they named with a wild", () => {
    const state = makeState({ hands: [['r5', 'b5', 'g1', 'y1'], ['y2', 'y3', 'y4', 'y6'], ['g2', 'g3', 'g4', 'g6']], top: 'g5', rules: { stackDraws: true } });
    state.named[1] = 'blue';
    const [move] = classic.chooseBotMove(state, 0, 'expert', always);
    expect(move).toMatchObject({ type: 'play' });
    expect(move).not.toMatchObject({ cardIds: [state.players[0]!.hand[1]!.id] }); // the blue 5
    // Without that memory, blue is a fine choice.
    state.named[1] = null;
    expect(classic.chooseBotMove(state, 0, 'hard', always)[0]).toMatchObject({ type: 'play' });
  });

  it('never uses hidden cards: decisions only depend on what it could know', () => {
    const state = makeState({ hands: [['r3', 'b5', 'rskip', 'wild'], ['y1', 'y2', 'g7'], ['b1', 'b2', 'r9']], top: 'r5' });
    const shuffled = structuredClone(state);
    // Swap opponents' cards with each other and with the draw pile (same hand sizes, same public info).
    const pool = [...shuffled.players[1]!.hand, ...shuffled.players[2]!.hand, ...shuffled.drawPile];
    pool.reverse();
    shuffled.players[1]!.hand = pool.slice(0, 3);
    shuffled.players[2]!.hand = pool.slice(3, 6);
    shuffled.drawPile = pool.slice(6);
    for (const level of BOT_LEVELS) {
      expect(classic.chooseBotMove(shuffled, 0, level, seeded(9))).toEqual(classic.chooseBotMove(state, 0, level, seeded(9)));
    }
  });
});

/** Plays a whole game with bots; returns the winner. */
function playBotGame(seed: number, difficulties: BotDifficulty[]): number {
  const players = difficulties.map((_, i) => ({ id: `b${i}`, name: `Bot ${i}`, isBot: true }));
  let state: GameState = classic.createGame(players, DEFAULT_RULES, seed);
  const random = seeded(seed + 1);
  for (let step = 0; step < 20_000; step++) {
    if (state.phase === 'gameOver') return state.gameWinner!;
    const seat = state.currentPlayer;
    for (const action of classic.chooseBotMove(state, seat, difficulties[seat]!, random)) {
      const res = classic.applyAction(state, seat, action);
      if (!res.ok) throw new Error(`seed ${seed}: ${res.error}`);
      state = res.state;
    }
  }
  throw new Error(`seed ${seed}: game did not finish`);
}

describe('bot games', () => {
  it('bots of every level always make legal moves and finish', { timeout: 60_000 }, () => {
    for (let seed = 0; seed < 120; seed++) {
      const n = 2 + (seed % 9);
      playBotGame(seed, Array.from({ length: n }, (_, i) => BOT_LEVELS[i % 4]!));
    }
  });

  it('each level beats the one below it, with all four at one table', { timeout: 120_000 }, () => {
    const wins: Record<BotDifficulty, number> = { easy: 0, normal: 0, hard: 0, expert: 0 };
    const games = 600;
    for (let seed = 0; seed < games; seed++) {
      // Rotate seats so going first isn't an advantage.
      const order = [...BOT_LEVELS.slice(seed % 4), ...BOT_LEVELS.slice(0, seed % 4)];
      wins[order[playBotGame(seed, order)]!]++;
    }
    expect(wins.easy).toBeLessThan(wins.normal);
    expect(wins.normal).toBeLessThan(wins.hard);
    expect(wins.hard).toBeLessThan(wins.expert);
  });
});
