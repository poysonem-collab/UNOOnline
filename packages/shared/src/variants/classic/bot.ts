import { ALL_COLORS, colorsForSide, type Action, type Card, type Color, type GameState } from '../../types.js';
import type { BotDifficulty } from '../Variant.js';
import { canChallenge } from './engine.js';
import { drawAmount, jumpInCards, playableCards, seatAfter } from './rules.js';

/** Chance a bot catches a player who forgot to call UNO. */
export const BOT_CATCH_CHANCE: Record<BotDifficulty, number> = { easy: 0.25, normal: 0.7 };
/** Chance a bot remembers to call UNO itself. */
const BOT_CALL_CHANCE: Record<BotDifficulty, number> = { easy: 0.6, normal: 1 };
/** Chance a bot notices it can jump in. */
export const BOT_JUMP_IN_CHANCE: Record<BotDifficulty, number> = { easy: 0.2, normal: 0.5 };

/**
 * Actions the bot in `seat` takes on its turn, in order
 * (e.g. call UNO, then play). `random` returns numbers in [0, 1).
 */
export function chooseBotMove(
  state: GameState,
  seat: number,
  difficulty: BotDifficulty,
  random: () => number,
): Action[] {
  const hand = state.players[seat]!.hand;
  const colors = colorsForSide(state.side);
  if (state.phase === 'chooseColor') {
    return [{ type: 'chooseColor', color: difficulty === 'easy' ? pickRandom([...colors], random) : bestColor(hand, colors, random) }];
  }
  const playable = playableCards(state, seat);

  if (playable.length === 0) {
    if (state.pendingDraw > 0 && canChallenge(state) && shouldChallenge(state, difficulty, random)) {
      return [{ type: 'challenge' }];
    }
    return [state.phase === 'playDrawn' ? { type: 'pass' } : { type: 'draw' }];
  }

  const card = difficulty === 'easy' ? pickRandom(playable, random) : pickBestCard(state, seat, playable);
  const cards = difficulty === 'easy' ? [card] : withSameNumbers(state, hand, card);
  return withUnoCall(state, seat, hand.length - cards.length, difficulty, random, playAction(state, seat, cards, difficulty, random));
}

/** A bot's jump-in, if it has an identical card (normal bots only take ones that help). */
export function chooseBotJumpIn(state: GameState, seat: number, difficulty: BotDifficulty, random: () => number): Action[] | null {
  const card = jumpInCards(state, seat)[0];
  if (!card) return null;
  const hand = state.players[seat]!.hand;
  const cards = difficulty === 'easy' ? [card] : withSameNumbers(state, hand, card);
  return withUnoCall(state, seat, hand.length - cards.length, difficulty, random, playAction(state, seat, cards, difficulty, random));
}

function withUnoCall(
  state: GameState,
  seat: number,
  handAfter: number,
  difficulty: BotDifficulty,
  random: () => number,
  play: Action,
): Action[] {
  const remembers = random() < BOT_CALL_CHANCE[difficulty];
  return handAfter === 1 && !state.players[seat]!.calledUno && remembers ? [{ type: 'callUno' }, play] : [play];
}

function playAction(state: GameState, seat: number, cards: Card[], difficulty: BotDifficulty, random: () => number): Action {
  const hand = state.players[seat]!.hand;
  const last = cards[cards.length - 1]!;
  const action: Action = { type: 'play', cardIds: cards.map((c) => c.id) };
  if (last.color === 'wild') {
    const colors = colorsForSide(state.side);
    const rest = hand.filter((c) => !cards.includes(c));
    action.color = difficulty === 'easy' ? pickRandom([...colors], random) : bestColor(rest, colors, random);
  }
  if (state.rules.sevenZero && last.value === 7 && hand.length > cards.length) {
    action.swapWith = difficulty === 'easy' ? pickRandom(opponents(state, seat), random) : smallestHand(state, seat);
  }
  return action;
}

/**
 * With same-number stacking, also plays every other card of that number,
 * ending on the color the bot holds most of.
 */
function withSameNumbers(state: GameState, hand: Card[], first: Card): Card[] {
  if (!state.rules.stackSameNumber || typeof first.value !== 'number') return [first];
  const extras = hand.filter((c) => c !== first && c.value === first.value);
  if (extras.length === 0) return [first];
  const counts = countColors(hand.filter((c) => c.value !== first.value));
  extras.sort((a, b) => colorCount(counts, a) - colorCount(counts, b));
  return [first, ...extras];
}

function colorCount(counts: Record<Color, number>, card: Card): number {
  return card.color === 'wild' ? 0 : counts[card.color];
}

function pickRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function opponents(state: GameState, seat: number): number[] {
  return state.players.map((_, i) => i).filter((i) => i !== seat);
}

function smallestHand(state: GameState, seat: number): number {
  return opponents(state, seat).reduce((best, i) =>
    state.players[i]!.hand.length < state.players[best]!.hand.length ? i : best,
  );
}

function pickBestCard(state: GameState, seat: number, playable: Card[]): Card {
  const hand = state.players[seat]!.hand;
  const nextHandSize = state.players[seatAfter(state, seat)]!.hand.length;
  const colorCounts = countColors(hand);
  const fewestOther = state.players[smallestHand(state, seat)]!.hand.length;

  const score = (card: Card): number => {
    const isAttack = drawAmount(card) > 0 || ['skip', 'skipAll', 'reverse', 'wildColor'].includes(String(card.value));
    let s = 0;
    // Hold wilds for when nothing else works...
    if (card.color === 'wild') s -= 100;
    // ...unless the next player is about to win.
    if (nextHandSize <= 2 && isAttack) s += 200;
    // When stacking, pass the cheapest draw card and keep the big ones.
    if (state.pendingDraw > 0) s += 50 - drawAmount(card) * 8;
    // Skip Everyone means another turn straight away.
    if (card.value === 'skipAll') s += 25;
    // A 7 is worth playing when someone else has a much smaller hand.
    if (state.rules.sevenZero && card.value === 7) s += fewestOther < hand.length - 2 ? 150 : -30;
    // Dump high-point cards first, and stay in the color we hold most of.
    if (typeof card.value === 'number') s += card.value;
    else if (card.color !== 'wild') s += 15;
    if (card.color !== 'wild') s += colorCounts[card.color] * 2;
    // Getting rid of several cards at once is great.
    if (state.rules.stackSameNumber && typeof card.value === 'number') {
      s += (hand.filter((c) => c.value === card.value).length - 1) * 12;
    }
    return s;
  };

  return playable.reduce((best, card) => (score(card) > score(best) ? card : best));
}

/** Bots can't see hands, so they guess: a +4 from someone holding lots of cards is more likely a bluff. */
function shouldChallenge(state: GameState, difficulty: BotDifficulty, random: () => number): boolean {
  if (difficulty === 'easy' || !state.wild4Check) return false;
  const suspectCards = state.players[state.wild4Check.seat]!.hand.length;
  return suspectCards >= 4 && random() < 0.4;
}

/** The color (of those in play) the bot holds most of. */
function bestColor(hand: Card[], colors: readonly Color[], random: () => number): Color {
  const counts = countColors(hand);
  const max = Math.max(...colors.map((c) => counts[c]));
  if (max === 0) return pickRandom([...colors], random);
  return colors.find((c) => counts[c] === max)!;
}

function countColors(hand: Card[]): Record<Color, number> {
  const counts = Object.fromEntries(ALL_COLORS.map((c) => [c, 0])) as Record<Color, number>;
  for (const card of hand) if (card.color !== 'wild') counts[card.color]++;
  return counts;
}
