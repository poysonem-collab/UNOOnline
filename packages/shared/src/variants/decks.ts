import type { Card, CardFace, RuleSet } from '../types.js';
import { buildDecks, cardPoints } from './classic/deck.js';
import { buildFlipDecks, FLIP_DECK_SIZE, flipPoints } from './flip/deck.js';
import { ALL_WILD_DECK_SIZE, allWildPoints, buildAllWildDecks } from './allwild/deck.js';
import { buildFlexDecks, FLEX_DECK_SIZE } from './flex/deck.js';
import { buildGiantDecks, GIANT_DECK_SIZE } from './giant/deck.js';
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
  /** No Mercy: players holding too many cards (RuleSet.mercyLimit) are knocked out of the round. */
  mercyRule?: boolean;
  /** UNO All Wild: no colors at all, so nobody picks one. */
  colorless?: boolean;
  /** UNO Flex: every player has a Power Card that lets them play flex sides. */
  flexPower?: boolean;
}

export const DECKS: Record<string, DeckConfig> = {
  classic: {
    size: 108,
    build: (deckCount, rng) => [buildDecks(deckCount), rng],
    points: cardPoints,
    canStart: (card) => card.color !== 'wild',
    pointsToWin: 500,
  },
  flip: {
    size: FLIP_DECK_SIZE,
    build: buildFlipDecks,
    points: flipPoints,
    canStart: (card) => card.color !== 'wild' && card.value !== 'flip',
    pointsToWin: 500,
  },
  flex: {
    size: FLEX_DECK_SIZE,
    build: (deckCount, rng) => [buildFlexDecks(deckCount), rng],
    points: cardPoints,
    canStart: (card) => card.color !== 'wild',
    pointsToWin: 500,
    flexPower: true,
  },
  'all-wild': {
    size: ALL_WILD_DECK_SIZE,
    build: (deckCount, rng) => [buildAllWildDecks(deckCount), rng],
    points: allWildPoints,
    // Start on a plain Wild, so nobody is hit before the game begins.
    canStart: (card) => card.value === 'wild',
    pointsToWin: 500,
    colorless: true,
  },
  giant: {
    size: GIANT_DECK_SIZE,
    build: (deckCount, rng) => [buildGiantDecks(deckCount), rng],
    points: cardPoints,
    canStart: (card) => card.color !== 'wild',
    pointsToWin: 500,
  },
  'no-mercy': {
    size: NO_MERCY_DECK_SIZE,
    build: (deckCount, rng, rules) => [buildNoMercyDecks(deckCount, rules.noMercyExpansion), rng],
    points: noMercyPoints,
    // Start on a plain number so the first player isn't hit by a monster card.
    canStart: (card) => typeof card.value === 'number' && card.value !== 10,
    pointsToWin: 1000,
    mercyRule: true,
  },
};

/** No Mercy: the hand size that knocks a player out under these rules (null in games without the Mercy rule). */
export function mercyLimitFor(variantId: string, rules: RuleSet): number | null {
  return deckFor(variantId).mercyRule ? rules.mercyLimit : null;
}

export function deckFor(variantId: string): DeckConfig {
  const deck = DECKS[variantId];
  if (!deck) throw new Error(`No deck for ${variantId}`);
  return deck;
}
