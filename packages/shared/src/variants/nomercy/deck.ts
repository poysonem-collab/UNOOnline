import { COLORS, type Card, type CardFace, type NumberValue } from '../../types.js';

export const NO_MERCY_DECK_SIZE = 168;

/** Cards the Expansion Pack adds to each deck. */
export const NO_MERCY_EXPANSION_SIZE = 20;

/**
 * One No Mercy deck. Per color: 0-9 twice, 3 Skip, 2 Skip Everyone, 3 Reverse, 3 Draw Two,
 * 2 Draw Four, 3 Discard All. Plus 8 Wild Reverse Draw 4, 4 Wild Draw 6, 4 Wild Draw 10 and
 * 8 Wild Color Roulette.
 *
 * The Expansion Pack adds two 10s per color (play again), 8 Wild Discard All and
 * 4 Wild Reverse Draw 8.
 */
export function buildNoMercyDecks(deckCount: number, expansion = false): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    let n = 0;
    const add = (face: CardFace, copies: number) => {
      for (let i = 0; i < copies; i++) cards.push({ ...face, id: `n${d}-${n++}` } as Card);
    };
    for (const color of COLORS) {
      for (let v = 0; v <= 9; v++) add({ color, value: v as NumberValue }, 2);
      add({ color, value: 'skip' }, 3);
      add({ color, value: 'skipAll' }, 2);
      add({ color, value: 'reverse' }, 3);
      add({ color, value: 'draw2' }, 3);
      add({ color, value: 'draw4' }, 2);
      add({ color, value: 'discardAll' }, 3);
    }
    add({ color: 'wild', value: 'wildRev4' }, 8);
    add({ color: 'wild', value: 'wild6' }, 4);
    add({ color: 'wild', value: 'wild10' }, 4);
    add({ color: 'wild', value: 'roulette' }, 8);
    if (expansion) {
      for (const color of COLORS) add({ color, value: 10 }, 2);
      add({ color: 'wild', value: 'wildDiscardAll' }, 8);
      add({ color: 'wild', value: 'wildRev8' }, 4);
    }
  }
  return cards;
}

/** No Mercy points: numbers at face value, colored action cards 20, wild cards 50. */
export function noMercyPoints(card: CardFace): number {
  if (typeof card.value === 'number') return card.value;
  return card.color === 'wild' ? 50 : 20;
}
