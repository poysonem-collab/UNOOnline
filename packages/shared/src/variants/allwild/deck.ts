import type { Card, CardFace, WildValue } from '../../types.js';

export const ALL_WILD_DECK_SIZE = 112;

/** One UNO All Wild deck: every card is wild. */
const COUNTS: [WildValue, number][] = [
  ['wild', 54],
  ['wild2', 10],
  ['wildSkip', 14],
  ['wildReverse', 14],
  ['wildSkip2', 6],
  ['wildTarget2', 4],
  ['wild4', 6],
  ['wildSwap', 4],
];

export function buildAllWildDecks(deckCount: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    let n = 0;
    for (const [value, copies] of COUNTS) {
      for (let i = 0; i < copies; i++) cards.push({ id: `a${d}-${n++}`, color: 'wild', value });
    }
  }
  return cards;
}

/** All Wild points: a plain Wild 20, every action card 50. */
export function allWildPoints(card: CardFace): number {
  return card.value === 'wild' ? 20 : 50;
}
