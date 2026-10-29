import type { CardFace, WildFlex } from '../../types.js';

/** What playing a card's flex side does. */
export type FlexSide = 'match' | 'allDraw1' | 'playAgain' | 'reverseSkip' | WildFlex;

export const FLEX_SIDE_INFO: Record<FlexSide, { label: string; short: string }> = {
  match: { label: 'Play it as its flex color (the color in play stays)', short: 'Flex' },
  allDraw1: { label: 'Everyone else draws 1', short: 'All +1' },
  playAgain: { label: 'Take another turn', short: 'Again' },
  reverseSkip: { label: 'Reverse, and skip the next player', short: 'Rev+Skip' },
  target2: { label: 'Pick who draws 2', short: 'Pick +2' },
  all2: { label: 'Everyone else draws 2', short: 'All +2' },
  target4: { label: 'Pick who draws 4', short: 'Pick +4' },
};

/** What `card` does on its flex side, or null if it has none. */
export function flexSide(card: CardFace): FlexSide | null {
  if (!card.flex) return null;
  if (card.color === 'wild') return card.flex as WildFlex;
  switch (card.value) {
    case 'draw2':
      return 'allDraw1';
    case 'skip':
      return 'playAgain';
    case 'reverse':
      return 'reverseSkip';
    default:
      return 'match';
  }
}

/** Flex sides that make you pick a player. */
export function flexNeedsTarget(side: FlexSide | null): boolean {
  return side === 'target2' || side === 'target4';
}
