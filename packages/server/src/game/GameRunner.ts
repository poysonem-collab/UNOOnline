import {
  BOT_CATCH_CHANCE,
  BOT_JUMP_IN_CHANCE,
  BOT_REACTION,
  type Action,
  type BotDifficulty,
  type GameEvent,
  type GameState,
  type GameUpdate,
  type PlayerInfo,
  type RuleSet,
  type Variant,
} from '@uno/shared';

export interface RunnerSeat extends PlayerInfo {
  difficulty: BotDifficulty | null;
}

export interface RunnerOptions {
  /** Pause before a bot moves, in ms: [min, max]. */
  botDelayMs: [number, number];
  /** A disconnected player's turns are played by a bot after this long. */
  takeoverMs: number;
  /** A finished round starts the next one by itself after this long. */
  nextRoundMs: number;
  random: () => number;
}

export const DEFAULT_RUNNER_OPTIONS: RunnerOptions = {
  botDelayMs: [800, 1500],
  takeoverMs: 20_000,
  nextRoundMs: 12_000,
  random: Math.random,
};

/** Delivers an update to one player (if they're connected). */
export type SendUpdate = (playerId: string, update: GameUpdate) => void;

/** Runs one online game: applies moves, plays bots, and enforces timers. */
export class GameRunner {
  private state: GameState;
  private readonly ids: string[];
  private readonly difficulty: (BotDifficulty | null)[];
  /** Seats whose turns a bot plays: the player left, or has been disconnected too long. */
  private readonly autoplay = new Set<number>();
  private readonly takeoverTimers = new Map<number, NodeJS.Timeout>();
  private turnTimer: NodeJS.Timeout | undefined;
  private botTimer: NodeJS.Timeout | undefined;
  private catchTimer: NodeJS.Timeout | undefined;
  private jumpInTimer: NodeJS.Timeout | undefined;
  private nextRoundTimer: NodeJS.Timeout | undefined;
  private turnDeadline: number | null = null;
  private nextRoundAt: number | null = null;
  private disposed = false;

  constructor(
    private readonly variant: Variant,
    seats: RunnerSeat[],
    rules: RuleSet,
    seed: number,
    private readonly send: SendUpdate,
    private readonly options: RunnerOptions = DEFAULT_RUNNER_OPTIONS,
  ) {
    this.ids = seats.map((s) => s.id);
    this.difficulty = seats.map((s) => s.difficulty);
    this.state = variant.createGame(
      seats.map(({ id, name, isBot }) => ({ id, name, isBot })),
      rules,
      seed,
    );
    this.afterChange([], true);
  }

  get phase() {
    return this.state.phase;
  }

  /** A move from a player. Returns an error message, or null on success. */
  apply(playerId: string, action: Action): string | null {
    const seat = this.ids.indexOf(playerId);
    if (seat === -1) return 'You are not in this game';
    const result = this.variant.applyAction(this.state, seat, action);
    if (!result.ok) return result.error;
    this.state = result.state;
    // Drawing a playable card, or calling/catching UNO, doesn't start a new turn.
    const sameTurn =
      action.type === 'callUno' || action.type === 'catchUno' || (action.type === 'draw' && this.state.phase === 'playDrawn');
    this.afterChange(result.events, !sameTurn);
    return null;
  }

  /** Starts the next round (host's button, or automatically). */
  nextRound(): string | null {
    const result = this.variant.startNextRound(this.state);
    if (!result.ok) return result.error;
    this.state = result.state;
    this.afterChange(result.events, true);
    return null;
  }

  /** What one player should see right now. */
  updateFor(playerId: string, events: GameEvent[] = []): GameUpdate | null {
    const seat = this.ids.indexOf(playerId);
    if (seat === -1) return null;
    const now = Date.now();
    return {
      view: this.variant.getPlayerView(this.state, seat),
      events,
      turnEndsInMs: this.turnDeadline === null ? null : Math.max(0, this.turnDeadline - now),
      nextRoundInMs: this.nextRoundAt === null ? null : Math.max(0, this.nextRoundAt - now),
    };
  }

