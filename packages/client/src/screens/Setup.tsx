import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  cleanName,
  getVariant,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
  rulesForPlayerCount,
  VARIANT_CATALOG,
  type BotDifficulty,
  type JoinedRoom,
  type RuleSet,
} from '@uno/shared';
import { RulesPanel, Segmented } from '../components/RulesPanel';
import type { LocalGameConfig } from '../local/useLocalGame';
import { api, ONLINE_AVAILABLE } from '../net/socket';
import { clearSession, loadName, loadSession, saveName } from '../net/session';
import { rememberRoom } from '../online/useRoom';

export type SetupTab = 'bots' | 'friends';

interface SetupProps {
  variantId: string;
  initialTab: SetupTab;
  /** Room code from an invite link. */
  initialCode?: string;
  /** Shown at the top, e.g. why you left a lobby. */
  notice?: string;
  onStart: (config: LocalGameConfig) => void;
  onJoined: (joined: JoinedRoom) => void;
  onBack: () => void;
}

/** After this long, explain that the free server may be waking up. */
const SLOW_CONNECT_MS = 4_000;

export function Setup({ variantId, initialTab, initialCode, notice, onStart, onJoined, onBack }: SetupProps) {
  const listing = VARIANT_CATALOG.find((v) => v.id === variantId)!;
  const [tab, setTab] = useState<SetupTab>(initialTab);
  const [name, setName] = useState(loadName);
  const nameInput = useRef<HTMLInputElement>(null);

  // Play vs bots
  const [botCount, setBotCount] = useState(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const [rules, setRules] = useState<RuleSet>(getVariant(variantId).defaultRules);
  const playerCount = botCount + 1;

  // Play with friends
  const [code, setCode] = useState(normalizeRoomCode(initialCode ?? ''));
  const [busy, setBusy] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  // Coming back to a room from an invite link or a refresh: reclaim the saved seat.
  useEffect(() => {
    const session = loadSession();
    if (!initialCode || !ONLINE_AVAILABLE || session?.code !== normalizeRoomCode(initialCode)) return;
    setBusy(`Rejoining room ${session.code}…`);
    api.joinRoom(session.code, session.name, session.token).then(
      (joined) => {
        rememberRoom(joined, session.name);
        onJoined(joined);
      },
      () => {
        clearSession();
        setBusy(null);
        setError(`Couldn't get back into room ${session.code}. It may have closed. You can try joining again.`);
      },
    );
    // Only on first load.
  }, []);

  const requireName = (): string | null => {
    const trimmed = cleanName(name);
    if (!trimmed) {
      setError('Enter your name first.');
      nameInput.current?.focus();
      return null;
    }
    saveName(trimmed);
    return trimmed;
  };

  const startBots = () => {
    const trimmed = cleanName(name);
    saveName(trimmed);
    onStart({ variantId, playerName: trimmed || 'You', botCount, difficulty, rules: rulesForPlayerCount(rules, playerCount) });
  };

  const connect = async (label: string, request: (name: string) => Promise<JoinedRoom>) => {
    setError(null);
    const player = requireName();
    if (!player) return;
    setBusy(label);
    try {
      const joined = await request(player);
      rememberRoom(joined, player);
      onJoined(joined);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== ROOM_CODE_LENGTH) {
      setError(`Room codes are ${ROOM_CODE_LENGTH} letters.`);
      return;
    }
    void connect(`Joining room ${code}…`, (player) => api.joinRoom(code, player));
  };

  return (
    <main className="setup">
      <button type="button" className="btn btn--ghost btn--small" onClick={onBack}>← Back</button>
      <h1>{listing.name}</h1>

      {notice && <div className="banner" role="status">{notice}</div>}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'bots'} className={`tabs__tab ${tab === 'bots' ? 'is-active' : ''}`} onClick={() => setTab('bots')}>
          Play vs bots
        </button>
        <button type="button" role="tab" aria-selected={tab === 'friends'} className={`tabs__tab ${tab === 'friends' ? 'is-active' : ''}`} onClick={() => setTab('friends')}>
          Play with friends
        </button>
      </div>

      <label className="field">
        <span>Your name</span>
        <input ref={nameInput} value={name} maxLength={MAX_NAME_LENGTH} placeholder={tab === 'bots' ? 'You' : 'Required'} onChange={(e) => setName(e.target.value)} />
      </label>

      {tab === 'bots' ? (
        <>
          <div className="field">
            <span>Bots</span>
            <div className="stepper">
              <button type="button" onClick={() => setBotCount((n) => Math.max(1, n - 1))} disabled={botCount <= 1} aria-label="Fewer bots">−</button>
              <output>{botCount}</output>
              <button type="button" onClick={() => setBotCount((n) => Math.min(MAX_PLAYERS - 1, n + 1))} disabled={botCount >= MAX_PLAYERS - 1} aria-label="More bots">+</button>
            </div>
          </div>
          <p className="hint">{playerCount} players in total (max {MAX_PLAYERS}).</p>

          <div className="field">
            <span>Bot skill</span>
            <Segmented value={difficulty} options={[['easy', 'Easy'], ['normal', 'Normal']]} onChange={setDifficulty} />
          </div>

          <RulesPanel variantId={variantId} rules={rules} onChange={setRules} playerCount={playerCount} />

          <button type="button" className="btn btn--primary btn--big" onClick={startBots}>Start game</button>
        </>
      ) : !ONLINE_AVAILABLE ? (
        <p className="banner">Online play isn't set up on this copy of the game yet. You can still play against bots.</p>
      ) : busy ? (
        <div className="connecting" role="status">
          <span className="spinner" aria-hidden />
          <p>{busy}</p>
          {slow && <p className="hint">Waking up the game server. This can take up to a minute the first time.</p>}
        </div>
      ) : (
        <>
          {error && <p className="form-error" role="alert">{error}</p>}

          <section className="panel">
            <h2>Host a game</h2>
            <p className="hint">Create a room, then share its code with up to 9 friends. You can fill empty seats with bots.</p>
            <button type="button" className="btn btn--primary btn--big" onClick={() => connect('Creating your room…', (player) => api.createRoom(player, variantId))}>
              Create lobby
            </button>
          </section>

          <section className="panel">
            <h2>Join a friend</h2>
            <form className="join-form" onSubmit={join}>
              <input
                className="join-form__code" value={code} placeholder="CODE" aria-label="Room code"
                autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={ROOM_CODE_LENGTH}
                onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
              />
              <button type="submit" className="btn btn--primary">Join</button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
