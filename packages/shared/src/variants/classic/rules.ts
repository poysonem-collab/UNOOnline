import type { Card, Color, GameState, PlayerView, RuleSet } from '../../types.js';

export function topCard(state: GameState): Card {
  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) throw new Error('Discard pile is empty');
  return top;
}

/** Can `card` go on top of `top` when the active color is `currentColor`? (No pending draws.) */
export function canPlayOn(card: Card, top: Card, currentColor: Color): boolean {
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  return top.color !== 'wild' && card.value === top.value;
}

/** Everything needed to decide whether a card can be played, from either the full state or a player's view. */
export interface PlayContext {
  top: Card;
  currentColor: Color;
  pendingDraw: number;
  rules: RuleSet;
}

/** While draw cards are stacking up, only another draw card can be played on them. */
export function canStackOn(card: Card, ctx: PlayContext): boolean {
  if (!ctx.rules.stackDraws) return false;
  if (ctx.top.value === 'draw2') return card.value === 'draw2' || card.value === 'wild4';
  if (ctx.top.value === 'wild4') {
    return card.value === 'wild4' || (ctx.rules.stackPlus2OnPlus4 && card.value === 'draw2' && card.color === ctx.currentColor);
  }
  return false;
}

/** Can `card` be played on your turn? `handSize` is your hand before playing. */
export function canPlay(card: Card, ctx: PlayContext, handSize: number): boolean {
  if (finishesOnAction(card, ctx.rules, handSize)) return false;
  if (ctx.pendingDraw > 0) return canStackOn(card, ctx);
  return canPlayOn(card, ctx.top, ctx.currentColor);
}

/** Jump-in: playing an identical card (same color and value) out of turn. */
export function canJumpIn(card: Card, ctx: PlayContext, handSize: number): boolean {
  if (!ctx.rules.jumpIn || card.color === 'wild') return false;
  if (card.color !== ctx.top.color || card.value !== ctx.top.value) return false;
  if (finishesOnAction(card, ctx.rules, handSize)) return false;
  return ctx.pendingDraw === 0 || canStackOn(card, ctx);
}

/** With "no finishing on action cards", your last card must be a number. */
export function finishesOnAction(card: Card, rules: RuleSet, handSize: number): boolean {
  return rules.noActionFinish && handSize === 1 && typeof card.value !== 'number';
}

export function contextOf(state: GameState): PlayContext {
  return { top: topCard(state), currentColor: state.currentColor, pendingDraw: state.pendingDraw, rules: state.rules };
}

export function isPlayable(state: GameState, card: Card, handSize = 2): boolean {
  return canPlay(card, contextOf(state), handSize);
}

/** Cards the current player could play right now. */
export function playableCards(state: GameState, seat: number): Card[] {
  const player = state.players[seat];
  if (!player || seat !== state.currentPlayer) return [];
  if (state.phase !== 'playing' && state.phase !== 'playDrawn') return [];
  const ctx = contextOf(state);
  return player.hand.filter(
    (c) => (state.phase !== 'playDrawn' || c.id === state.drawnCardId) && canPlay(c, ctx, player.hand.length),
  );
}

/** Cards `seat` could jump in with right now (never the current player). */
export function jumpInCards(state: GameState, seat: number): Card[] {
  const player = state.players[seat];
  if (!player || seat === state.currentPlayer) return [];
  if (state.phase !== 'playing' && state.phase !== 'playDrawn') return [];
  const ctx = contextOf(state);
  return player.hand.filter((c) => canJumpIn(c, ctx, player.hand.length));
}

/** Ids of the cards you can play right now (including jump-ins), worked out from your own view. */
export function playableIdsFromView(view: PlayerView): Set<string> {
  const active = view.phase === 'playing' || view.phase === 'playDrawn';
  if (!active) return new Set();
  const ctx: PlayContext = { top: view.topCard, currentColor: view.currentColor, pendingDraw: view.pendingDraw, rules: view.rules };
  const size = view.hand.length;
  const cards =
    view.currentPlayer === view.you
      ? view.hand.filter((c) => (view.phase !== 'playDrawn' || c.id === view.drawnCardId) && canPlay(c, ctx, size))
      : view.hand.filter((c) => canJumpIn(c, ctx, size));
  return new Set(cards.map((c) => c.id));
}

/** Seat `steps` places away from `from` in the current direction. */
export function seatAfter(state: GameState, from: number, steps = 1): number {
  const n = state.players.length;
  return (((from + steps * state.direction) % n) + n) % n;
}
