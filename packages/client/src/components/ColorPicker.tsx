import { COLORS, colorName, type Color } from '@uno/shared';
import { CARD_COLORS } from './Card';

interface ColorPickerProps {
  onPick: (c: Color) => void;
  /** Leave out when a color must be chosen (e.g. after a flip turns up a wild). */
  onCancel?: () => void;
  /** The colors in play; UNO Flip's dark side has its own. */
  colors?: readonly Color[];
  title?: string;
}

export function ColorPicker({ onPick, onCancel, colors = COLORS, title = 'Choose a color' }: ColorPickerProps) {
  return (
    <div className="modal" role="dialog" aria-label="Choose a color" onClick={onCancel}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="color-picker">
          {colors.map((color) => (
            <button
              key={color} type="button" className="color-picker__swatch"
              style={{ background: CARD_COLORS[color] }} onClick={() => onPick(color)}
            >
              {colorName(color)}
            </button>
          ))}
        </div>
        {onCancel && <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
