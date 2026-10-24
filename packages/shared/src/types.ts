/** Classic colors, also UNO Flip's light side. */
export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
/** UNO Flip's dark side. */
export const DARK_COLORS = ['pink', 'teal', 'orange', 'purple'] as const;
export const ALL_COLORS = [...COLORS, ...DARK_COLORS] as const;
export type Color = (typeof ALL_COLORS)[number];

export type Side = 'light' | 'dark';

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ActionValue =
  | 'skip'
  | 'reverse'
  | 'draw2'
  // UNO Flip
  | 'draw1'
  | 'draw5'
  | 'flip'
  | 'skipAll';
export type WildValue =
  | 'wild'
  | 'wild4'
  // UNO Flip
  | 'wild2'
  | 'wildColor';
export type CardValue = NumberValue | ActionValue | WildValue;

/** One printed face of a card. `dark` marks UNO Flip's dark side (it changes how wilds look). */
export type CardFace = (
  | { color: Color; value: NumberValue | ActionValue }
  | { color: 'wild'; value: WildValue }
) & { dark?: boolean };

/**
 * A card, showing its face in play. UNO Flip cards also carry `other`: the face on
 * the back, which everyone except the holder can see. Flipping swaps the two.
 */
export type Card = CardFace & { id: string; other?: CardFace };

export function colorsForSide(side: Side | null | undefined): readonly Color[] {
  return side === 'dark' ? DARK_COLORS : COLORS;
}

export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;

/** Settings the lobby host controls. */
export interface RuleSet {
  /** Answer a +2/+4 with another draw card to pass on the total. */
  stackDraws: boolean;
  /** With stackDraws: allow a +2 on top of a +4. */
  stackPlus2OnPlus4: boolean;
  /** Play several cards of the same number in one turn. */
  stackSameNumber: boolean;
  /** 7 swaps hands with a chosen player, 0 rotates all hands. */
  sevenZero: boolean;
  /** Play an identical card out of turn. */
  jumpIn: boolean;
  /** Keep drawing until a playable card turns up. */
  drawUntilPlayable: boolean;
  /** A Wild +4 may only be played with no card of the current color, and the next player can challenge it. */
  challengeWild4: boolean;
  /** Your last card must be a number card. */
  noActionFinish: boolean;
  handSize: number;
  turnTimerSeconds: 0 | 15 | 30 | 60;
  deckCount: 1 | 2;
  winCondition: 'firstOut' | 'points500';
}

export const DEFAULT_RULES: RuleSet = {
  stackDraws: false,
  stackPlus2OnPlus4: false,
  stackSameNumber: false,
  sevenZero: false,
  jumpIn: false,
  drawUntilPlayable: false,
  challengeWild4: false,
  noActionFinish: false,
  handSize: 7,
  turnTimerSeconds: 0,
  deckCount: 1,
  winCondition: 'firstOut',
};

export interface PlayerInfo {
  id: string;
  name: string;
  isBot: boolean;
}

export interface PlayerState extends PlayerInfo {
  hand: Card[];
  /** Has pressed UNO for their current low hand. */
  calledUno: boolean;
}

export type Phase =
  /** Current player must play or draw. */
  | 'playing'
  /** Current player drew a playable card and may play it or pass. */
  | 'playDrawn'
  /** UNO Flip: a flip turned up a wild, so the player who flipped picks the color. */
  | 'chooseColor'
  /** Someone went out; scores are updated. */
  | 'roundOver'
  /** A player has won the whole game. */
  | 'gameOver';

export interface GameState {
  variantId: string;
  rules: RuleSet;
  players: PlayerState[];
  drawPile: Card[];
  /** Last element is the top card. */
  discardPile: Card[];
  /** Active color; differs from the top card when a wild was played. */
  currentColor: Color;
  currentPlayer: number;
  direction: 1 | -1;
  phase: Phase;
  /** Id of the card drawn this turn while in 'playDrawn'. */
  drawnCardId: string | null;
  /** Seat that has one card without having called UNO and can be caught. */
  unoVulnerable: number | null;
  /**
   * Cards the current player must take unless they stack another draw card (or challenge a +4).
   * Only used when stacking or the +4 challenge is on; otherwise draw cards take effect at once.
   */
  pendingDraw: number;
  /** The last Wild +4, while it can still be challenged: who played it and whether it broke the rule. */
  wild4Check: { seat: number; illegal: boolean } | null;
  dealer: number;
  roundWinner: number | null;
  gameWinner: number | null;
  scores: number[];
  round: number;
  /** Who won each finished round, and for how many points. */
  history: RoundResult[];
  /** UNO Flip: which side of the cards is in play. */
  side?: Side;
  /** Seeded RNG state so games are reproducible. */
  rng: number;
}

export interface RoundResult {
  round: number;
  winner: number;
  points: number;
}

export type Action =
  /** With several cards (same-number stacking) the first must be playable; the last decides the color. */
  | { type: 'play'; cardIds: string[]; color?: Color; swapWith?: number }
  /** Takes one card, or the pending penalty when one is waiting. */
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'callUno' }
  | { type: 'catchUno'; target: number }
  /** Challenge the Wild +4 (or Wild Draw Two) just played on you. */
  | { type: 'challenge' }
  /** UNO Flip: pick the color after a flip turns up a wild. */
  | { type: 'chooseColor'; color: Color };

export type GameEvent =
  | { type: 'played'; seat: number; cards: Card[]; color: Color }
  | { type: 'drew'; seat: number; count: number }
  | { type: 'passed'; seat: number }
  | { type: 'skipped'; seat: number }
  | { type: 'reversed'; direction: 1 | -1 }
  | { type: 'reshuffled' }
  | { type: 'calledUno'; seat: number }
  | { type: 'caughtUno'; by: number; target: number }
  | { type: 'jumpedIn'; seat: number }
  | { type: 'drawStacked'; total: number; next: number }
  | { type: 'swapped'; seat: number; with: number }
  | { type: 'rotated'; direction: 1 | -1 }
  | { type: 'challenged'; by: number; target: number; success: boolean }
  | { type: 'flipped'; seat: number; side: Side }
  | { type: 'colorChosen'; seat: number; color: Color }
  | { type: 'skippedEveryone'; seat: number }
  | { type: 'roundOver'; winner: number; points: number }
  | { type: 'gameOver'; winner: number };

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };

/** What one player is allowed to see. */
export interface PlayerView {
  you: number;
  hand: Card[];
  players: (PlayerInfo & {
    handCount: number;
    calledUno: boolean;
    /** UNO Flip: the backs of this player's cards, which you can see (not for your own hand). */
    otherSides?: CardFace[];
  })[];
  topCard: Card;
  /** UNO Flip: which side is in play (null in games without sides). */
  side: Side | null;
  /** UNO Flip: the visible back of the top card of the draw pile. */
  drawPileOther: CardFace | null;
  currentColor: Color;
  currentPlayer: number;
  direction: 1 | -1;
  phase: Phase;
  drawPileCount: number;
  drawnCardId: string | null;
  unoVulnerable: number | null;
  pendingDraw: number;
  /** The current player may challenge the Wild +4 just played. */
  canChallenge: boolean;
  roundWinner: number | null;
  gameWinner: number | null;
  scores: number[];
  round: number;
  history: RoundResult[];
  /** Everyone's leftover cards, shown once a round is over. */
  revealedHands: Card[][] | null;
  rules: RuleSet;
}
