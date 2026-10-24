export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ActionValue = 'skip' | 'reverse' | 'draw2';
export type WildValue = 'wild' | 'wild4';
export type CardValue = NumberValue | ActionValue | WildValue;

export type Card =
  | { id: string; color: Color; value: NumberValue | ActionValue }
  | { id: string; color: 'wild'; value: WildValue };

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
  dealer: number;
  roundWinner: number | null;
  gameWinner: number | null;
  scores: number[];
  round: number;
  /** Seeded RNG state so games are reproducible. */
  rng: number;
}

export type Action =
  | { type: 'play'; cardIds: string[]; color?: Color }
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'callUno' }
  | { type: 'catchUno'; target: number };

export type GameEvent =
  | { type: 'played'; seat: number; cards: Card[]; color: Color }
  | { type: 'drew'; seat: number; count: number }
  | { type: 'passed'; seat: number }
  | { type: 'skipped'; seat: number }
  | { type: 'reversed'; direction: 1 | -1 }
  | { type: 'reshuffled' }
  | { type: 'calledUno'; seat: number }
  | { type: 'caughtUno'; by: number; target: number }
  | { type: 'roundOver'; winner: number; points: number }
  | { type: 'gameOver'; winner: number };

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };

/** What one player is allowed to see. */
export interface PlayerView {
  you: number;
  hand: Card[];
  players: (PlayerInfo & { handCount: number; calledUno: boolean })[];
  topCard: Card;
  currentColor: Color;
  currentPlayer: number;
  direction: 1 | -1;
  phase: Phase;
  drawPileCount: number;
  drawnCardId: string | null;
  unoVulnerable: number | null;
  roundWinner: number | null;
  gameWinner: number | null;
  scores: number[];
  round: number;
  rules: RuleSet;
}
