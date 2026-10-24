import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOT_CATCH_CHANCE,
  BOT_JUMP_IN_CHANCE,
  playableIdsFromView,
  BOT_NAMES,
  describeEvent,
  getVariant,
  randomSeed,
  type Action,
  type ActionResult,
  type BotDifficulty,
  type GameState,
  type PlayerView,
  type RuleSet,
} from '@uno/shared';
import type { EventBatch } from '../effects/eventEffects';

export interface LocalGameConfig {
  variantId: string;
  playerName: string;
  botCount: number;
  difficulty: BotDifficulty;
  rules: RuleSet;
}

export interface LogEntry {
  id: number;
  text: string;
}

/** The human always sits in seat 0. */
const YOU = 0;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function newGame(config: LocalGameConfig): GameState {
  const players = [
    { id: 'you', name: config.playerName || 'You', isBot: false },
    ...BOT_NAMES.slice(0, config.botCount).map((name, i) => ({ id: `bot${i}`, name, isBot: true })),
  ];
  return getVariant(config.variantId).createGame(players, config.rules, randomSeed());
}

/** Runs a game against bots entirely in the browser. */
export function useLocalGame(config: LocalGameConfig) {
  const variant = getVariant(config.variantId);
  const [state, setState] = useState(() => newGame(config));
  const stateRef = useRef(state);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);
  const [events, setEvents] = useState<EventBatch | null>(null);

  const commit = useCallback((result: ActionResult): string | null => {
    if (!result.ok) return result.error;
    stateRef.current = result.state;
    setState(result.state);
    setEvents((prev) => ({ seq: (prev?.seq ?? 0) + 1, events: result.events, at: Date.now() }));
    const lines = result.events
      .map((e) => describeEvent(e, result.state.players, YOU))
      .filter((t): t is string => t !== null)
      .map((text) => ({ id: logId.current++, text }));
    if (lines.length) setLog((prev) => [...prev, ...lines].slice(-30));
    return null;
  }, []);

  const act = useCallback(
    (seat: number, action: Action) => commit(variant.applyAction(stateRef.current, seat, action)),
    [commit, variant],
  );

  // Bots take their turns after a short pause so humans can follow.
  useEffect(() => {
    if (state.phase !== 'playing' && state.phase !== 'playDrawn' && state.phase !== 'chooseColor') return;
    const seat = state.currentPlayer;
    if (!state.players[seat]!.isBot) return;
    // Leave a longer window when someone forgot UNO, so they can be caught.
    const delay =
      state.phase === 'playDrawn' ? randomBetween(500, 800)
      : state.unoVulnerable !== null ? randomBetween(1800, 2400)
      : randomBetween(800, 1500);
    const timer = setTimeout(() => {
      if (stateRef.current !== state) return;
      for (const action of variant.chooseBotMove(state, seat, config.difficulty, Math.random)) {
        if (act(seat, action)) break;
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [state, act, variant, config.difficulty]);

  // Bots sometimes catch a player who forgot to call UNO.
  useEffect(() => {
    const target = state.unoVulnerable;
    if (target === null) return;
    const players = stateRef.current.players;
    const catchers = players.map((_, i) => i).filter((i) => i !== target && players[i]!.isBot);
    if (catchers.length === 0 || Math.random() >= BOT_CATCH_CHANCE[config.difficulty]) return;
    const catcher = catchers[Math.floor(Math.random() * catchers.length)]!;
    const timer = setTimeout(() => {
      if (stateRef.current.unoVulnerable === target) act(catcher, { type: 'catchUno', target });
    }, randomBetween(1000, 1700));
    return () => clearTimeout(timer);
  }, [state.unoVulnerable, act, config.difficulty]);

  // With jump-in on, a bot holding an identical card may play it out of turn.
  useEffect(() => {
    if (!state.rules.jumpIn || (state.phase !== 'playing' && state.phase !== 'playDrawn')) return;
    const jumpers = state.players
      .map((_, seat) => seat)
      .filter((seat) => state.players[seat]!.isBot && seat !== state.currentPlayer)
      .filter((seat) => Math.random() < BOT_JUMP_IN_CHANCE[config.difficulty])
      .filter((seat) => variant.chooseBotJumpIn(state, seat, config.difficulty, Math.random) !== null);
    if (jumpers.length === 0) return;
    const seat = jumpers[Math.floor(Math.random() * jumpers.length)]!;
    const timer = setTimeout(() => {
      if (stateRef.current !== state) return;
      for (const action of variant.chooseBotJumpIn(state, seat, config.difficulty, Math.random) ?? []) {
        if (act(seat, action)) break;
      }
    }, randomBetween(500, 1300));
    return () => clearTimeout(timer);
  }, [state, act, variant, config.difficulty]);

  const nextRound = useCallback(() => commit(variant.startNextRound(stateRef.current)), [commit, variant]);

  const [gameNumber, setGameNumber] = useState(1);
  const restart = useCallback(() => {
    const fresh = newGame(config);
    stateRef.current = fresh;
    setState(fresh);
    setLog([]);
    setGameNumber((n) => n + 1);
  }, [config]);

  const view: PlayerView = variant.getPlayerView(state, YOU);
  const playableIds = playableIdsFromView(view);

  return {
    /** Changes whenever a new deal starts, so the table can reset its piles. */
    dealKey: `${gameNumber}-${state.round}`,
    view,
    log,
    events,
    playableIds,
    act: (action: Action) => act(YOU, action),
    nextRound,
    restart,
  };
}

export type LocalGame = ReturnType<typeof useLocalGame>;
