import { shuffle } from '../../rng.js';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Action,
  type ActionResult,
  type Card,
  type Color,
  type GameEvent,
  type GameState,
  type PlayerInfo,
  type PlayerView,
  type RuleSet,
} from '../../types.js';
import { buildDecks, cardPoints } from './deck.js';
import { canJumpIn, canPlay, contextOf, isPlayable, seatAfter, topCard } from './rules.js';

const DECK_SIZE = 108;
const POINTS_TO_WIN = 500;
/** Extra cards a failed +4 challenge costs the challenger. */
const CHALLENGE_PENALTY = 2;

export function createGame(players: PlayerInfo[], rules: RuleSet, seed: number): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Need ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  if (players.length * rules.handSize >= rules.deckCount * DECK_SIZE - 10) {
    throw new Error('Not enough cards for this hand size; use more decks');
  }
  const state: GameState = {
    variantId: 'classic',
    rules,
    players: players.map((p) => ({ ...p, hand: [], calledUno: false })),
    drawPile: [],
    discardPile: [],
    currentColor: 'red',
    currentPlayer: 0,
    direction: 1,
    phase: 'playing',
    drawnCardId: null,
    unoVulnerable: null,
    pendingDraw: 0,
    wild4Check: null,
    dealer: 0,
    roundWinner: null,
    gameWinner: null,
    scores: players.map(() => 0),
    round: 1,
    history: [],
    rng: seed >>> 0,
  };
  dealRound(state, []);
  return state;
}

/** After 'roundOver', deal the next round with the dealer moving one seat on. */
export function startNextRound(prev: GameState): ActionResult {
  if (prev.phase !== 'roundOver') return fail('The round is not over');
  const state = structuredClone(prev);
  state.dealer = (state.dealer + 1) % state.players.length;
  state.round++;
  const events: GameEvent[] = [];
  dealRound(state, events);
  return { ok: true, state, events };
}

export function applyAction(prev: GameState, seat: number, action: Action): ActionResult {
  if (!prev.players[seat]) return fail('No such seat');
  if (prev.phase === 'roundOver' || prev.phase === 'gameOver') return fail('The round is over');

  const state = structuredClone(prev);
  const events: GameEvent[] = [];
  const error = dispatch(state, seat, action, events);
  return error ? fail(error) : { ok: true, state, events };
}

export function getPlayerView(state: GameState, seat: number): PlayerView {
  return {
    you: seat,
    hand: state.players[seat]?.hand ?? [],
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      handCount: p.hand.length,
      calledUno: p.calledUno,
    })),
    topCard: topCard(state),
    currentColor: state.currentColor,
    currentPlayer: state.currentPlayer,
    direction: state.direction,
    phase: state.phase,
    drawPileCount: state.drawPile.length,
    drawnCardId: state.currentPlayer === seat ? state.drawnCardId : null,
    unoVulnerable: state.unoVulnerable,
    pendingDraw: state.pendingDraw,
    canChallenge: canChallenge(state),
    roundWinner: state.roundWinner,
    gameWinner: state.gameWinner,
    scores: state.scores,
    round: state.round,
    history: state.history,
    revealedHands: state.phase === 'roundOver' || state.phase === 'gameOver' ? state.players.map((p) => p.hand) : null,
    rules: state.rules,
  };
}

/** The current player can challenge the Wild +4 waiting on them. */
export function canChallenge(state: GameState): boolean {
  return state.rules.challengeWild4 && state.pendingDraw > 0 && state.wild4Check !== null;
}

// ---------------------------------------------------------------------------

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Mutates `state`. Returns an error message, or null on success. */
function dispatch(state: GameState, seat: number, action: Action, events: GameEvent[]): string | null {
  switch (action.type) {
    case 'play':
      return play(state, seat, action, events);
    case 'draw':
      return draw(state, seat, events);
    case 'pass':
      return pass(state, seat, events);
    case 'callUno':
      return callUno(state, seat, events);
    case 'catchUno':
      return catchUno(state, seat, action.target, events);
    case 'challenge':
      return challenge(state, seat, events);
  }
}

