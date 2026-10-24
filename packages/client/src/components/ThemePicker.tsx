import { THEMES } from '../effects/theme';
import { useTheme } from '../effects/useTheme';
import { Card } from './Card';

/** Pick a table background. It changes straight away, so you can try them on. */
export function ThemePicker({ onClose }: { onClose: () => void }) {
  const [current, setTheme] = useTheme();
  return (
    <div className="modal" role="dialog" aria-label="Table theme" onClick={onClose}>
      <div className="modal__box modal__box--wide" onClick={(e) => e.stopPropagation()}>
        <h2>Table theme</h2>
        <p className="hint">Only changes how the game looks for you.</p>
        <div className="themes" role="radiogroup">
          {THEMES.map((t) => (
            <button
              key={t.id} type="button" role="radio" aria-checked={t.id === current}
              className={`theme-tile ${t.id === current ? 'is-active' : ''}`} data-theme={t.id}
              onClick={() => setTheme(t.id)}
            >
              <span className="theme-tile__cards" aria-hidden>
                <Card card={{ color: 'red', value: 7 }} className="card--mini" />
                <Card card={{ color: 'wild', value: 'wild' }} className="card--mini" />
              </span>
              <span className="theme-tile__name">{t.id === current ? '✓ ' : ''}{t.name}</span>
            </button>
          ))}
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