  playerDisconnected(playerId: string): void {
    const seat = this.ids.indexOf(playerId);
    if (seat === -1 || this.autoplay.has(seat)) return;
    clearTimeout(this.takeoverTimers.get(seat));
    this.takeoverTimers.set(
      seat,
      setTimeout(() => {
        this.takeoverTimers.delete(seat);
        this.autoplay.add(seat);
        this.schedule();
      }, this.options.takeoverMs),
    );
  }

  playerReconnected(playerId: string): void {
    const seat = this.ids.indexOf(playerId);
    if (seat === -1 || this.state.players[seat]!.isBot) return;
    clearTimeout(this.takeoverTimers.get(seat));
    this.takeoverTimers.delete(seat);
    if (this.autoplay.delete(seat)) this.schedule();
  }

  /** The player left for good: a bot plays their seat from now on. */
  playerLeft(playerId: string): void {
    const seat = this.ids.indexOf(playerId);
    if (seat === -1) return;
    clearTimeout(this.takeoverTimers.get(seat));
    this.takeoverTimers.delete(seat);
    this.autoplay.add(seat);
    this.difficulty[seat] = 'normal';
    this.state = structuredClone(this.state);
    this.state.players[seat]!.isBot = true;
    this.afterChange([], false);
  }

  dispose(): void {
    this.disposed = true;
    const timers = [this.turnTimer, this.botTimer, this.catchTimer, this.jumpInTimer, this.nextRoundTimer, ...this.takeoverTimers.values()];
    for (const timer of timers) {
      clearTimeout(timer);
    }
    this.takeoverTimers.clear();
  }

  // ---------------------------------------------------------------------------

  private afterChange(events: GameEvent[], newTurn: boolean): void {
    if (this.disposed) return;
    if (newTurn) this.resetTurnTimer();
    this.scheduleRoundEnd();
    this.schedule();
    this.scheduleCatch(events);
    this.scheduleJumpIn();
    this.ids.forEach((id, seat) => {
      if (this.state.players[seat]!.isBot) return;
      const update = this.updateFor(id, events);
      if (update) this.send(id, update);
    });
  }

  private isBotControlled(seat: number): boolean {
    return this.state.players[seat]!.isBot || this.autoplay.has(seat);
  }

  /** Lets a bot take the current turn if the current seat is bot-controlled. */
  private schedule(): void {
    clearTimeout(this.botTimer);
    if (this.disposed || !this.isActive()) return;
    const seat = this.state.currentPlayer;
    if (!this.isBotControlled(seat)) return;

    const [min, max] = this.options.botDelayMs;
    // Leave a longer window when someone forgot UNO, so they can be caught.
    const extra = this.state.unoVulnerable !== null ? max : 0;
    const delay = this.state.phase === 'playDrawn' ? min / 2 : min + this.options.random() * (max - min) + extra;
    const before = this.state;
    this.botTimer = setTimeout(() => {
      if (this.state !== before) return;
      this.playForSeat(seat, this.difficulty[seat] ?? 'normal');
    }, delay);
  }

  private playForSeat(seat: number, difficulty: BotDifficulty): void {
    this.runBotActions(seat, this.variant.chooseBotMove(this.state, seat, difficulty, this.options.random));
  }

  private runBotActions(seat: number, actions: Action[]): void {
    const events: GameEvent[] = [];
    for (const action of actions) {
      const result = this.variant.applyAction(this.state, seat, action);
      if (!result.ok) break;
      this.state = result.state;
      events.push(...result.events);
    }
    // Drawing a playable card keeps the same turn going; anything else moves it on.
    const sameTurn = actions.at(-1)?.type === 'draw' && this.state.phase === 'playDrawn';
    this.afterChange(events, !sameTurn);
  }

