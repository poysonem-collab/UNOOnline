import type { BotDifficulty } from '@uno/shared';
import { Segmented } from './RulesPanel';

export const BOT_SKILL_LABELS: Record<BotDifficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  expert: 'Expert',
};

const DESCRIPTIONS: Record<BotDifficulty, string> = {
  easy: 'A casual player: plays whatever matches, wastes wilds and often forgets to call UNO.',
  normal: 'A typical family player: saves wilds for when they need them and usually remembers UNO.',
  hard: 'An experienced player: plans ahead, saves Skips and Draws for when they hurt most, and notices who is out of a color.',
  expert: 'A card counter: remembers every card played and thinks a few turns ahead before each move.',
};

const OPTIONS = (Object.keys(BOT_SKILL_LABELS) as BotDifficulty[]).map((level) => [level, BOT_SKILL_LABELS[level]] as [BotDifficulty, string]);

/** Picks how well bots play, with a line explaining the chosen level. */
export function BotSkill({ value, onChange, label = 'Bot skill' }: { value: BotDifficulty; onChange: (v: BotDifficulty) => void; label?: string }) {
  return (
    <div className="field field--stack">
      <span>{label}</span>
      <Segmented value={value} options={OPTIONS} onChange={onChange} />
      <small className="hint">{DESCRIPTIONS[value]}</small>
    </div>
  );
}
