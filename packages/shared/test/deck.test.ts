import { describe, expect, it } from 'vitest';
import { buildClassicDeck, cardPoints, COLORS, VARIANT_CATALOG, VARIANTS } from '../src/index.js';
import { buildDecks } from '../src/variants/classic/deck.js';

describe('classic deck', () => {
  const deck = buildClassicDeck();

  it('has 108 cards with unique ids', () => {
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
  });

  it('has the right cards per color', () => {
    for (const color of COLORS) {
      const cards = deck.filter((c) => c.color === color);
      expect(cards).toHaveLength(25);
      expect(cards.filter((c) => c.value === 0)).toHaveLength(1);
      for (let v = 1; v <= 9; v++) expect(cards.filter((c) => c.value === v)).toHaveLength(2);
      for (const v of ['skip', 'reverse', 'draw2']) {
        expect(cards.filter((c) => c.value === v)).toHaveLength(2);
      }
    }
  });

  it('has 4 wilds and 4 wild draw fours', () => {
    expect(deck.filter((c) => c.value === 'wild')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'wild4')).toHaveLength(4);
  });

  it('keeps ids unique across two decks', () => {
    const two = buildDecks(2);
    expect(two).toHaveLength(216);
    expect(new Set(two.map((c) => c.id)).size).toBe(216);
  });

  it('scores cards correctly', () => {
    expect(cardPoints({ id: 'a', color: 'red', value: 7 })).toBe(7);
    expect(cardPoints({ id: 'a', color: 'red', value: 'skip' })).toBe(20);
    expect(cardPoints({ id: 'a', color: 'wild', value: 'wild4' })).toBe(50);
  });
});

describe('variant catalog', () => {
  it('every unlocked version has a rules engine', () => {
    for (const listing of VARIANT_CATALOG.filter((v) => !v.locked)) {
      expect(VARIANTS[listing.id]).toBeDefined();
    }
  });
});
