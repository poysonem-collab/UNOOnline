import { HAND_SIZES, needsTwoDecks, type RuleSet } from '@uno/shared';

interface RulesPanelProps {
  /** Some rules read differently per game (UNO Flip has no 0s and its own draw cards). */
  variantId?: string;
  rules: RuleSet;
  onChange: (rules: RuleSet) => void;
  playerCount: number;
  /** Shows the turn timer, which only matters online. */
  online?: boolean;
  readOnly?: boolean;
}

type HouseRule = 'stackDraws' | 'stackSameNumber' | 'sevenZero' | 'jumpIn' | 'drawUntilPlayable' | 'challengeWild4' | 'noActionFinish';

const HOUSE_RULES: { key: HouseRule; label: string; hint: string }[] = [
  { key: 'stackDraws', label: 'Stack +2 / +4', hint: 'Hit with a draw card? Play your own to pass the total on to the next player.' },
  { key: 'stackSameNumber', label: 'Stack same numbers', hint: 'Play several cards of the same number at once, in any colors.' },
  { key: 'sevenZero', label: '7-0', hint: 'Playing a 7 swaps hands with a player you choose. Playing a 0 passes every hand along.' },
  { key: 'jumpIn', label: 'Jump-in', hint: 'Have the exact same card as the top one? Play it any time, even out of turn.' },
  { key: 'drawUntilPlayable', label: 'Draw until playable', hint: 'Keep drawing until you get a card you can play. Hands get big, so games run longer.' },
  { key: 'challengeWild4', label: 'Challenge Wild +4', hint: 'A +4 is only allowed with no card of the current color. Challenge it: a bluffer draws 4, otherwise you draw 6.' },
  { key: 'noActionFinish', label: 'No finishing on action cards', hint: 'Your last card has to be a number card.' },
];

/** UNO Flip wording for the rules that differ. */
const FLIP_RULES: Partial<Record<HouseRule, { label: string; hint: string }>> = {
  stackDraws: { label: 'Stack draw cards', hint: 'Hit with a Draw One, Draw Two or Draw Five? Play one that draws at least as many to pass the total on.' },
  sevenZero: { label: 'Sevens swap', hint: 'Playing a 7 swaps hands with a player you choose. (UNO Flip has no 0s.)' },
  challengeWild4: { label: 'Challenge Wild Draw Two', hint: 'A Wild Draw Two is only allowed with no card of the current color. Challenge it: a bluffer draws the cards, otherwise you draw 2 extra.' },
};

export function RulesPanel({ variantId, rules, onChange, playerCount, online, readOnly }: RulesPanelProps) {
  const houseRules = HOUSE_RULES.map((r) => (variantId === 'flip' ? { ...r, ...FLIP_RULES[r.key] } : r));
  const set = <K extends keyof RuleSet>(key: K, value: RuleSet[K]) => onChange({ ...rules, [key]: value });
  const twoDecksRequired = needsTwoDecks(playerCount, rules.handSize);

  return (
    <fieldset className="rules" disabled={readOnly}>
      <legend>Rules</legend>

      <label className="field">
        <span>Starting hand</span>
        <select value={rules.handSize} onChange={(e) => set('handSize', Number(e.target.value))}>
          {HAND_SIZES.map((n) => <option key={n} value={n}>{n} cards</option>)}
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

      <h3 className="rules__heading">House rules</h3>
      {houseRules.map(({ key, label, hint }) => (
        <div key={key}>
          <label className="toggle">
            <input type="checkbox" checked={rules[key]} onChange={(e) => set(key, e.target.checked)} />
            <span>
              <strong>{label}</strong>
              <small>{hint}</small>
            </span>
          </label>
          {key === 'stackDraws' && rules.stackDraws && (
            <label className="toggle toggle--sub">
              <input type="checkbox" checked={rules.stackPlus2OnPlus4} onChange={(e) => set('stackPlus2OnPlus4', e.target.checked)} />
              <span>
                <strong>{variantId === 'flip' ? 'Allow smaller on bigger' : 'Allow +2 on a +4'}</strong>
                <small>
                  {variantId === 'flip'
                    ? 'A smaller draw card can go on a bigger one, in the color in play.'
                    : 'Only in the color the +4 picked. A +4 can always go on a +2.'}
                </small>
              </span>
            </label>
          )}
        </div>
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
