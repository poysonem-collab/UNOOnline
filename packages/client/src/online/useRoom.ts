import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeEvent,
  type Action,
  type BotDifficulty,
  type GameUpdate,
  type JoinedRoom,
  type KickReason,
  type LobbyState,
  type RuleSet,
} from '@uno/shared';
import type { EventBatch } from '../effects/eventEffects';
import type { LogEntry } from '../local/useLocalGame';
import { api, getSocket } from '../net/socket';
import { clearSession, loadSession, saveSession } from '../net/session';

const KICK_MESSAGES: Record<KickReason, string> = {
  removed: 'The host removed you from the room.',
  replaced: 'You opened this room in another tab or device.',
};

/** The game as this player sees it, with server countdowns turned into local clock times. */
export interface OnlineGame {
  update: GameUpdate;
  turnEndsAt: number | null;
  nextRoundAt: number | null;
}

function toOnlineGame(update: GameUpdate): OnlineGame {
  const now = Date.now();
  return {
    update,
    turnEndsAt: update.turnEndsInMs === null ? null : now + update.turnEndsInMs,
    nextRoundAt: update.nextRoundInMs === null ? null : now + update.nextRoundInMs,
  };
}

/** Live state of the room you're in (lobby and game), kept in sync with the server. */
export function useRoom(joined: JoinedRoom) {
  const { code, playerId } = joined;
  const [lobby, setLobby] = useState<LobbyState>(joined.lobby);
  const [game, setGame] = useState<OnlineGame | null>(joined.game && toOnlineGame(joined.game));
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);
  const [events, setEvents] = useState<EventBatch | null>(null);
  const [connected, setConnected] = useState(true);
  /** Set when you can no longer be in this room; the screen should send you back. */
  const [ended, setEnded] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onState = (state: LobbyState) => {
      if (state.code !== code) return;
      setLobby(state);
      if (state.status === 'lobby') {
        setGame(null);
        setLog([]);
      }
    };
    const onGame = (update: GameUpdate) => {
      setGame(toOnlineGame(update));
      if (update.events.length) {
        setEvents((prev) => ({ seq: (prev?.seq ?? 0) + 1, events: update.events, at: Date.now() }));
      }
      const lines = update.events
        .map((e) => describeEvent(e, update.view.players, update.view.you))
        .filter((t): t is string => t !== null)
        .map((text) => ({ id: logId.current++, text }));
      if (lines.length) setLog((prev) => [...prev, ...lines].slice(-30));
    };
    const onKicked = (reason: KickReason) => {
      clearSession();
      setEnded(KICK_MESSAGES[reason]);
    };
    const onDisconnect = () => setConnected(false);
    // After a dropped connection, reclaim our seat with the saved token.
    const onConnect = () => {
      const session = loadSession();
      if (!session || session.code !== code) return;
      api.joinRoom(code, session.name, session.token).then(
        (back) => {
          setLobby(back.lobby);
          setGame(back.game && toOnlineGame(back.game));
          setConnected(true);
        },
        (err: Error) => {
          clearSession();
          setEnded(`You were disconnected for too long. ${err.message}`);
        },
      );
    };

    socket.on('room:state', onState);
    socket.on('game:state', onGame);
    socket.on('room:kicked', onKicked);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    return () => {
      socket.off('room:state', onState);
      socket.off('game:state', onGame);
      socket.off('room:kicked', onKicked);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [code]);

  const updateRules = useCallback((rules: RuleSet) => {
    setLobby((l) => ({ ...l, rules })); // show it right away; the server's copy follows
    return api.updateRules(rules);
  }, []);

  const leave = useCallback(() => {
    api.leaveRoom();
    clearSession();
  }, []);

  /** Sends a move; resolves to an error message, or null. */
  const act = useCallback(
    (action: Action) => api.sendAction(action).then(() => null, (err: Error) => err.message),
    [],
  );

  return {
    lobby,
    game: lobby.status === 'playing' ? game : null,
    log,
    events,
    playerId,
    isHost: lobby.hostId === playerId,
    connected,
    ended,
    updateRules,
    addBot: (difficulty: BotDifficulty) => api.addBot(difficulty),
    removeSeat: (id: string) => api.removeSeat(id),
    start: () => api.startGame(),
    returnToLobby: () => api.returnToLobby(),
    nextRound: () => api.nextRound(),
    act,
    leave,
  };
}

export type Room = ReturnType<typeof useRoom>;

/** Saves what's needed to get back into the room after a refresh. */
export function rememberRoom(joined: JoinedRoom, name: string): void {
  saveSession({ code: joined.code, token: joined.token, name });
}
