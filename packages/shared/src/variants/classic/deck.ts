import { COLORS, type Card, type NumberValue } from '../../types.js';

/** One classic 108-card deck. `prefix` keeps ids unique when using several decks. */
export function buildClassicDeck(prefix = 'd0'): Card[] {
  const cards: Card[] = [];
  let n = 0;
  const id = () => `${prefix}-${n++}`;

  for (const color of COLORS) {
    cards.push({ id: id(), color, value: 0 });
    for (let v = 1; v <= 9; v++) {
      for (let copy = 0; copy < 2; copy++) cards.push({ id: id(), color, value: v as NumberValue });
    }
    for (const value of ['skip', 'reverse', 'draw2'] as const) {
      for (let copy = 0; copy < 2; copy++) cards.push({ id: id(), color, value });
    }
  }
  for (let copy = 0; copy < 4; copy++) {
    cards.push({ id: id(), color: 'wild', value: 'wild' });
    cards.push({ id: id(), color: 'wild', value: 'wild4' });
  }
  return cards;
}

export function buildDecks(count: number): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) cards.push(...buildClassicDeck(`d${i}`));
  return cards;
}

export function cardPoints(card: Card): number {
  if (typeof card.value === 'number') return card.value;
  if (card.color === 'wild') return 50;
  return 20;
}
