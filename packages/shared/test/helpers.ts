import { DEFAULT_RULES, type Card, type Color, type GameState, type RuleSet } from '../src/index.js';

let nextId = 0;

/** Build a card from short notation: 'r5', 'gskip', 'breverse', 'ydraw2', 'wild', 'wild4'. */
export function c(spec: string): Card {
  const id = `t${nextId++}`;
  if (spec === 'wild' || spec === 'wild4') return { id, color: 'wild', value: spec };
  const color = ({ r: 'red', y: 'yellow', g: 'green', b: 'blue' } as const)[spec[0] as 'r'];
  const rest = spec.slice(1);
  const value = /^\d$/.test(rest) ? (Number(rest) as 0) : (rest as 'skip' | 'reverse' | 'draw2');
  return { id, color, value };
}

/** A hand-built state for testing specific situations. */
export function makeState(opts: {
  hands: string[][];
  top: string;
  drawPile?: string[];
  color?: Color;
  current?: number;
  rules?: Partial<RuleSet>;
}): GameState {
  const top = c(opts.top);
  return {
    variantId: 'classic',
    rules: { ...DEFAULT_RULES, ...opts.rules },
    players: opts.hands.map((h, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      isBot: false,
      hand: h.map(c),
      calledUno: false,
    })),
    // Last element is drawn first, so reverse to make drawPile[0] the next draw.
    drawPile: (opts.drawPile ?? ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']).map(c).reverse(),
    discardPile: [top],
    currentColor: opts.color ?? (top.color === 'wild' ? 'red' : top.color),
    currentPlayer: opts.current ?? 0,
    direction: 1,
    phase: 'playing',
    drawnCardId: null,
    unoVulnerable: null,
    pendingDraw: 0,
    wild4Check: null,
    dealer: opts.hands.length - 1,
    roundWinner: null,
    gameWinner: null,
    scores: opts.hands.map(() => 0),
    round: 1,
    rng: 42,
  };
}

export function cardId(state: GameState, seat: number, index: number): string {
  return state.players[seat]!.hand[index]!.id;
}

export function totalCards(state: GameState): number {
  return (
    state.drawPile.length +
    state.discardPile.length +
    state.players.reduce((n, p) => n + p.hand.length, 0)
  );
}
