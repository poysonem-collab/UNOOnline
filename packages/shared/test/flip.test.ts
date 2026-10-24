import { describe, expect, it } from 'vitest';
import {
  buildFlipDecks,
  COLORS,
  colorsForSide,
  DARK_COLORS,
  DEFAULT_RULES,
  flip,
  flipPoints,
  nextRandom,
  type Action,
  type ActionResult,
  type Card,
  type CardFace,
  type GameState,
  type RuleSet,
} from '../src/index.js';
import { jumpInCards } from '../src/variants/classic/rules.js';
import { totalCards } from './helpers.js';

const { applyAction, getPlayerView, createGame } = flip;

const LIGHT = { r: 'red', y: 'yellow', g: 'green', b: 'blue' } as const;
const DARK = { P: 'pink', T: 'teal', O: 'orange', U: 'purple' } as const;

/** 'r5', 'bflip', 'wild2' (light) or 'P5', 'TskipAll', 'wildColor!' (dark; '!' marks a dark wild). */
function face(spec: string): CardFace {
  const darkWild = spec.endsWith('!');
  const s = darkWild ? spec.slice(0, -1) : spec;
  if (s.startsWith('wild')) return { color: 'wild', value: s as 'wild', ...(darkWild || s === 'wildColor' ? { dark: true } : {}) };
  const dark = s[0]! in DARK;
  const color = dark ? DARK[s[0] as 'P'] : LIGHT[s[0] as 'r'];
  const rest = s.slice(1);
  const value = /^\d$/.test(rest) ? (Number(rest) as 1) : (rest as 'skip');
  return { color, value, ...(dark ? { dark: true } : {}) } as CardFace;
}

let nextId = 0;
/** A two-sided card: [face in play, face on the back]. */
const card = ([front, back]: [string, string]): Card => ({ ...face(front), id: `c${nextId++}`, other: face(back) }) as Card;

function makeFlipState(opts: {
  hands: [string, string][][];
  top: [string, string];
  drawPile?: [string, string][];
  current?: number;
  side?: 'light' | 'dark';
  rules?: Partial<RuleSet>;
}): GameState {
  const top = card(opts.top);
  return {
    variantId: 'flip',
    rules: { ...DEFAULT_RULES, ...opts.rules },
    players: opts.hands.map((h, i) => ({ id: `p${i}`, name: `P${i}`, isBot: false, hand: h.map(card), calledUno: false })),
    // drawPile[0] in opts is drawn first.
    drawPile: (opts.drawPile ?? [['r1', 'P1'], ['r2', 'P2'], ['r3', 'P3'], ['r4', 'P4'], ['r6', 'P6'], ['r8', 'P8']]).map(card).reverse(),
    discardPile: [top],
    currentColor: top.color === 'wild' ? 'red' : top.color,
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
    history: [],
    side: opts.side ?? 'light',
    voids: opts.hands.map(() => []),
    named: opts.hands.map(() => null),
    out: opts.hands.map(() => false),
    rng: 9,
  };
}

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(`Expected success, got: ${result.error}`);
  return result.state;
}

function err(result: ActionResult): string {
  if (result.ok) throw new Error('Expected an error');
  return result.error;
}

const play = (state: GameState, seat: number, index: number, extra: Partial<Action & { type: 'play' }> = {}) =>
  applyAction(state, seat, { type: 'play', cardIds: [state.players[seat]!.hand[index]!.id], ...extra });

const faces = (state: GameState, seat: number) => state.players[seat]!.hand.map((c) => `${c.color}:${c.value}`);

