import type { Card, Color, GameState } from '../../types.js';

export function topCard(state: GameState): Card {
  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) throw new Error('Discard pile is empty');
  return top;
}

/** Can `card` go on top of `top` when the active color is `currentColor`? */
export function canPlayOn(card: Card, top: Card, currentColor: Color): boolean {
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  return top.color !== 'wild' && card.value === top.value;
}

export function isPlayable(state: GameState, card: Card): boolean {
  return canPlayOn(card, topCard(state), state.currentColor);
}

/** Cards in `seat`'s hand they could legally play right now (ignores whose turn it is). */
export function playableCards(state: GameState, seat: number): Card[] {
  const player = state.players[seat];
  if (!player) return [];
  if (state.phase === 'playDrawn') {
    return player.hand.filter((c) => c.id === state.drawnCardId && isPlayable(state, c));
  }
  return player.hand.filter((c) => isPlayable(state, c));
}

/** Seat `steps` places away from `from` in the current direction. */
export function seatAfter(state: GameState, from: number, steps = 1): number {
  const n = state.players.length;
  return (((from + steps * state.direction) % n) + n) % n;
}
