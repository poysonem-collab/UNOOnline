import { COLORS, type Action, type Card, type Color, type GameState } from '../../types.js';
import type { BotDifficulty } from '../Variant.js';
import { playableCards, seatAfter } from './rules.js';

/** Chance a bot catches a player who forgot to call UNO. */
export const BOT_CATCH_CHANCE: Record<BotDifficulty, number> = { easy: 0.25, normal: 0.7 };
/** Chance a bot remembers to call UNO itself. */
const BOT_CALL_CHANCE: Record<BotDifficulty, number> = { easy: 0.6, normal: 1 };

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
  const playable = playableCards(state, seat);

  if (playable.length === 0) {
    return [state.phase === 'playDrawn' ? { type: 'pass' } : { type: 'draw' }];
  }

  const card = difficulty === 'easy' ? pickRandom(playable, random) : pickBestCard(state, seat, playable);
  const actions: Action[] = [];
  if (hand.length === 2 && !state.players[seat]!.calledUno && random() < BOT_CALL_CHANCE[difficulty]) {
    actions.push({ type: 'callUno' });
  }
  const play: Action = { type: 'play', cardIds: [card.id] };
  if (card.color === 'wild') {
    play.color = difficulty === 'easy' ? pickRandom([...COLORS], random) : bestColor(hand, card, random);
  }
  actions.push(play);
  return actions;
}

function pickRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function pickBestCard(state: GameState, seat: number, playable: Card[]): Card {
  const hand = state.players[seat]!.hand;
  const nextHandSize = state.players[seatAfter(state, seat)]!.hand.length;
  const colorCounts = countColors(hand);

  const score = (card: Card): number => {
    const isAttack = card.value === 'skip' || card.value === 'draw2' || card.value === 'wild4' || card.value === 'reverse';
    let s = 0;
    // Hold wilds for when nothing else works...
    if (card.color === 'wild') s -= 100;
    // ...unless the next player is about to win.
    if (nextHandSize <= 2 && isAttack) s += 200;
    // Dump high-point cards first, and stay in the color we hold most of.
    if (typeof card.value === 'number') s += card.value;
    else if (card.color !== 'wild') s += 15;
    if (card.color !== 'wild') s += colorCounts[card.color] * 2;
    return s;
  };

  return playable.reduce((best, card) => (score(card) > score(best) ? card : best));
}

/** The color the bot holds most of once `playing` has left its hand. */
function bestColor(hand: Card[], playing: Card, random: () => number): Color {
  const counts = countColors(hand.filter((c) => c.id !== playing.id));
  const max = Math.max(...COLORS.map((c) => counts[c]));
  if (max === 0) return pickRandom([...COLORS], random);
  return COLORS.find((c) => counts[c] === max)!;
}

function countColors(hand: Card[]): Record<Color, number> {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const card of hand) if (card.color !== 'wild') counts[card.color]++;
  return counts;
}