describe('UNO Flip deck', () => {
  const [deck] = buildFlipDecks(1, 1);

  it('has 112 two-sided cards with unique ids', () => {
    expect(deck).toHaveLength(112);
    expect(new Set(deck.map((c) => c.id)).size).toBe(112);
    expect(deck.every((c) => c.other?.dark === true && !c.dark)).toBe(true);
  });

  it('has the right light side', () => {
    for (const color of COLORS) {
      const cards = deck.filter((c) => c.color === color);
      expect(cards).toHaveLength(26);
      expect(cards.some((c) => c.value === 0)).toBe(false);
      for (let v = 1; v <= 9; v++) expect(cards.filter((c) => c.value === v)).toHaveLength(2);
      for (const v of ['draw1', 'reverse', 'skip', 'flip']) expect(cards.filter((c) => c.value === v)).toHaveLength(2);
    }
    expect(deck.filter((c) => c.value === 'wild')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'wild2')).toHaveLength(4);
  });

  it('has the right dark side', () => {
    const backs = deck.map((c) => c.other!);
    for (const color of DARK_COLORS) {
      const cards = backs.filter((c) => c.color === color);
      expect(cards).toHaveLength(26);
      for (let v = 1; v <= 9; v++) expect(cards.filter((c) => c.value === v)).toHaveLength(2);
      for (const v of ['draw5', 'reverse', 'skipAll', 'flip']) expect(cards.filter((c) => c.value === v)).toHaveLength(2);
    }
    expect(backs.filter((c) => c.value === 'wild')).toHaveLength(4);
    expect(backs.filter((c) => c.value === 'wildColor')).toHaveLength(4);
  });

  it('pairs the sides the same way for the same seed', () => {
    expect(buildFlipDecks(1, 5)[0]).toEqual(buildFlipDecks(1, 5)[0]);
    expect(buildFlipDecks(1, 5)[0]).not.toEqual(buildFlipDecks(1, 6)[0]);
  });

  it('scores each face by the official values', () => {
    expect(flipPoints(face('r7'))).toBe(7);
    expect(flipPoints(face('rdraw1'))).toBe(10);
    expect(flipPoints(face('Pdraw5'))).toBe(20);
    expect(flipPoints(face('PskipAll'))).toBe(30);
    expect(flipPoints(face('wild'))).toBe(40);
    expect(flipPoints(face('wild2'))).toBe(50);
    expect(flipPoints(face('wildColor'))).toBe(60);
  });
});

describe('starting a Flip game', () => {
  it('deals light side up, never starting on a wild or Flip', () => {
    for (let seed = 0; seed < 60; seed++) {
      const state = createGame([{ id: 'a', name: 'A', isBot: false }, { id: 'b', name: 'B', isBot: false }, { id: 'c', name: 'C', isBot: false }], DEFAULT_RULES, seed);
      expect(state.side).toBe('light');
      expect(totalCards(state)).toBe(112);
      const top = state.discardPile[0]!;
      expect(top.color).not.toBe('wild');
      expect(top.value).not.toBe('flip');
    }
  });

  it("shows you the backs of everyone else's cards, but not your own", () => {
    const state = createGame([{ id: 'a', name: 'A', isBot: false }, { id: 'b', name: 'B', isBot: false }], DEFAULT_RULES, 3);
    const view = getPlayerView(state, 0);
    expect(view.side).toBe('light');
    expect(view.hand.every((c) => c.other === undefined)).toBe(true);
    expect(view.players[0]!.otherSides).toBeUndefined();
    expect(view.players[1]!.otherSides).toEqual(state.players[1]!.hand.map((c) => c.other));
    expect(view.drawPileOther).toEqual(state.drawPile.at(-1)!.other);
  });
});