  /** With jump-in on, a bot holding an identical card may slap it down out of turn. */
  private scheduleJumpIn(): void {
    clearTimeout(this.jumpInTimer);
    if (!this.state.rules.jumpIn || !this.isActive()) return;
    const random = this.options.random;
    const jumpers = this.ids
      .map((_, seat) => seat)
      .filter((seat) => this.state.players[seat]!.isBot && seat !== this.state.currentPlayer)
      .filter((seat) => random() < BOT_JUMP_IN_CHANCE[this.difficulty[seat] ?? 'normal'])
      .filter((seat) => this.variant.chooseBotJumpIn(this.state, seat, 'normal', random) !== null);
    if (jumpers.length === 0) return;
    const seat = jumpers[Math.floor(random() * jumpers.length)]!;
    const [min, max] = this.options.botDelayMs;
    const before = this.state;
    const level = this.difficulty[seat] ?? 'normal';
    // Reaction time: sometimes faster than the player whose turn it is, sometimes not.
    this.jumpInTimer = setTimeout(() => {
      if (this.state !== before) return;
      const actions = this.variant.chooseBotJumpIn(this.state, seat, level, random);
      if (actions) this.runBotActions(seat, actions);
    }, (min * 0.6 + random() * (max - min)) * BOT_REACTION[level]);
  }

  /** When the turn timer runs out: draw, and keep the card (or pick a color for them). */
  private timeOut(): void {
    if (!this.isActive()) return;
    const seat = this.state.currentPlayer;
    const id = this.ids[seat]!;
    if (this.state.phase === 'chooseColor') {
      this.playForSeat(seat, 'normal');
    } else if (this.state.phase === 'playing') {
      const drew = this.variant.applyAction(this.state, seat, { type: 'draw' });
      if (!drew.ok) return;
      this.state = drew.state;
      const events = [...drew.events];
      if (this.state.phase === 'playDrawn') {
        const passed = this.variant.applyAction(this.state, seat, { type: 'pass' });
        if (passed.ok) {
          this.state = passed.state;
          events.push(...passed.events);
        }
      }
      this.afterChange(events, true);
    } else {
      this.apply(id, { type: 'pass' });
    }
  }

  private resetTurnTimer(): void {
    clearTimeout(this.turnTimer);
    this.turnDeadline = null;
    const seconds = this.state.rules.turnTimerSeconds;
    if (!seconds || !this.isActive() || this.isBotControlled(this.state.currentPlayer)) return;
    this.turnDeadline = Date.now() + seconds * 1000;
    this.turnTimer = setTimeout(() => this.timeOut(), seconds * 1000);
  }

  private scheduleRoundEnd(): void {
    if (this.state.phase !== 'roundOver') {
      clearTimeout(this.nextRoundTimer);
      this.nextRoundAt = null;
      return;
    }
    if (this.nextRoundAt !== null) return;
    this.nextRoundAt = Date.now() + this.options.nextRoundMs;
    this.nextRoundTimer = setTimeout(() => this.nextRound(), this.options.nextRoundMs);
  }

  /** Bots sometimes catch a player who forgot to call UNO. */
  private scheduleCatch(events: GameEvent[]): void {
    const target = this.state.unoVulnerable;
    if (target === null || !events.some((e) => e.type === 'played')) return;
    const catchers = this.ids.map((_, i) => i).filter((i) => i !== target && this.state.players[i]!.isBot);
    if (catchers.length === 0) return;
    const catcher = catchers[Math.floor(this.options.random() * catchers.length)]!;
    const level = this.difficulty[catcher] ?? 'normal';
    if (this.options.random() >= BOT_CATCH_CHANCE[level]) return;
    clearTimeout(this.catchTimer);
    const [min, max] = this.options.botDelayMs;
    // Sharper players notice sooner.
    this.catchTimer = setTimeout(() => {
      if (this.state.unoVulnerable === target) this.apply(this.ids[catcher]!, { type: 'catchUno', target });
    }, (min + max * this.options.random()) * BOT_REACTION[level]);
  }

  private isActive(): boolean {
    return this.state.phase === 'playing' || this.state.phase === 'playDrawn' || this.state.phase === 'chooseColor';
  }
}
