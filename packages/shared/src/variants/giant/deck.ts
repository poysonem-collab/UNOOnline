import type { Card } from '../../types.js';
import { buildClassicDeck } from '../classic/deck.js';

export const GIANT_DECK_SIZE = 110;

/** One Giant UNO deck: the classic 108 cards plus two blank wild cards. */
export function buildGiantDecks(deckCount: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    cards.push(...buildClassicDeck(`g${d}`));
    cards.push({ id: `g${d}-custom1`, color: 'wild', value: 'custom1' }, { id: `g${d}-custom2`, color: 'wild', value: 'custom2' });
  }
  return cards;
}
