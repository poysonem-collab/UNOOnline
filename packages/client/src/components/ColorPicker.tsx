import { COLORS, colorName, type Color } from '@uno/shared';
import { CARD_COLORS } from './Card';

export function ColorPicker({ onPick, onCancel }: { onPick: (c: Color) => void; onCancel: () => void }) {
  return (
    <div className="modal" role="dialog" aria-label="Choose a color" onClick={onCancel}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <h2>Choose a color</h2>
        <div className="color-picker">
          {COLORS.map((color) => (
            <button
              key={color} type="button" className="color-picker__swatch"
              style={{ background: CARD_COLORS[color] }} onClick={() => onPick(color)}
            >
              {colorName(color)}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
