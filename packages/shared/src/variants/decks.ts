import type { Card, CardFace } from '../types.js';
import { buildDecks, cardPoints } from './classic/deck.js';
import { buildFlipDecks, FLIP_DECK_SIZE, flipPoints } from './flip/deck.js';

/** What differs between games that share the classic engine: the cards and their points. */
export interface DeckConfig {
  size: number;
  /** Builds `deckCount` decks; may use (and returns) the seeded RNG state. */
  build(deckCount: number, rng: number): [Card[], number];
  points(card: CardFace): number;
  /** Cards that can't be the first card turned up. */
  canStart(card: Card): boolean;
}

export const DECKS: Record<string, DeckConfig> = {
  classic: {
    size: 108,
    build: (deckCount, rng) => [buildDecks(deckCount), rng],
    points: cardPoints,
    canStart: (card) => card.color !== 'wild',
  },
  flip: {
    size: FLIP_DECK_SIZE,
    build: buildFlipDecks,
    points: flipPoints,
    canStart: (card) => card.color !== 'wild' && card.value !== 'flip',
  },
};

export function deckFor(variantId: string): DeckConfig {
  const deck = DECKS[variantId];
  if (!deck) throw new Error(`No deck for ${variantId}`);
  return deck;
}
