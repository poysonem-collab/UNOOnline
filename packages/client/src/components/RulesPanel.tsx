import type { RuleSet } from '@uno/shared';

/** Fewer cards than this left after dealing means a second deck is needed. */
const MIN_DRAW_PILE = 10;

export function needsTwoDecks(playerCount: number, handSize: number): boolean {
  return playerCount * handSize >= 108 - MIN_DRAW_PILE;
}

interface RulesPanelProps {
  rules: RuleSet;
  onChange: (rules: RuleSet) => void;
  playerCount: number;
  /** Shows the turn timer, which only matters online. */
  online?: boolean;
  readOnly?: boolean;
}

const HOUSE_RULES: { key: keyof RuleSet; label: string; hint: string }[] = [
  { key: 'stackDraws', label: 'Stack +2 / +4', hint: 'Answer a draw card with your own to pass the total on.' },
  { key: 'stackSameNumber', label: 'Stack same numbers', hint: 'Play several cards of the same number at once.' },
  { key: 'sevenZero', label: '7-0', hint: '7 swaps hands with someone, 0 passes every hand along.' },
  { key: 'jumpIn', label: 'Jump-in', hint: 'Play an identical card out of turn.' },
  { key: 'drawUntilPlayable', label: 'Draw until playable', hint: 'Keep drawing until you can play.' },
];

export function RulesPanel({ rules, onChange, playerCount, online, readOnly }: RulesPanelProps) {
  const set = <K extends keyof RuleSet>(key: K, value: RuleSet[K]) => onChange({ ...rules, [key]: value });
  const twoDecksRequired = needsTwoDecks(playerCount, rules.handSize);

  return (
    <fieldset className="rules" disabled={readOnly}>
      <legend>Rules</legend>

      <label className="field">
        <span>Starting hand</span>
        <select value={rules.handSize} onChange={(e) => set('handSize', Number(e.target.value))}>
          {[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} cards</option>)}
        </select>
      </label>

      <div className="field">
        <span>Win by</span>
        <Segmented
          value={rules.winCondition}
          options={[['firstOut', 'First out'], ['points500', '500 points']]}
          onChange={(v) => set('winCondition', v)}
        />
      </div>

      <div className="field">
        <span>Decks</span>
        <Segmented
          value={twoDecksRequired ? 2 : rules.deckCount}
          options={[[1, '1 deck'], [2, '2 decks']]}
          onChange={(v) => set('deckCount', v)}
          disabled={twoDecksRequired}
        />
      </div>
      {twoDecksRequired && <p className="hint">This many players and cards needs 2 decks.</p>}

      {online && (
        <label className="field">
          <span>Turn timer</span>
          <select value={rules.turnTimerSeconds} onChange={(e) => set('turnTimerSeconds', Number(e.target.value) as RuleSet['turnTimerSeconds'])}>
            <option value={0}>Off</option>
            <option value={15}>15 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={60}>60 seconds</option>
          </select>
        </label>
      )}

      <h3 className="rules__heading">House rules <span className="soon">coming soon</span></h3>
      {HOUSE_RULES.map(({ key, label, hint }) => (
        <label key={key} className="toggle toggle--soon" title={hint}>
          <input type="checkbox" checked={Boolean(rules[key])} disabled />
          <span>
            <strong>{label}</strong>
            <small>{hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function Segmented<T extends string | number>({
  value, options, onChange, disabled,
}: { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={String(v)} type="button" role="radio" aria-checked={v === value}
          className={v === value ? 'is-active' : ''} onClick={() => onChange(v)} disabled={disabled}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
