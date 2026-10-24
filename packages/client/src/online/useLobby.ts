import { useCallback, useEffect, useState } from 'react';
import type { BotDifficulty, JoinedRoom, KickReason, LobbyState, RuleSet } from '@uno/shared';
import { api, getSocket } from '../net/socket';
import { clearSession, loadSession, saveSession } from '../net/session';

const KICK_MESSAGES: Record<KickReason, string> = {
  removed: 'The host removed you from the room.',
  replaced: 'You opened this room in another tab or device.',
};

/** Live state of the lobby you're in, kept in sync with the server. */
export function useLobby(joined: JoinedRoom) {
  const { code, playerId } = joined;
  const [lobby, setLobby] = useState<LobbyState>(joined.lobby);
  const [connected, setConnected] = useState(true);
  /** Set when you can no longer be in this room; the screen should send you back. */
  const [ended, setEnded] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onState = (state: LobbyState) => {
      if (state.code === code) setLobby(state);
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
          setConnected(true);
        },
        (err: Error) => {
          clearSession();
          setEnded(`You were disconnected for too long. ${err.message}`);
        },
      );
    };

    socket.on('room:state', onState);
    socket.on('room:kicked', onKicked);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    return () => {
      socket.off('room:state', onState);
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

  return {
    lobby,
    playerId,
    isHost: lobby.hostId === playerId,
    connected,
    ended,
    updateRules,
    addBot: (difficulty: BotDifficulty) => api.addBot(difficulty),
    removeSeat: (id: string) => api.removeSeat(id),
    leave,
  };
}

/** Saves what's needed to get back into the room after a refresh. */
export function rememberRoom(joined: JoinedRoom, name: string): void {
  saveSession({ code: joined.code, token: joined.token, name });
}
