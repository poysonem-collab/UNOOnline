import type { Card, CardFace, Color, GameState } from '../../types.js';
import { canPlayOn, drawAmount } from './rules.js';

/**
 * Expert bots think ahead the way strong players do: "if I play this, what might they
 * answer with?" For each possible move, imagine many ways the unseen cards could be spread
 * among the other hands (respecting what we've noticed, like who drew on which color),
 * play each imagined game out quickly, and pick the move that wins most often.
 *
 * Only cards the bot hasn't seen are shuffled into the imagined hands, so it never peeks.
 * The quick games follow the core rules; house rules that change the flow a lot
 * (stacking, 7-0, jump-in) and UNO Flip are left to the Expert's rules of thumb instead.
 */

type SimCard = CardFace;

interface Sim {
  hands: SimCard[][];
  draw: SimCard[];
  discard: SimCard[];
  top: SimCard;
  color: Color;
  current: number;
  dir: 1 | -1;
  colors: readonly Color[];
  drawUntilPlayable: boolean;
  noActionFinish: boolean;
  random: () => number;
}

export interface Candidate {
  /** Cards to play, or empty to keep a drawn card (pass). */
  cards: Card[];
  color?: Color;
}

/** Whether the imagined games are close enough to the real rules to trust. */
export function lookaheadSupported(state: GameState): boolean {
  const { rules } = state;
  return (
    state.side === undefined &&
    state.pendingDraw === 0 &&
    !rules.stackDraws &&
    !rules.sevenZero &&
    !rules.jumpIn &&
    (state.phase === 'playing' || state.phase === 'playDrawn')
  );
}

/** Win rate (0-1) of each candidate move over imagined games. */
export function rateCandidates(
  state: GameState,
  seat: number,
  candidates: Candidate[],
  unseen: SimCard[],
  colors: readonly Color[],
  random: () => number,
  budget = 360,
): number[] {
  const samples = Math.max(12, Math.floor(budget / candidates.length));
  const wins = candidates.map(() => 0);
  for (let i = 0; i < samples; i++) {
    // The same imagined deal for every candidate, so they're compared fairly.
    const world = imagine(state, seat, unseen, colors, random);
    candidates.forEach((candidate, c) => {
      const sim = copy(world);
      if (applyCandidate(sim, seat, candidate) === seat || playOut(sim) === seat) wins[c]! += 1;
    });
  }
  return wins.map((w) => w / samples);
}

/** One plausible deal of the unseen cards, consistent with hand sizes and noticed voids. */
function imagine(state: GameState, seat: number, unseen: SimCard[], colors: readonly Color[], random: () => number): Sim {
  const pool = [...unseen];
  shuffle(pool, random);
  const hands = state.players.map((p, i) => {
    if (i === seat) return p.hand.map(face);
    const voids = state.voids[i]!;
    const hand: SimCard[] = [];
    // Prefer cards they could plausibly hold, then fill up with anything.
    for (let j = 0; j < pool.length && hand.length < p.hand.length; j++) {
      const card = pool[j]!;
      if (card.color === 'wild' || !voids.includes(card.color)) {
        hand.push(card);
        pool.splice(j--, 1);
      }
    }
    while (hand.length < p.hand.length && pool.length) hand.push(pool.pop()!);
    return hand;
  });
  return {
    hands,
    draw: pool,
    discard: state.discardPile.map(face),
    top: face(state.discardPile[state.discardPile.length - 1]!),
    color: state.currentColor,
    current: state.currentPlayer,
    dir: state.direction,
    colors,
    drawUntilPlayable: state.rules.drawUntilPlayable,
    noActionFinish: state.rules.noActionFinish,
    random,
  };
}

function face(card: CardFace): SimCard {
  return { color: card.color, value: card.value } as SimCard;
}

function copy(sim: Sim): Sim {
  return { ...sim, hands: sim.hands.map((h) => [...h]), draw: [...sim.draw], discard: [...sim.discard] };
}

/** Plays our candidate move. Returns the winner if it ends the game, else -1. */
function applyCandidate(sim: Sim, seat: number, candidate: Candidate): number {
  if (candidate.cards.length === 0) {
    sim.current = next(sim, seat, 1);
    return -1;
  }
  const hand = sim.hands[seat]!;
  let last: SimCard | undefined;
  for (const card of candidate.cards) {
    const i = hand.findIndex((h) => h.color === card.color && h.value === card.value);
    if (i >= 0) last = hand.splice(i, 1)[0]!;
  }
  if (!last) return -1;
  return resolvePlay(sim, seat, last, candidate.color);
}

