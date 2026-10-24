import { useEffect, useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, playableIdsFromView, VARIANT_CATALOG, type BotDifficulty, type JoinedRoom } from '@uno/shared';
import { GameTable, type EndAction } from '../components/GameTable';
import { RulesPanel, Segmented } from '../components/RulesPanel';
import { inviteLink, setRoomInUrl } from '../net/session';
import { useRoom, type OnlineGame, type Room } from '../online/useRoom';

interface OnlineRoomProps {
  joined: JoinedRoom;
  /** Back to the menu, with an optional message explaining why. */
  onExit: (message?: string) => void;
}

/** A room you're in: the lobby before a game, the table during one. */
export function OnlineRoom({ joined, onExit }: OnlineRoomProps) {
  const room = useRoom(joined);

  useEffect(() => {
    setRoomInUrl(room.lobby.code);
  }, [room.lobby.code]);

  useEffect(() => {
    if (room.ended) {
      setRoomInUrl(null);
      onExit(room.ended);
    }
  }, [room.ended, onExit]);

  const leave = () => {
    room.leave();
    setRoomInUrl(null);
    onExit();
  };

  if (room.game) return <OnlineTable room={room} game={room.game} onLeave={leave} />;
  return <LobbyView room={room} onLeave={leave} />;
}

function OnlineTable({ room, game, onLeave }: { room: Room; game: OnlineGame; onLeave: () => void }) {
  const { view } = game.update;
  const host = room.lobby.seats.find((s) => s.id === room.lobby.hostId);
  const awayIds = new Set(room.lobby.seats.filter((s) => !s.connected).map((s) => s.id));
  const leaveAction: EndAction = { label: 'Leave room', onClick: onLeave };

  let endActions: EndAction[] = [];
  let endNote: string | undefined;
  if (view.phase === 'roundOver') {
    endActions = room.isHost ? [{ label: 'Start next round now', onClick: () => void room.nextRound().catch(() => {}), primary: true }] : [];
  } else if (view.phase === 'gameOver') {
    if (room.isHost) {
      endActions = [
        { label: 'Play again', onClick: () => void room.start().catch(() => {}), primary: true },
        { label: 'Back to lobby', onClick: () => void room.returnToLobby().catch(() => {}) },
        leaveAction,
      ];
    } else {
      endNote = `Waiting for ${host?.name ?? 'the host'} to start another game…`;
      endActions = [leaveAction];
    }
  }

  return (
    <GameTable
      // A fresh table for every deal, so piles and animations reset.
      key={`${view.round}-${view.scores.join(',')}-${game.update.view.phase === 'gameOver'}`}
      view={view}
      log={room.log}
      events={room.events}
      playableIds={playableIdsFromView(view)}
      onAction={room.act}
      endActions={endActions}
      endNote={endNote}
      exitLabel="← Leave"
      onExit={() => {
        if (confirm('Leave the game? A bot will play your cards.')) onLeave();
      }}
      turnEndsAt={game.turnEndsAt}
      nextRoundAt={game.nextRoundAt}
      awayIds={awayIds}
      notice={room.connected ? null : 'Connection lost. Reconnecting…'}
    />
  );
}

function LobbyView({ room, onLeave }: { room: Room; onLeave: () => void }) {
  const { lobby, isHost } = room;
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [starting, setStarting] = useState(false);
  const listing = VARIANT_CATALOG.find((v) => v.id === lobby.variantId);
  const host = lobby.seats.find((s) => s.id === lobby.hostId);
  const full = lobby.seats.length >= MAX_PLAYERS;
  const enoughPlayers = lobby.seats.length >= MIN_PLAYERS;

  const run = (promise: Promise<unknown>) => {
    setError(null);
    return promise.catch((err: Error) => setError(err.message));
  };

  const start = () => {
    setStarting(true);
    void run(room.start()).finally(() => setStarting(false));
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

  return (
    <main className="setup lobby">
      <button type="button" className="btn btn--ghost btn--small" onClick={onLeave}>← Leave</button>
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
          <button type="button" className="btn btn--primary btn--big" onClick={start} disabled={!enoughPlayers || starting}>
            {starting ? 'Dealing…' : 'Start game'}
          </button>
          {!enoughPlayers && <p className="hint lobby__start-note">Invite a friend or add a bot to start.</p>}
        </>
      ) : (
        <p className="lobby__waiting">Waiting for {host?.name ?? 'the host'} to start the game…</p>
      )}
    </main>
  );
}
