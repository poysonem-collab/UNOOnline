import { describe, expect, it } from 'vitest';
import { classic, DEFAULT_RULES, nextRandom, type BotDifficulty, type GameState } from '../src/index.js';
import { makeState } from './helpers.js';

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    const [r, next] = nextRandom(s);
    s = next;
    return r;
  };
}

const always = () => 0;

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
  it('bots of both levels always make legal moves and finish', () => {
    for (let seed = 0; seed < 200; seed++) {
      const n = 2 + (seed % 9);
      playBotGame(seed, Array.from({ length: n }, (_, i) => (i % 2 ? 'easy' : 'normal')));
    }
  });

  it('normal bots beat easy bots more often than not', () => {
    let normalWins = 0;
    const games = 400;
    for (let seed = 0; seed < games; seed++) {
      // Alternate seats so going first isn't an advantage.
      const normalSeat = seed % 2;
      const winner = playBotGame(seed, normalSeat === 0 ? ['normal', 'easy'] : ['easy', 'normal']);
      if (winner === normalSeat) normalWins++;
    }
    expect(normalWins / games).toBeGreaterThan(0.5);
  });
});