function play(
  state: GameState,
  seat: number,
  { cardIds, color: chosenColor, swapWith }: { cardIds: string[]; color?: Color; swapWith?: number },
  events: GameEvent[],
): string | null {
  const { rules } = state;
  const player = state.players[seat]!;
  const jumpingIn = seat !== state.currentPlayer;
  if (jumpingIn && !rules.jumpIn) return 'It is not your turn';

  // Every card must be in your hand, once.
  if (cardIds.length === 0) return 'Choose a card to play';
  if (new Set(cardIds).size !== cardIds.length) return 'You chose the same card twice';
  const cards: Card[] = [];
  for (const id of cardIds) {
    const card = player.hand.find((c) => c.id === id);
    if (!card) return 'You do not have that card';
    cards.push(card);
  }
  const first = cards[0]!;
  const last = cards[cards.length - 1]!;

  // Several cards at once: all the same number.
  if (cards.length > 1) {
    if (!rules.stackSameNumber) return 'Play one card at a time';
    if (typeof first.value !== 'number' || cards.some((c) => c.value !== first.value)) {
      return 'You can only play several cards if they are the same number';
    }
  }

  const ctx = contextOf(state);
  const handAfter = player.hand.length - cards.length;
  if (jumpingIn) {
    if (!canJumpIn(first, ctx, player.hand.length - cards.length + 1)) {
      return 'You can only jump in with a card identical to the top card';
    }
  } else {
    if (state.phase === 'playDrawn' && first.id !== state.drawnCardId) {
      return 'After drawing you may only play the drawn card';
    }
    if (!canPlay(first, ctx, handAfter + 1)) {
      if (state.pendingDraw > 0) return `Stack a draw card or take ${state.pendingDraw} cards`;
      if (handAfter === 0 && rules.noActionFinish) return 'Your last card has to be a number card';
      return 'That card cannot be played';
    }
  }
  if (handAfter === 0 && rules.noActionFinish && typeof last.value !== 'number') {
    return 'Your last card has to be a number card';
  }
  if (last.color === 'wild' && !chosenColor) return 'Choose a color for the wild card';

  const swaps = rules.sevenZero && last.value === 7 && handAfter > 0;
  if (swaps) {
    if (swapWith === undefined || swapWith === seat || !state.players[swapWith]) {
      return 'Choose a player to swap hands with';
    }
  }

  // A +4 is only allowed with no card of the current color (checked if it can be challenged).
  const wild4Illegal =
    last.value === 'wild4' && player.hand.some((c) => !cards.includes(c) && c.color === state.currentColor);

  // The play is legal: carry it out.
  state.unoVulnerable = null;
  player.hand = player.hand.filter((c) => !cards.includes(c));
  state.discardPile.push(...cards);
  state.currentColor = last.color === 'wild' ? chosenColor! : last.color;
  state.phase = 'playing';
  state.drawnCardId = null;
  if (jumpingIn) {
    state.currentPlayer = seat;
    events.push({ type: 'jumpedIn', seat });
  }
  events.push({ type: 'played', seat, cards, color: state.currentColor });

  // An UNO call only counts for the play that brings you down to one card.
  if (player.hand.length > 1) player.calledUno = false;
  const handsMoved = applyEffect(state, seat, last, { swapWith, wild4Illegal }, events);
  if (!handsMoved && player.hand.length === 1 && !player.calledUno) state.unoVulnerable = seat;
  if (player.hand.length === 0) endRound(state, seat, events);
  return null;
}

/**
 * Applies the played card's effect and moves the turn on.
 * Returns true if hands changed owners (7-0), which resets UNO calls.
 */
function applyEffect(
  state: GameState,
  seat: number,
  card: Card,
  extra: { swapWith?: number; wild4Illegal: boolean },
  events: GameEvent[],
): boolean {
  const { rules } = state;
  const next = seatAfter(state, seat);
  const player = state.players[seat]!;

  switch (card.value) {
    case 'skip':
      events.push({ type: 'skipped', seat: next });
      state.currentPlayer = seatAfter(state, seat, 2);
      return false;

    case 'reverse':
      state.direction = state.direction === 1 ? -1 : 1;
      events.push({ type: 'reversed', direction: state.direction });
      if (state.players.length === 2) {
        // With two players a reverse acts as a skip: the same player goes again.
        events.push({ type: 'skipped', seat: next });
        state.currentPlayer = seat;
      } else {
        state.currentPlayer = seatAfter(state, seat);
      }
      return false;

    case 'draw2':
    case 'wild4': {
      const amount = card.value === 'draw2' ? 2 : 4;
      const responds = rules.stackDraws || (card.value === 'wild4' && rules.challengeWild4);
      if (responds) {
        // The next player can stack, challenge, or take the cards.
        state.pendingDraw += amount;
        state.wild4Check = card.value === 'wild4' ? { seat, illegal: extra.wild4Illegal } : null;
        state.currentPlayer = next;
        events.push({ type: 'drawStacked', total: state.pendingDraw, next });
      } else {
        drawCards(state, next, amount, events);
        events.push({ type: 'skipped', seat: next });
        state.currentPlayer = seatAfter(state, seat, 2);
      }
      return false;
    }

    case 7:
      state.currentPlayer = next;
      if (!rules.sevenZero || player.hand.length === 0 || extra.swapWith === undefined) return false;
      swapHands(state, seat, extra.swapWith);
      events.push({ type: 'swapped', seat, with: extra.swapWith });
      return true;

    case 0:
      state.currentPlayer = next;
      if (!rules.sevenZero || player.hand.length === 0) return false;
      rotateHands(state);
      events.push({ type: 'rotated', direction: state.direction });
      return true;

    default:
      state.currentPlayer = next;
      return false;
  }
}

