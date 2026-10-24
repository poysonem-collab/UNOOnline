import type { Card, Color, GameState, PlayerView } from '../../types.js';

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

/** Ids of the cards you can play right now, worked out from your own view of the game. */
export function playableIdsFromView(view: PlayerView): Set<string> {
  const active = view.phase === 'playing' || view.phase === 'playDrawn';
  if (!active || view.currentPlayer !== view.you) return new Set();
  return new Set(
    view.hand
      .filter((c) => (view.phase !== 'playDrawn' || c.id === view.drawnCardId) && canPlayOn(c, view.topCard, view.currentColor))
      .map((c) => c.id),
  );
}

/** Seat `steps` places away from `from` in the current direction. */
export function seatAfter(state: GameState, from: number, steps = 1): number {
  const n = state.players.length;
  return (((from + steps * state.direction) % n) + n) % n;
}