describe('the Flip card', () => {
  it('turns every card over and switches to the dark side', () => {
    const state = makeFlipState({
      hands: [[['rflip', 'P4'], ['g1', 'TskipAll']], [['y2', 'O9']]],
      top: ['r5', 'U2'],
      drawPile: [['b3', 'P7']],
    });
    const s1 = ok(play(state, 0, 0));
    expect(s1.side).toBe('dark');
    expect(faces(s1, 0)).toEqual(['teal:skipAll']);
    expect(faces(s1, 1)).toEqual(['orange:9']);
    expect(s1.drawPile.at(-1)).toMatchObject({ color: 'pink', value: 7, other: { color: 'blue', value: 3 } });
    // The Flip card itself turned over: its back is now on top.
    expect(s1.discardPile.at(-1)).toMatchObject({ color: 'pink', value: 4 });
    expect(s1.currentColor).toBe('pink');
    expect(s1.currentPlayer).toBe(1);
  });

  it('flips back to the light side', () => {
    const state = makeFlipState({ hands: [[['Pflip', 'r4'], ['T1', 'g2']], [['O2', 'y9']]], top: ['P5', 'b2'], side: 'dark' });
    const s1 = ok(play(state, 0, 0));
    expect(s1.side).toBe('light');
    expect(faces(s1, 1)).toEqual(['yellow:9']);
    expect(s1.currentColor).toBe('red');
  });

  it('lets the flipper choose a color when a wild turns up', () => {
    const state = makeFlipState({ hands: [[['rflip', 'wild!'], ['g1', 'T2']], [['y2', 'O9']]], top: ['r5', 'U2'] });
    const s1 = ok(play(state, 0, 0));
    expect(s1.phase).toBe('chooseColor');
    expect(s1.currentPlayer).toBe(0);
    expect(err(applyAction(s1, 1, { type: 'draw' }))).toMatch(/not your turn/);
    expect(err(applyAction(s1, 0, { type: 'draw' }))).toMatch(/Choose a color/);
    expect(err(applyAction(s1, 0, { type: 'chooseColor', color: 'red' }))).toMatch(/colors in play/);
    const s2 = ok(applyAction(s1, 0, { type: 'chooseColor', color: 'teal' }));
    expect(s2.currentColor).toBe('teal');
    expect(s2.phase).toBe('playing');
    expect(s2.currentPlayer).toBe(1);
  });

  it('only accepts wild colors from the side in play', () => {
    const state = makeFlipState({ hands: [[['wild!', 'r1'], ['T1', 'g2']], [['O2', 'y9']]], top: ['P5', 'b2'], side: 'dark' });
    expect(err(play(state, 0, 0, { color: 'red' }))).toMatch(/colors in play/);
    expect(ok(play(state, 0, 0, { color: 'orange' })).currentColor).toBe('orange');
    expect(colorsForSide('dark')).toEqual(DARK_COLORS);
  });
});

describe('Flip action cards', () => {
  it('Draw One: the next player draws one and is skipped', () => {
    const state = makeFlipState({ hands: [[['rdraw1', 'P1'], ['g1', 'T2']], [['y2', 'O9']], [['b2', 'U1']]], top: ['r5', 'U2'] });
    const s1 = ok(play(state, 0, 0));
    expect(s1.players[1]!.hand).toHaveLength(2);
    expect(s1.currentPlayer).toBe(2);
  });

  it('Draw Five: the next player draws five and is skipped', () => {
    const state = makeFlipState({ hands: [[['Pdraw5', 'r1'], ['T1', 'g2']], [['O2', 'y9']], [['U2', 'b1']]], top: ['P3', 'b2'], side: 'dark' });
    const s1 = ok(play(state, 0, 0));
    expect(s1.players[1]!.hand).toHaveLength(6);
    expect(s1.currentPlayer).toBe(2);
  });

  it('Skip Everyone: you go again', () => {
    const state = makeFlipState({ hands: [[['PskipAll', 'r1'], ['T1', 'g2']], [['O2', 'y9']], [['U2', 'b1']]], top: ['P3', 'b2'], side: 'dark' });
    const s1 = ok(play(state, 0, 0));
    expect(s1.currentPlayer).toBe(0);
  });

  it('Wild Draw Color: the next player draws until they get the chosen color', () => {
    const state = makeFlipState({
      hands: [[['wildColor', 'r1'], ['T1', 'g2']], [['O2', 'y9']], [['U2', 'b1']]],
      top: ['P3', 'b2'],
      side: 'dark',
      drawPile: [['P1', 'r1'], ['O4', 'r2'], ['T7', 'r3'], ['U5', 'r4']],
    });
    const s1 = ok(play(state, 0, 0, { color: 'teal' }));
    expect(faces(s1, 1)).toEqual(['orange:2', 'pink:1', 'orange:4', 'teal:7']);
    expect(s1.currentPlayer).toBe(2);
  });

  it('Wild Draw Two can be challenged like a Wild +4', () => {
    const state = makeFlipState({ hands: [[['wild2', 'P1'], ['r1', 'T2']], [['y2', 'O9'], ['y3', 'O8']]], top: ['r5', 'U2'], rules: { challengeWild4: true } });
    const s1 = ok(play(state, 0, 0, { color: 'blue' }));
    expect(s1.pendingDraw).toBe(2);
    const s2 = ok(applyAction(s1, 1, { type: 'challenge' }));
    // Seat 0 still held a red card, so the Wild Draw Two was a bluff.
    expect(s2.players[0]!.hand).toHaveLength(3);
    expect(s2.currentPlayer).toBe(1);
  });

  it('stacks draw cards that draw at least as many', () => {
    const rules = { stackDraws: true };
    const state = makeFlipState({ hands: [[['rdraw1', 'P1'], ['g1', 'T2']], [['bdraw1', 'O9'], ['wild2', 'O1']], [['y1', 'U1']]], top: ['r5', 'U2'], rules });
    const s1 = ok(play(state, 0, 0));
    expect(s1.pendingDraw).toBe(1);
    expect(ok(play(s1, 1, 0)).pendingDraw).toBe(2);
    expect(ok(play(s1, 1, 1, { color: 'green' })).pendingDraw).toBe(3);
  });

  it('jump-in matches the face in play', () => {
    const state = makeFlipState({ hands: [[['P1', 'b1']], [['O2', 'y9']], [['P3', 'g3'], ['T1', 'r1']]], top: ['P3', 'b2'], side: 'dark', rules: { jumpIn: true } });
    expect(jumpInCards(state, 2)).toHaveLength(1);
  });
});