/** Plays the imagined game to the end with sensible play for everyone. Returns the winner. */
function playOut(sim: Sim): number {
  for (let plies = 0; plies < 400; plies++) {
    const p = sim.current;
    const hand = sim.hands[p]!;
    let i = choose(sim, p);
    if (i < 0) {
      const drawn = drawFor(sim, p);
      if (drawn && playable(sim, drawn, hand.length)) i = hand.length - 1;
      else {
        sim.current = next(sim, p, 1);
        continue;
      }
    }
    const card = hand.splice(i, 1)[0]!;
    const winner = resolvePlay(sim, p, card, card.color === 'wild' ? favouriteColor(sim, hand) : undefined);
    if (winner >= 0) return winner;
  }
  return -1;
}

function resolvePlay(sim: Sim, p: number, card: SimCard, chosen: Color | undefined): number {
  sim.discard.push(card);
  sim.top = card;
  sim.color = card.color === 'wild' ? chosen ?? sim.colors[0]! : card.color;
  if (sim.hands[p]!.length === 0) {
    const amount = drawAmount(card);
    if (amount) give(sim, next(sim, p, 1), amount);
    return p;
  }
  const n = sim.hands.length;
  switch (card.value) {
    case 'skip':
      sim.current = next(sim, p, 2);
      break;
    case 'reverse':
      sim.dir = sim.dir === 1 ? -1 : 1;
      sim.current = n === 2 ? p : next(sim, p, 1);
      break;
    case 'skipAll':
      sim.current = p;
      break;
    case 'wildColor': {
      const victim = next(sim, p, 1);
      for (let guard = 0; guard < 120; guard++) {
        const c = take(sim);
        if (!c) break;
        sim.hands[victim]!.push(c);
        if (c.color === sim.color) break;
      }
      sim.current = next(sim, p, 2);
      break;
    }
    default: {
      const amount = drawAmount(card);
      if (amount) {
        give(sim, next(sim, p, 1), amount);
        sim.current = next(sim, p, 2);
      } else {
        sim.current = next(sim, p, 1);
      }
    }
  }
  return -1;
}

/** A sensible quick choice: match color over wilds, attack someone nearly out, dump big numbers. */
function choose(sim: Sim, p: number): number {
  const hand = sim.hands[p]!;
  const nextSize = sim.hands[next(sim, p, 1)]!.length;
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i]!;
    if (!playable(sim, card, hand.length)) continue;
    let s = card.color === 'wild' ? -50 : 0;
    if (nextSize <= 2 && (drawAmount(card) > 0 || card.value === 'skip' || card.value === 'reverse')) s += 100;
    if (typeof card.value === 'number') s += card.value * 0.5;
    if (card.color !== 'wild') for (const h of hand) if (h.color === card.color) s += 2;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

function playable(sim: Sim, card: SimCard, handSize: number): boolean {
  if (sim.noActionFinish && handSize === 1 && typeof card.value !== 'number') return false;
  return canPlayOn(card as Card, sim.top as Card, sim.color);
}

function favouriteColor(sim: Sim, hand: SimCard[]): Color {
  let best = sim.colors[0]!;
  let bestCount = -1;
  for (const color of sim.colors) {
    const count = hand.filter((c) => c.color === color).length;
    if (count > bestCount) {
      bestCount = count;
      best = color;
    }
  }
  return best;
}

function drawFor(sim: Sim, p: number): SimCard | undefined {
  let card: SimCard | undefined;
  for (let guard = 0; guard < 120; guard++) {
    card = take(sim);
    if (!card) return undefined;
    sim.hands[p]!.push(card);
    if (!sim.drawUntilPlayable || playable(sim, card, 2)) return card;
  }
  return card;
}

function give(sim: Sim, p: number, amount: number): void {
  for (let i = 0; i < amount; i++) {
    const c = take(sim);
    if (!c) return;
    sim.hands[p]!.push(c);
  }
}

function take(sim: Sim): SimCard | undefined {
  if (sim.draw.length === 0 && sim.discard.length > 1) {
    sim.draw = sim.discard.slice(0, -1);
    sim.discard = [sim.top];
    shuffle(sim.draw, sim.random);
  }
  return sim.draw.pop();
}

function next(sim: Sim, from: number, steps: number): number {
  const n = sim.hands.length;
  return (((from + steps * sim.dir) % n) + n) % n;
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}