function swapHands(state: GameState, a: number, b: number): void {
  const pa = state.players[a]!;
  const pb = state.players[b]!;
  [pa.hand, pb.hand] = [pb.hand, pa.hand];
  pa.calledUno = false;
  pb.calledUno = false;
}

/** Every hand moves one seat along in the direction of play. */
function rotateHands(state: GameState): void {
  const hands = state.players.map((p) => p.hand);
  state.players.forEach((p, i) => {
    p.hand = hands[seatAfter(state, i, -1)]!;
    p.calledUno = false;
  });
}

function draw(state: GameState, seat: number, events: GameEvent[]): string | null {
  if (seat !== state.currentPlayer) return 'It is not your turn';
  if (state.phase !== 'playing') return 'You already drew this turn';
  state.unoVulnerable = null;

  // Taking the stacked penalty ends your turn.
  if (state.pendingDraw > 0) {
    drawCards(state, seat, state.pendingDraw, events);
    state.pendingDraw = 0;
    state.wild4Check = null;
    events.push({ type: 'skipped', seat });
    state.currentPlayer = seatAfter(state, seat);
    return null;
  }

  const drawn = state.rules.drawUntilPlayable
    ? drawUntil(state, seat, (c) => isPlayable(state, c), events)
    : drawCards(state, seat, 1, events);
  const card = drawn[drawn.length - 1];
  if (card && isPlayable(state, card)) {
    state.phase = 'playDrawn';
    state.drawnCardId = card.id;
  } else {
    state.currentPlayer = seatAfter(state, seat);
  }
  return null;
}

function pass(state: GameState, seat: number, events: GameEvent[]): string | null {
  if (seat !== state.currentPlayer) return 'It is not your turn';
  if (state.phase !== 'playDrawn') return 'You must play or draw first';
  state.phase = 'playing';
  state.drawnCardId = null;
  state.currentPlayer = seatAfter(state, seat);
  events.push({ type: 'passed', seat });
  return null;
}

function challenge(state: GameState, seat: number, events: GameEvent[]): string | null {
  if (seat !== state.currentPlayer) return 'It is not your turn';
  if (!canChallenge(state)) return 'There is no Wild +4 to challenge';
  const { seat: target, illegal } = state.wild4Check!;
  const penalty = state.pendingDraw;
  state.pendingDraw = 0;
  state.wild4Check = null;
  state.unoVulnerable = null;
  events.push({ type: 'challenged', by: seat, target, success: illegal });

  if (illegal) {
    // Caught: the +4 player takes the cards, and the challenger plays normally.
    drawCards(state, target, penalty, events);
  } else {
    drawCards(state, seat, penalty + CHALLENGE_PENALTY, events);
    events.push({ type: 'skipped', seat });
    state.currentPlayer = seatAfter(state, seat);
  }
  return null;
}

function callUno(state: GameState, seat: number, events: GameEvent[]): string | null {
  const player = state.players[seat]!;
  // Playing several cards at once can take you from many cards straight to one.
  if (player.hand.length > 2 && !state.rules.stackSameNumber) return 'You can only call UNO with two cards or fewer';
  player.calledUno = true;
  if (state.unoVulnerable === seat) state.unoVulnerable = null;
  events.push({ type: 'calledUno', seat });
  return null;
}

function catchUno(state: GameState, seat: number, target: number, events: GameEvent[]): string | null {
  if (target === seat) return 'You cannot catch yourself';
  if (state.unoVulnerable !== target) return 'That player cannot be caught';
  state.unoVulnerable = null;
  drawCards(state, target, 2, events);
  events.push({ type: 'caughtUno', by: seat, target });
  return null;
}