describe('Flip scoring', () => {
  it('scores leftover cards by the side in play', () => {
    const state = makeFlipState({
      hands: [[['P1', 'b1']], [['PskipAll', 'r1'], ['wildColor', 'y2']]],
      top: ['P3', 'b2'],
      side: 'dark',
    });
    const s1 = ok(play(state, 0, 0));
    expect(s1.phase).toBe('gameOver');
    expect(s1.scores[0]).toBe(30 + 60);
  });
});

// ---------------------------------------------------------------------------

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    const [r, next] = nextRandom(s);
    s = next;
    return r;
  };
}

const HOUSE_RULES = ['stackDraws', 'stackPlus2OnPlus4', 'stackSameNumber', 'sevenZero', 'jumpIn', 'drawUntilPlayable', 'challengeWild4', 'noActionFinish'] as const;

describe('simulated Flip games', () => {
  it('bots play hundreds of Flip games with mixed house rules to the end', { timeout: 120_000 }, () => {
    let flips = 0;
    for (let seed = 0; seed < 250; seed++) {
      const n = 2 + (seed % 9);
      const random = seeded(seed + 11);
      const rules: RuleSet = { ...DEFAULT_RULES, deckCount: n > 8 ? 2 : 1, winCondition: seed % 7 === 0 ? 'points500' : 'firstOut' };
      for (const key of HOUSE_RULES) rules[key] = random() < 0.4;
      const players = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true }));
      let state = createGame(players, rules, seed);
      const total = totalCards(state);
      for (let step = 0; state.phase !== 'gameOver'; step++) {
        if (step > 30_000) throw new Error(`seed ${seed}: did not finish`);
        if (state.phase === 'roundOver') {
          const next = flip.startNextRound(state);
          if (!next.ok) throw new Error(next.error);
          state = next.state;
          continue;
        }
        let seat = state.currentPlayer;
        let actions = flip.chooseBotMove(state, seat, seat % 2 ? 'easy' : 'normal', random);
        for (let other = 0; other < n && rules.jumpIn; other++) {
          const jump = flip.chooseBotJumpIn(state, other, 'normal', random);
          if (jump && random() < 0.3) {
            seat = other;
            actions = jump;
            break;
          }
        }
        for (const action of actions) {
          const result = applyAction(state, seat, action);
          if (!result.ok) throw new Error(`seed ${seed}: illegal bot move: ${result.error} (${JSON.stringify(action)})`);
          if (result.events.some((e) => e.type === 'flipped')) flips++;
          state = result.state;
        }
        if (totalCards(state) !== total) throw new Error(`seed ${seed}: cards lost`);
        // Every card always has both faces, one of each side.
        const all = [...state.drawPile, ...state.discardPile, ...state.players.flatMap((p) => p.hand)];
        if (!all.every((c) => c.other && Boolean(c.dark) !== Boolean(c.other.dark))) throw new Error(`seed ${seed}: a card lost a face`);
        if (!all.every((c) => Boolean(c.dark) === (state.side === 'dark'))) throw new Error(`seed ${seed}: a card shows the wrong side`);
      }
    }
    expect(flips).toBeGreaterThan(100);
  });
});
