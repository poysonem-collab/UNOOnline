import { describe, expect, it } from 'vitest';
import { classic, COLORS, DEFAULT_RULES, nextRandom, type Action, type GameState } from '../src/index.js';
import { totalCards } from './helpers.js';

/** Picks a random legal move for the current player. */
function randomMove(state: GameState, rng: number): [Action, number] {
  const seat = state.currentPlayer;
  const playable = classic.playableCards(state, seat);
  let r: number;
  [r, rng] = nextRandom(rng);
  if (playable.length > 0) {
    const card = playable[Math.floor(r * playable.length)]!;
    const color = COLORS[Math.floor(r * 4)]!;
    return [{ type: 'play', cardIds: [card.id], color }, rng];
  }
  return [state.phase === 'playDrawn' ? { type: 'pass' } : { type: 'draw' }, rng];
}

function simulate(seed: number, playerCount: number, winCondition: 'firstOut' | 'points500') {
  const players = Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
  const rules = { ...DEFAULT_RULES, winCondition, deckCount: playerCount > 8 ? 2 : 1 } as const;
  let state = classic.createGame(players, rules, seed);
  const deckTotal = totalCards(state);
  let rng = seed ^ 0x9e3779b9;

  for (let step = 0; step < 50_000; step++) {
    if (state.phase === 'gameOver') return state;
    if (state.phase === 'roundOver') {
      const next = classic.startNextRound(state);
      if (!next.ok) throw new Error(next.error);
      state = next.state;
      continue;
    }

    const seat = state.currentPlayer;
    let r: number;
    [r, rng] = nextRandom(rng);
    // Sometimes call UNO, sometimes another player tries to catch.
    if (state.players[seat]!.hand.length <= 2 && r < 0.5) {
      const res = classic.applyAction(state, seat, { type: 'callUno' });
      if (!res.ok) throw new Error(res.error);
      state = res.state;
    }
    if (state.unoVulnerable !== null && r > 0.7) {
      const catcher = (state.unoVulnerable + 1) % playerCount;
      const res = classic.applyAction(state, catcher, { type: 'catchUno', target: state.unoVulnerable });
      if (!res.ok) throw new Error(res.error);
      state = res.state;
    }

    let action: Action;
    [action, rng] = randomMove(state, rng);
    const res = classic.applyAction(state, seat, action);
    if (!res.ok) throw new Error(`seed ${seed} step ${step}: ${res.error}`);
    state = res.state;
    if (totalCards(state) !== deckTotal) throw new Error(`seed ${seed} step ${step}: cards lost`);
  }
  throw new Error(`seed ${seed}: game did not finish`);
}

describe('simulated games', () => {
  // Full games with up to 10 players take a while; allow time on slow machines.
  it('1,000 random games finish without errors', { timeout: 120_000 }, () => {
    for (let seed = 0; seed < 1000; seed++) {
      const playerCount = 2 + (seed % 9);
      const end = simulate(seed, playerCount, seed % 10 === 0 ? 'points500' : 'firstOut');
      expect(end.gameWinner).not.toBeNull();
      expect(end.players[end.gameWinner!]!.hand).toHaveLength(0);
    }
  });
});
