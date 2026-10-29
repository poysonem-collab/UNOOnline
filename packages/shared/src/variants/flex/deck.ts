import { COLORS, type Card, type CardFace, type Color, type NumberValue } from '../../types.js';

export const FLEX_DECK_SIZE = 104;

/** The flip symbol is on the regular (non-flex) 4s and 8s. */
const FLIP_NUMBERS = [4, 8];

/**
 * One UNO Flex deck (the 8 Power Cards aren't dealt; each player just has one). Per color:
 * 1-8 twice (one regular, one Flex), and a regular and a Flex Draw Two, Skip and Reverse.
 * Plus 8 Flex Wilds (4 "pick who draws 2", 4 "everyone draws 2"), 2 Flex Wild Draw Fours
 * and 6 Wild All Flips.
 */
export function buildFlexDecks(deckCount: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    let n = 0;
    const add = (face: CardFace) => cards.push({ ...face, id: `x${d}-${n++}` } as Card);
    COLORS.forEach((color, ci) => {
      // A Flex card's second color is always one of the other three.
      const other = (offset: number): Color => COLORS[(ci + offset) % 4]!;
      for (let v = 1; v <= 8; v++) {
        add({ color, value: v as NumberValue, ...(FLIP_NUMBERS.includes(v) ? { flip: true } : {}) });
        add({ color, value: v as NumberValue, flex: other(1 + (v % 3)) });
      }
      add({ color, value: 'draw2' });
      add({ color, value: 'draw2', flex: other(1) });
      add({ color, value: 'skip' });
      add({ color, value: 'skip', flex: other(2) });
      add({ color, value: 'reverse' });
      add({ color, value: 'reverse', flex: other(3) });
    });
    for (let i = 0; i < 4; i++) add({ color: 'wild', value: 'wild', flex: 'target2' });
    for (let i = 0; i < 4; i++) add({ color: 'wild', value: 'wild', flex: 'all2' });
    for (let i = 0; i < 2; i++) add({ color: 'wild', value: 'wild4', flex: 'target4' });
    for (let i = 0; i < 6; i++) add({ color: 'wild', value: 'wildAllFlip' });
  }
  return cards;
}
