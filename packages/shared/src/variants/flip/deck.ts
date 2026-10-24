import { shuffle } from '../../rng.js';
import { COLORS, DARK_COLORS, type Card, type CardFace, type NumberValue } from '../../types.js';

export const FLIP_DECK_SIZE = 112;

/** The 112 faces of one side: numbers 1-9 twice per color, two of each action, four of each wild. */
function sideFaces(dark: boolean): CardFace[] {
  const colors = dark ? DARK_COLORS : COLORS;
  const actions = dark ? (['draw5', 'reverse', 'skipAll', 'flip'] as const) : (['draw1', 'reverse', 'skip', 'flip'] as const);
  const wilds = dark ? (['wild', 'wildColor'] as const) : (['wild', 'wild2'] as const);
  const mark = dark ? { dark: true } : {};
  const faces: CardFace[] = [];
  for (const color of colors) {
    for (let v = 1; v <= 9; v++) {
      for (let copy = 0; copy < 2; copy++) faces.push({ color, value: v as NumberValue, ...mark });
    }
    for (const value of actions) {
      for (let copy = 0; copy < 2; copy++) faces.push({ color, value, ...mark });
    }
  }
  for (const value of wilds) {
    for (let copy = 0; copy < 4; copy++) faces.push({ color: 'wild', value, ...mark });
  }
  return faces;
}

/** UNO Flip decks: each card is a light face with a (seeded) random dark face on the back. */
export function buildFlipDecks(deckCount: number, rng: number): [Card[], number] {
  const cards: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    const light = sideFaces(false);
    const dark = sideFaces(true);
    rng = shuffle(dark, rng);
    light.forEach((face, i) => cards.push({ ...face, id: `f${d}-${i}`, other: dark[i]! } as Card));
  }
  return [cards, rng];
}

/** Official UNO Flip points, for the face in play. */
export function flipPoints(card: CardFace): number {
  switch (card.value) {
    case 'draw1':
      return 10;
    case 'draw5':
    case 'reverse':
    case 'skip':
    case 'flip':
      return 20;
    case 'skipAll':
      return 30;
    case 'wild':
      return 40;
    case 'wild2':
      return 50;
    case 'wildColor':
      return 60;
    default:
      return typeof card.value === 'number' ? card.value : 20;
  }
}
