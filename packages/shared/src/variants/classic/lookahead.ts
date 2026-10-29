import type { Card, CardFace, Color, GameState } from '../../types.js';
import { deckFor, mercyLimitFor } from '../decks.js';
import { canPlayOn, drawAmount } from './rules.js';

/**
 * Expert bots think ahead the way strong players do: "if I play this, what might they
 * answer with?" For each possible move, imagine many ways the unseen cards could be spread
 * among the other hands (respecting what we've noticed, like who drew on which color),
 * play each imagined game out quickly, and pick the move that wins most often.
 *
 * Only cards the bot hasn't seen are shuffled into the imagined hands, so it never peeks.
 * The quick games follow the core rules plus stacking, 7-0 and No Mercy's cards and
 * knockouts; jump-in (which happens out of turn) and UNO Flip are left to the Expert's
 * rules of thumb instead.
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
  stack: boolean;
  sevenZero: boolean;
  /** Cards waiting for whoever can't stack. */
  pending: number;
  /** No Mercy: a hand this big is knocked out. */
  mercy: number | null;
  out: boolean[];
  random: () => number;
}

/** How hard to think: imagined games in total, and how many turns to play each one out. */
export interface Search {
  budget: number;
  depth: number;
}

/**
 * Classic games are short enough to play to the end. No Mercy games run long and swing wildly,
 * so it's better to look about 20 turns ahead and judge who's ahead by hand sizes (in tests
 * against Hard bots this won more often, and faster, than playing every game out).
 */
export function searchFor(state: GameState): Search {
  return deckFor(state.variantId).mercyRule ? { budget: 600, depth: 20 } : { budget: 360, depth: 500 };
}

export interface Candidate {
  /** Cards to play, or empty to keep a drawn card (pass) or take the stacked cards. */
  cards: Card[];
  color?: Color;
}

/**
 * Whether the imagined games are close enough to the real rules to trust. (UNO All Wild is left
 * out too: any card fits, so the choices barely differ, and in tests imagining games only added
 * noise to the Expert's rules of thumb.)
 */
export function lookaheadSupported(state: GameState): boolean {
  if (deckFor(state.variantId).colorless) return false;
  return state.side === undefined && !state.rules.jumpIn && (state.phase === 'playing' || state.phase === 'playDrawn');
}

