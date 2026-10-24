import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOT_CATCH_CHANCE,
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
const BOT_NAMES = ['Ava', 'Ben', 'Cleo', 'Dex', 'Elle', 'Finn', 'Gus', 'Hana', 'Ivy'];

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

  const commit = useCallback((result: ActionResult): string | null => {
    if (!result.ok) return result.error;
    stateRef.current = result.state;
    setState(result.state);
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
    if (state.phase !== 'playing' && state.phase !== 'playDrawn') return;
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
  const playableIds = new Set(
    state.currentPlayer === YOU ? variant.playableCards(state, YOU).map((c) => c.id) : [],
  );

  return {
    /** Changes whenever a new deal starts, so the table can reset its piles. */
    dealKey: `${gameNumber}-${state.round}`,
    view,
    log,
    playableIds,
    act: (action: Action) => act(YOU, action),
    nextRound,
    restart,
  };
}

export type LocalGame = ReturnType<typeof useLocalGame>;
