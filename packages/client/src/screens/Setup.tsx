import { useState } from 'react';
import { getVariant, MAX_PLAYERS, VARIANT_CATALOG, type BotDifficulty, type RuleSet } from '@uno/shared';
import { needsTwoDecks, RulesPanel, Segmented } from '../components/RulesPanel';
import type { LocalGameConfig } from '../local/useLocalGame';

const NAME_KEY = 'uno.name';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage can be unavailable (private mode); the name just won't be remembered.
  }
}

interface SetupProps {
  variantId: string;
  onStart: (config: LocalGameConfig) => void;
  onBack: () => void;
}

export function Setup({ variantId, onStart, onBack }: SetupProps) {
  const listing = VARIANT_CATALOG.find((v) => v.id === variantId)!;
  const [name, setName] = useState(loadName);
  const [botCount, setBotCount] = useState(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const [rules, setRules] = useState<RuleSet>(getVariant(variantId).defaultRules);
  const playerCount = botCount + 1;

  const start = () => {
    const trimmed = name.trim().slice(0, 16);
    saveName(trimmed);
    const deckCount = needsTwoDecks(playerCount, rules.handSize) ? 2 : rules.deckCount;
    onStart({ variantId, playerName: trimmed || 'You', botCount, difficulty, rules: { ...rules, deckCount } });
  };

  return (
    <main className="setup">
      <button type="button" className="btn btn--ghost btn--small" onClick={onBack}>← Back</button>
      <h1>{listing.name}</h1>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected className="tabs__tab is-active">Play vs bots</button>
        <button type="button" role="tab" aria-selected={false} className="tabs__tab" disabled>
          Play with friends <span className="soon">coming soon</span>
        </button>
      </div>

      <label className="field">
        <span>Your name</span>
        <input value={name} maxLength={16} placeholder="You" onChange={(e) => setName(e.target.value)} />
      </label>

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

      <RulesPanel rules={rules} onChange={setRules} playerCount={playerCount} />

      <button type="button" className="btn btn--primary btn--big" onClick={start}>Start game</button>
    </main>
  );
}
