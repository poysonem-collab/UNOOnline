import type {
  Action,
  ActionResult,
  Card,
  GameState,
  PlayerInfo,
  PlayerView,
  RuleSet,
} from '../types.js';

export type BotDifficulty = 'easy' | 'normal';

/** Every UNO version (classic, Flip, No Mercy, ...) implements this. */
export interface Variant {
  id: string;
  name: string;
  defaultRules: RuleSet;
  /** Rule keys the host can change for this variant. */
  availableRules: (keyof RuleSet)[];
  createGame(players: PlayerInfo[], rules: RuleSet, seed: number): GameState;
  applyAction(state: GameState, seat: number, action: Action): ActionResult;
  startNextRound(state: GameState): ActionResult;
  getPlayerView(state: GameState, seat: number): PlayerView;
  playableCards(state: GameState, seat: number): Card[];
  /** The actions a bot takes on its turn, in order. */
  chooseBotMove(state: GameState, seat: number, difficulty: BotDifficulty, random: () => number): Action[];
}
