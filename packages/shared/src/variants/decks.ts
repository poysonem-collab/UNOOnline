import type { Card, CardFace, RuleSet } from '../types.js';
import { buildDecks, cardPoints } from './classic/deck.js';
import { buildFlipDecks, FLIP_DECK_SIZE, flipPoints } from './flip/deck.js';
import { buildNoMercyDecks, NO_MERCY_DECK_SIZE, noMercyPoints } from './nomercy/deck.js';

/** What differs between games that share the classic engine: the cards and their points. */
export interface DeckConfig {
  size: number;
  /** Builds `deckCount` decks; may use (and returns) the seeded RNG state. */
  build(deckCount: number, rng: number, rules: RuleSet): [Card[], number];
  points(card: CardFace): number;
  /** Cards that can't be the first card turned up. */
  canStart(card: Card): boolean;
  /** Points needed to win a points game. */
  pointsToWin: number;
  /** No Mercy: a hand this big is knocked out of the round. */
  mercyLimit: number | null;
}

export const DECKS: Record<string, DeckConfig> = {
  classic: {
    size: 108,
    build: (deckCount, rng) => [buildDecks(deckCount), rng],
    points: cardPoints,
    canStart: (card) => card.color !== 'wild',
    pointsToWin: 500,
    mercyLimit: null,
  },
  flip: {
    size: FLIP_DECK_SIZE,
    build: buildFlipDecks,
    points: flipPoints,
    canStart: (card) => card.color !== 'wild' && card.value !== 'flip',
    pointsToWin: 500,
    mercyLimit: null,
  },
  'no-mercy': {
    size: NO_MERCY_DECK_SIZE,
    build: (deckCount, rng, rules) => [buildNoMercyDecks(deckCount, rules.noMercyExpansion), rng],
    points: noMercyPoints,
    // Start on a plain number so the first player isn't hit by a monster card.
    canStart: (card) => typeof card.value === 'number' && card.value !== 10,
    pointsToWin: 1000,
    mercyLimit: 25,
  },
};

export function deckFor(variantId: string): DeckConfig {
  const deck = DECKS[variantId];
  if (!deck) throw new Error(`No deck for ${variantId}`);
  return deck;
}
