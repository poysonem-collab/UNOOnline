import { useEffect, useState } from 'react';
import { MAX_PLAYERS, VARIANT_CATALOG, type BotDifficulty, type JoinedRoom } from '@uno/shared';
import { RulesPanel, Segmented } from '../components/RulesPanel';
import { inviteLink, setRoomInUrl } from '../net/session';
import { useLobby } from '../online/useLobby';

interface LobbyProps {
  joined: JoinedRoom;
  /** Back to the menu, with an optional message explaining why. */
  onExit: (message?: string) => void;
}

export function Lobby({ joined, onExit }: LobbyProps) {
  const room = useLobby(joined);
  const { lobby, isHost } = room;
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const listing = VARIANT_CATALOG.find((v) => v.id === lobby.variantId);
  const host = lobby.seats.find((s) => s.id === lobby.hostId);
  const full = lobby.seats.length >= MAX_PLAYERS;

  useEffect(() => {
    setRoomInUrl(lobby.code);
  }, [lobby.code]);

  useEffect(() => {
    if (room.ended) {
      setRoomInUrl(null);
      onExit(room.ended);
    }
  }, [room.ended, onExit]);

  const run = (promise: Promise<unknown>) => {
    setError(null);
    promise.catch((err: Error) => setError(err.message));
  };

  const copy = async (what: 'code' | 'link') => {
    const text = what === 'code' ? lobby.code : inviteLink(lobby.code);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      prompt('Copy this:', text);
    }
  };

  const leave = () => {
    room.leave();
    setRoomInUrl(null);
    onExit();
  };

  return (
    <main className="setup lobby">
      <button type="button" className="btn btn--ghost btn--small" onClick={leave}>← Leave</button>
      <h1>{listing?.name ?? 'UNO'} lobby</h1>

      {!room.connected && <div className="banner" role="status">Connection lost. Reconnecting…</div>}

      <section className="room-code">
        <span className="room-code__label">Room code</span>
        <button type="button" className="room-code__code" onClick={() => copy('code')} aria-label={`Room code ${lobby.code}, click to copy`}>
          {lobby.code}
        </button>
        <span className="room-code__hint">Friends enter this code on the “Play with friends” tab, or open the invite link.</span>
        <div className="room-code__actions">
          <button type="button" className="btn btn--small" onClick={() => copy('code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
          <button type="button" className="btn btn--small btn--primary" onClick={() => copy('link')}>{copied === 'link' ? 'Copied!' : 'Copy invite link'}</button>
        </div>
      </section>

      <section className="seats">
        <h2 className="seats__title">Players <span>{lobby.seats.length} / {MAX_PLAYERS}</span></h2>
        <ul className="seats__list">
          {lobby.seats.map((seat) => (
            <li key={seat.id} className={`seat ${seat.connected ? '' : 'seat--away'}`}>
              <span className="seat__avatar" aria-hidden>{seat.isBot ? '🤖' : seat.name[0]?.toUpperCase()}</span>
              <span className="seat__name">{seat.name}</span>
              <span className="seat__tags">
                {seat.id === lobby.hostId && <span className="tag tag--host">👑 Host</span>}
                {seat.id === room.playerId && <span className="tag">You</span>}
                {seat.isBot && <span className="tag">Bot · {seat.difficulty === 'easy' ? 'Easy' : 'Normal'}</span>}
                {!seat.connected && <span className="tag tag--away">Reconnecting…</span>}
              </span>
              {isHost && seat.id !== room.playerId && (
                <button
                  type="button" className="seat__remove"
                  onClick={() => run(room.removeSeat(seat.id))}
                  aria-label={seat.isBot ? `Remove ${seat.name}` : `Kick ${seat.name}`}
                  title={seat.isBot ? 'Remove bot' : 'Kick player'}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>

        {isHost && (
          <div className="add-bot">
            <Segmented value={botDifficulty} options={[['easy', 'Easy'], ['normal', 'Normal']]} onChange={setBotDifficulty} />
            <button type="button" className="btn" onClick={() => run(room.addBot(botDifficulty))} disabled={full}>
              + Add bot
            </button>
          </div>
        )}
        {full && <p className="hint">The room is full.</p>}
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}

      <RulesPanel
        rules={lobby.rules}
        onChange={(rules) => run(room.updateRules(rules))}
        playerCount={lobby.seats.length}
        online
        readOnly={!isHost}
      />
      {!isHost && <p className="hint lobby__rules-note">Only the host can change the rules.</p>}

      {isHost ? (
        <>
          <button type="button" className="btn btn--primary btn--big" disabled title="Coming in the next update">
            Start game
          </button>
          <p className="hint lobby__start-note">
            Starting online games is coming in the next update. For now you can set up the room, invite friends and pick rules.
          </p>
        </>
      ) : (
        <p className="lobby__waiting">Waiting for {host?.name ?? 'the host'} to start the game…</p>
      )}
    </main>
  );
}