/** Takes one card from the draw pile, reshuffling the discard pile when needed. */
function takeCard(state: GameState, events: GameEvent[]): Card | undefined {
  if (state.drawPile.length === 0) reshuffle(state, events);
  return state.drawPile.pop();
}

/** Draws up to `count` cards. */
function drawCards(state: GameState, seat: number, count: number, events: GameEvent[]): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    const card = takeCard(state, events);
    if (!card) break;
    drawn.push(card);
  }
  giveCards(state, seat, drawn, events);
  return drawn;
}

/** Draws until a card matches `stop` (or the cards run out). */
function drawUntil(state: GameState, seat: number, stop: (card: Card) => boolean, events: GameEvent[]): Card[] {
  const drawn: Card[] = [];
  for (;;) {
    const card = takeCard(state, events);
    if (!card) break;
    drawn.push(card);
    if (stop(card)) break;
  }
  giveCards(state, seat, drawn, events);
  return drawn;
}

function giveCards(state: GameState, seat: number, cards: Card[], events: GameEvent[]): void {
  if (cards.length === 0) return;
  const player = state.players[seat]!;
  player.hand.push(...cards);
  player.calledUno = false;
  events.push({ type: 'drew', seat, count: cards.length });
}

function reshuffle(state: GameState, events: GameEvent[]): void {
  if (state.discardPile.length <= 1) return;
  const top = state.discardPile.pop()!;
  state.drawPile = state.discardPile;
  state.discardPile = [top];
  state.rng = shuffle(state.drawPile, state.rng);
  events.push({ type: 'reshuffled' });
}

function endRound(state: GameState, winner: number, events: GameEvent[]): void {
  // Going out on a draw card still makes the next player draw (it counts for scoring).
  if (state.pendingDraw > 0) {
    drawCards(state, state.currentPlayer, state.pendingDraw, events);
    state.pendingDraw = 0;
    state.wild4Check = null;
  }
  const points = state.players.reduce(
    (sum, p) => sum + p.hand.reduce((s, c) => s + cardPoints(c), 0),
    0,
  );
  state.scores[winner]! += points;
  state.history.push({ round: state.round, winner, points });
  state.roundWinner = winner;
  state.unoVulnerable = null;
  events.push({ type: 'roundOver', winner, points });

  const gameWon = state.rules.winCondition === 'firstOut' || state.scores[winner]! >= POINTS_TO_WIN;
  if (gameWon) {
    state.phase = 'gameOver';
    state.gameWinner = winner;
    events.push({ type: 'gameOver', winner });
  } else {
    state.phase = 'roundOver';
  }
}

/** Shuffles a fresh deck, deals, and flips the starting card. */
function dealRound(state: GameState, events: GameEvent[]): void {
  const deck = buildDecks(state.rules.deckCount);
  state.rng = shuffle(deck, state.rng);
  state.drawPile = deck;
  state.discardPile = [];
  state.direction = 1;
  state.phase = 'playing';
  state.drawnCardId = null;
  state.unoVulnerable = null;
  state.pendingDraw = 0;
  state.wild4Check = null;
  state.roundWinner = null;
  for (const p of state.players) {
    p.hand = [];
    p.calledUno = false;
  }

  for (let round = 0; round < state.rules.handSize; round++) {
    for (let i = 1; i <= state.players.length; i++) {
      state.players[(state.dealer + i) % state.players.length]!.hand.push(state.drawPile.pop()!);
    }
  }

  // Wild cards can't start the round: put them back and reshuffle.
  let start = state.drawPile.pop()!;
  while (start.color === 'wild') {
    state.drawPile.unshift(start);
    state.rng = shuffle(state.drawPile, state.rng);
    start = state.drawPile.pop()!;
  }
  state.discardPile.push(start);
  state.currentColor = start.color;

  // The starting card acts as if the dealer had played it (7-0 swaps don't apply).
  const first = seatAfter(state, state.dealer);
  switch (start.value) {
    case 'skip':
      events.push({ type: 'skipped', seat: first });
      state.currentPlayer = seatAfter(state, state.dealer, 2);
      break;
    case 'reverse':
      state.direction = -1;
      events.push({ type: 'reversed', direction: -1 });
      state.currentPlayer = state.dealer;
      break;
    case 'draw2':
      drawCards(state, first, 2, events);
      events.push({ type: 'skipped', seat: first });
      state.currentPlayer = seatAfter(state, state.dealer, 2);
      break;
    default:
      state.currentPlayer = first;
  }
}
