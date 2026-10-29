import type { Card, CardFace, CardValue, Color, GameState, PlayerView, RuleSet } from '../../types.js';

const DRAW_AMOUNTS: Partial<Record<CardValue, number>> = {
  draw1: 1,
  draw2: 2,
  wild2: 2,
  wild4: 4,
  draw4: 4,
  wildRev4: 4,
  draw5: 5,
  wildRev8: 8,
  wild6: 6,
  wild10: 10,
};

/** How many cards a draw card makes the next player take (0 for other cards). */
export function drawAmount(card: CardFace): number {
  return DRAW_AMOUNTS[card.value] ?? 0;
}

/**
 * Cards that can be played several at a time with "Stack same numbers": numbers, and action cards
 * whose effect can simply happen again (two Skips skip two players, two +2s draw 4...).
 */
const STACKABLE_ACTIONS = new Set<CardValue>([
  'skip', 'reverse', 'skipAll', 'draw1', 'draw2', 'draw4', 'draw5', 'discardAll',
  'wild', 'wild2', 'wild4', 'wild6', 'wild10', 'wildRev4', 'wildRev8',
]);

export function canStackTogether(value: CardValue): boolean {
  return typeof value === 'number' || STACKABLE_ACTIONS.has(value);
}

/** Wild +4 and UNO Flip's Wild Draw Two: only allowed with no card of the current color, and challengeable. */
export function isWildDraw(card: CardFace): boolean {
  return card.value === 'wild4' || card.value === 'wild2';
}

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

/**
 * While draw cards are stacking up, only another draw card can be played on them: one that
 * draws at least as many (+2 on +2, +4 on +2...), or with the extra option, a smaller one
 * in the chosen color (+2 on a +4).
 */
export function canStackOn(card: Card, ctx: PlayContext): boolean {
  if (!ctx.rules.stackDraws) return false;
  const top = drawAmount(ctx.top);
  const mine = drawAmount(card);
  if (!top || !mine) return false;
  return mine >= top || (ctx.rules.stackPlus2OnPlus4 && card.color === ctx.currentColor);
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

/** Seat `steps` places away from `from` in the current direction, skipping players who are out. */
export function seatAfter(state: GameState, from: number, steps = 1): number {
  const n = state.players.length;
  const step = (steps < 0 ? -1 : 1) * state.direction;
  let seat = from;
  for (let moved = 0; moved < Math.abs(steps); moved++) {
    for (let tries = 0; tries < n; tries++) {
      seat = (((seat + step) % n) + n) % n;
      if (!state.out[seat]) break;
    }
  }
  return seat;
}

/** Players still in the round (No Mercy knocks players out). */
export function activeSeats(state: GameState): number[] {
  return state.players.map((_, i) => i).filter((i) => !state.out[i]);
}