/** Win rate (0-1) of each candidate move over imagined games. */
export function rateCandidates(
  state: GameState,
  seat: number,
  candidates: Candidate[],
  unseen: SimCard[],
  colors: readonly Color[],
  random: () => number,
  { budget, depth }: Search,
): number[] {
  const samples = Math.max(12, Math.floor(budget / candidates.length));
  const wins = candidates.map(() => 0);
  for (let i = 0; i < samples; i++) {
    // The same imagined deal for every candidate, so they're compared fairly.
    const world = imagine(state, seat, unseen, colors, random);
    candidates.forEach((candidate, c) => {
      const sim = copy(world);
      const winner = applyCandidate(sim, seat, candidate);
      wins[c]! += winner >= 0 ? Number(winner === seat) : playOut(sim, seat, depth);
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
  const { rules } = state;
  return {
    hands,
    draw: pool,
    discard: state.discardPile.map(face),
    top: face(state.discardPile[state.discardPile.length - 1]!),
    color: state.currentColor,
    current: state.currentPlayer,
    dir: state.direction,
    colors,
    drawUntilPlayable: rules.drawUntilPlayable,
    noActionFinish: rules.noActionFinish,
    stack: rules.stackDraws,
    sevenZero: rules.sevenZero,
    pending: state.pendingDraw,
    mercy: mercyLimitFor(state.variantId, state.rules),
    out: [...state.out],
    random,
  };
}

function face(card: CardFace): SimCard {
  return { color: card.color, value: card.value } as SimCard;
}

function copy(sim: Sim): Sim {
  return { ...sim, hands: sim.hands.map((h) => [...h]), draw: [...sim.draw], discard: [...sim.discard], out: [...sim.out] };
}

/** Plays our candidate move. Returns the winner if it ends the game, else -1. */
function applyCandidate(sim: Sim, seat: number, candidate: Candidate): number {
  if (candidate.cards.length === 0) {
    if (sim.pending > 0) return takePending(sim, seat);
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

/**
 * Plays the imagined game on with sensible play for everyone. Returns 1 if `seat` wins, 0 if
 * someone else does, or, if it's still going after `depth` turns, how good `seat`'s position looks.
 */
function playOut(sim: Sim, seat: number, depth: number): number {
  const winner = playTo(sim, depth);
  return winner >= 0 ? Number(winner === seat) : standing(sim, seat);
}

/** A rough chance of winning from here: smaller hands are closer to going out. */
function standing(sim: Sim, seat: number): number {
  if (sim.out[seat]) return 0;
  let total = 0;
  sim.hands.forEach((hand, i) => {
    if (!sim.out[i]) total += 1 / Math.max(1, hand.length);
  });
  return 1 / Math.max(1, sim.hands[seat]!.length) / total;
}

/** Plays up to `depth` turns. Returns the winner, or -1 if nobody has won yet. */
function playTo(sim: Sim, depth: number): number {
  for (let plies = 0; plies < depth; plies++) {
    const p = sim.current;
    const hand = sim.hands[p]!;
    if (sim.pending > 0) {
      const i = chooseStack(sim, p);
      if (i < 0) {
        const winner = takePending(sim, p);
        if (winner >= 0) return winner;
        continue;
      }
      const card = hand.splice(i, 1)[0]!;
      const winner = resolvePlay(sim, p, card, card.color === 'wild' ? favouriteColor(sim, hand) : undefined);
      if (winner >= 0) return winner;
      continue;
    }
    let i = choose(sim, p);
    if (i < 0) {
      const drawn = drawFor(sim, p);
      const winner = knockout(sim, p);
      if (winner >= 0) return winner;
      if (drawn && !sim.out[p] && playable(sim, drawn, hand.length)) i = hand.length - 1;
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

function takePending(sim: Sim, p: number): number {
  give(sim, p, sim.pending);
  sim.pending = 0;
  const winner = knockout(sim, p);
  sim.current = next(sim, p, 1);
  return winner;
}

function resolvePlay(sim: Sim, p: number, card: SimCard, chosen: Color | undefined): number {
  const hand = sim.hands[p]!;
  sim.discard.push(card);
  sim.top = card;
  sim.color = card.color === 'wild' ? chosen ?? sim.colors[0]! : card.color;
  if (card.value === 'discardAll' || card.value === 'wildDiscardAll') {
    const color = card.value === 'discardAll' ? card.color : favouriteColor(sim, hand);
    for (let i = hand.length - 1; i >= 0; i--) if (hand[i]!.color === color) sim.discard.unshift(...hand.splice(i, 1));
    if (card.value === 'wildDiscardAll') sim.color = favouriteColor(sim, hand);
  }
  if (hand.length === 0) return p;
  switch (card.value) {
    case 'skip':
      sim.current = next(sim, p, 2);
      break;
    case 'reverse':
      sim.dir = sim.dir === 1 ? -1 : 1;
      sim.current = active(sim) === 2 ? p : next(sim, p, 1);
      break;
    case 'skipAll':
    case 10:
      sim.current = p;
      break;
    case 'wildColor':
    case 'roulette': {
      // Draw until the color turns up (for Roulette, the victim picks it), losing the turn.
      const victim = next(sim, p, 1);
      const land = next(sim, p, 2);
      if (card.value === 'roulette') sim.color = sim.colors[Math.floor(sim.random() * sim.colors.length)]!;
      for (let guard = 0; guard < 120; guard++) {
        const c = take(sim);
        if (!c) break;
        sim.hands[victim]!.push(c);
        if (c.color === sim.color) break;
      }
      const winner = knockout(sim, victim);
      if (winner >= 0) return winner;
      sim.current = land;
      break;
    }
    case 7:
      if (sim.sevenZero) {
        const others = sim.hands.map((_, i) => i).filter((i) => i !== p && !sim.out[i]);
        const target = others.reduce((a, b) => (sim.hands[b]!.length < sim.hands[a]!.length ? b : a));
        [sim.hands[p], sim.hands[target]] = [sim.hands[target]!, sim.hands[p]!];
      }
      sim.current = next(sim, p, 1);
      break;
    case 0:
      if (sim.sevenZero) {
        const before = sim.hands.map((h) => h);
        sim.hands.forEach((_, i) => {
          if (!sim.out[i]) sim.hands[i] = before[next(sim, i, -1)]!;
        });
      }
      sim.current = next(sim, p, 1);
      break;
    default: {
      if (card.value === 'wildRev4' || card.value === 'wildRev8') sim.dir = sim.dir === 1 ? -1 : 1;
      const amount = drawAmount(card);
      if (!amount) {
        sim.current = next(sim, p, 1);
      } else if (sim.stack) {
        sim.pending += amount;
        sim.current = next(sim, p, 1);
      } else {
        const victim = next(sim, p, 1);
        const land = next(sim, p, 2);
        give(sim, victim, amount);
        const winner = knockout(sim, victim);
        if (winner >= 0) return winner;
        sim.current = land;
      }
    }
  }
  return -1;
}

/** No Mercy: knocks `p` out if their hand is too big. Returns the last player standing, else -1. */
function knockout(sim: Sim, p: number): number {
  if (sim.mercy === null || sim.hands[p]!.length < sim.mercy) return -1;
  sim.draw.unshift(...sim.hands[p]!);
  sim.hands[p] = [];
  sim.out[p] = true;
  if (active(sim) !== 1) return -1;
  return sim.out.indexOf(false);
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
    if (nextSize <= 2 && (drawAmount(card) > 0 || card.value === 'skip' || card.value === 'reverse' || card.value === 'skipAll')) s += 100;
    if (typeof card.value === 'number') s += card.value * 0.5;
    if (card.color !== 'wild') for (const h of hand) if (h.color === card.color) s += card.value === 'discardAll' ? 6 : 2;
    if (sim.sevenZero && card.value === 7 && hand.length > 3) s += 40;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

/** Facing a stack: pass it on with the smallest draw card that's allowed. */
function chooseStack(sim: Sim, p: number): number {
  const hand = sim.hands[p]!;
  let best = -1;
  for (let i = 0; i < hand.length; i++) {
    if (playable(sim, hand[i]!, hand.length) && (best < 0 || drawAmount(hand[i]!) < drawAmount(hand[best]!))) best = i;
  }
  return best;
}

function playable(sim: Sim, card: SimCard, handSize: number): boolean {
  if (sim.noActionFinish && handSize === 1 && typeof card.value !== 'number') return false;
  if (sim.pending > 0) return sim.stack && drawAmount(card) > 0 && drawAmount(card) >= drawAmount(sim.top);
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

function active(sim: Sim): number {
  return sim.out.filter((o) => !o).length;
}

/** The seat `steps` along in the direction of play (backwards if negative), passing over knocked-out players. */
function next(sim: Sim, from: number, steps: number): number {
  const n = sim.hands.length;
  const step = (steps < 0 ? -1 : 1) * sim.dir;
  let seat = from;
  for (let moved = 0; moved < Math.abs(steps); moved++) {
    for (let tries = 0; tries < n; tries++) {
      seat = (((seat + step) % n) + n) % n;
      if (!sim.out[seat]) break;
    }
  }
  return seat;
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}
