import { useId, type ReactNode } from 'react';
import { describeCard, type CardFace, type Color } from '@uno/shared';

export const CARD_COLORS: Record<Color, string> = {
  red: '#d72600',
  yellow: '#ecd407',
  green: '#379711',
  blue: '#0956bf',
  // UNO Flip's dark side
  pink: '#d6127f',
  teal: '#00999a',
  orange: '#f26b1d',
  purple: '#6c3aa0',
};
const BLACK = '#111';
const LIGHT_WILD = [CARD_COLORS.red, CARD_COLORS.blue, CARD_COLORS.yellow, CARD_COLORS.green];
const DARK_WILD = [CARD_COLORS.pink, CARD_COLORS.teal, CARD_COLORS.orange, CARD_COLORS.purple];

// Card art is drawn on a 120 x 180 grid.
const W = 120;
const H = 180;
const OVAL_TILT = 'rotate(30 60 90)';

type Value = CardFace['value'];

interface CardProps {
  card: CardFace;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
  className?: string;
}

export function Card({ card, onClick, disabled, highlight, className = '' }: CardProps) {
  const classes = ['card', onClick && !disabled ? 'card--clickable' : '', disabled ? 'card--disabled' : '', highlight ? 'card--highlight' : '', className];
  const art = <CardArt card={card} />;
  if (!onClick) {
    return <div className={classes.join(' ')} aria-label={describeCard(card)}>{art}</div>;
  }
  return (
    <button type="button" className={classes.join(' ')} onClick={onClick} disabled={disabled} aria-label={describeCard(card)}>
      {art}
    </button>
  );
}

export function CardBack({ className = '' }: { className?: string }) {
  return (
    <div className={`card ${className}`} aria-label="Face-down card">
      <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
        <Frame face={BLACK} />
        <ellipse cx="60" cy="90" rx="40" ry="64" transform={OVAL_TILT} fill={CARD_COLORS.red} />
        <text
          x="60" y="102" textAnchor="middle" transform="rotate(-20 60 90)"
          className="card__back-text" fill="#fff" stroke={BLACK} strokeWidth="4" paintOrder="stroke"
        >
          UNO
        </text>
      </svg>
    </div>
  );
}

/**
 * Light-side (and classic) cards: colored face, white oval, white border.
 * UNO Flip's dark side: colored face, black oval, black border.
 */
function CardArt({ card }: { card: CardFace }) {
  const dark = Boolean(card.dark);
  if (card.color === 'wild') return <WildArt value={card.value} dark={dark} />;
  const color = CARD_COLORS[card.color];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <Frame face={color} dark={dark} />
      <ellipse cx="60" cy="90" rx="40" ry="64" transform={OVAL_TILT} fill={dark ? '#161616' : '#fff'} />
      <Corners>
        <CornerMark value={card.value} />
      </Corners>
      <CenterMark value={card.value} color={color} />
    </svg>
  );
}

/** Border with rounded corners around the face: white on the light side, black on the dark side. */
function Frame({ face, dark }: { face: string; dark?: boolean }) {
  return (
    <>
      <rect width={W} height={H} rx="12" fill={dark ? '#1b1b1b' : '#fff'} />
      <rect x="6" y="6" width={W - 12} height={H - 12} rx="8" fill={face} />
    </>
  );
}

/** Draws the corner content top-left and again upside down bottom-right. */
function Corners({ children }: { children: ReactNode }) {
  return (
    <>
      <g transform="translate(22 30)">{children}</g>
      <g transform="translate(98 150) rotate(180)">{children}</g>
    </>
  );
}

const DRAW_LABELS: Partial<Record<Value, string>> = { draw1: '+1', draw2: '+2', draw5: '+5', wild2: '+2', wild4: '+4', wildColor: '+?' };

/** Small white mark centered on (0, 0). */
function CornerMark({ value }: { value: Value }) {
  if (typeof value === 'number') return <OutlinedText size={30} fill="#fff" underline={value === 6 || value === 9}>{value}</OutlinedText>;
  const label = DRAW_LABELS[value];
  if (label) return <OutlinedText size={24} fill="#fff">{label}</OutlinedText>;
  return <g transform="scale(11)"><ActionSymbol value={value as SymbolValue} fill="#fff" /></g>;
}

/** Big mark in the oval. */
function CenterMark({ value, color }: { value: Value; color: string }) {
  if (typeof value === 'number') {
    return (
      <g transform="translate(60 90)">
        <OutlinedText size={84} fill={color} shadow underline={value === 6 || value === 9}>{value}</OutlinedText>
      </g>
    );
  }
  if (value === 'draw2' || value === 'draw1') {
    return (
      <g transform="translate(60 90)">
        {value === 'draw1' ? (
          <MiniCard x={-12} y={-16} fill={color} />
        ) : (
          <>
            <MiniCard x={-20} y={-24} fill={color} />
            <MiniCard x={-4} y={-6} fill={color} />
          </>
        )}
      </g>
    );
  }
  if (value === 'draw5') {
    return (
      <g transform="translate(60 90)">
        <OutlinedText size={56} fill={color} shadow>+5</OutlinedText>
      </g>
    );
  }
  return (
    <g transform="translate(60 90) scale(30)">
      <g transform="translate(-0.08 0.08)"><ActionSymbol value={value as SymbolValue} fill={BLACK} /></g>
      <ActionSymbol value={value as SymbolValue} fill={color} outline />
    </g>
  );
}

type SymbolValue = 'skip' | 'reverse' | 'flip' | 'skipAll';

/** Action symbols drawn in a unit box centered on (0, 0). */
function ActionSymbol({ value, fill, outline }: { value: SymbolValue; fill: string; outline?: boolean }) {
  const stroke = outline ? { stroke: BLACK, strokeWidth: 0.06, paintOrder: 'stroke' as const } : {};
  // Stroked shapes get their outline from a wider black copy drawn underneath.
  const twice = (draw: (color: string, width: number) => ReactNode, width: number) => (
    <>
      {outline && draw(BLACK, width + 0.12)}
      {draw(fill, width)}
    </>
  );

  if (value === 'skip') {
    return twice(
      (color, width) => (
        <g fill="none" stroke={color} strokeWidth={width}>
          <circle r="0.66" />
          <line x1="-0.47" y1="0.47" x2="0.47" y2="-0.47" />
        </g>
      ),
      0.22,
    );
  }

  if (value === 'skipAll') {
    // A small Skip inside a dashed ring of arrows going all the way round.
    return twice(
      (color, width) => (
        <g fill="none" stroke={color}>
          <g strokeWidth={width * 0.75}>
            <circle r="0.42" />
            <line x1="-0.3" y1="0.3" x2="0.3" y2="-0.3" />
          </g>
          <circle r="0.8" strokeWidth={width * 0.6} strokeDasharray="0.55 0.28" />
        </g>
      ),
      0.22,
    );
  }

  if (value === 'flip') {
    // A card between two curved arrows chasing each other.
    return (
      <>
        {twice(
          (color, width) => (
            <g fill="none" stroke={color} strokeWidth={width} strokeLinecap="round">
              <path d="M -0.66 0.1 A 0.66 0.66 0 0 1 0.3 -0.6" />
              <path d="M 0.66 -0.1 A 0.66 0.66 0 0 1 -0.3 0.6" />
            </g>
          ),
          0.14,
        )}
        <g fill={fill} {...stroke}>
          <path d="M 0.18 -0.82 L 0.58 -0.6 L 0.2 -0.38 Z" />
          <path d="M -0.18 0.82 L -0.58 0.6 L -0.2 0.38 Z" />
          <rect x="-0.2" y="-0.28" width="0.4" height="0.56" rx="0.07" />
        </g>
      </>
    );
  }

  // Reverse: two arrows pointing opposite ways, tilted like the real card.
  const arrow = 'M-0.11 0.7 L-0.11 -0.1 L-0.28 -0.1 L0 -0.62 L0.28 -0.1 L0.11 -0.1 L0.11 0.7 Z';
  return (
    <g transform="rotate(45)" {...stroke} fill={fill}>
      <path d={arrow} transform="translate(-0.3 -0.08)" />
      <path d={arrow} transform="translate(0.3 0.08) rotate(180)" />
    </g>
  );
}

function OutlinedText({
  children, size, fill, shadow, underline,
}: { children: ReactNode; size: number; fill: string; shadow?: boolean; underline?: boolean }) {
  const y = size * 0.35;
  const textProps = { x: 0, y, textAnchor: 'middle' as const, fontSize: size, className: 'card__number' };
  const lineW = size * 0.42;
  return (
    <g>
      {shadow && <text {...textProps} x={-size * 0.05} y={y + size * 0.05} fill={BLACK}>{children}</text>}
      <text {...textProps} fill={fill} stroke={BLACK} strokeWidth={size * 0.06} paintOrder="stroke">{children}</text>
      {underline && (
        <rect x={-lineW / 2} y={y + size * 0.08} width={lineW} height={size * 0.08} fill={fill} stroke={BLACK} strokeWidth={size * 0.03} />
      )}
    </g>
  );
}

function MiniCard({ x, y, fill, rotate = 0 }: { x: number; y: number; fill: string; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate} 12 15)`}>
      <rect width="24" height="32" rx="3" fill={fill} stroke={BLACK} strokeWidth="2.5" />
      <rect x="3" y="3" width="18" height="26" rx="2" fill="none" stroke="#fff" strokeWidth="1.5" />
    </g>
  );
}

/** Oval split into four colors, as on Wild cards. */
function FourColorOval({ rx, ry, border, colors }: { rx: number; ry: number; border: number; colors: string[] }) {
  const id = useId();
  const [a, b, c, d] = colors;
  return (
    <g transform="rotate(30)">
      <clipPath id={id}>
        <ellipse rx={rx} ry={ry} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x={-rx} y={-ry} width={rx} height={ry} fill={a} />
        <rect x={0} y={-ry} width={rx} height={ry} fill={b} />
        <rect x={-rx} y={0} width={rx} height={ry} fill={c} />
        <rect x={0} y={0} width={rx} height={ry} fill={d} />
      </g>
      <ellipse rx={rx} ry={ry} fill="none" stroke="#fff" strokeWidth={border} />
    </g>
  );
}

function WildArt({ value, dark }: { value: Value; dark: boolean }) {
  const palette = dark ? DARK_WILD : LIGHT_WILD;
  const label = DRAW_LABELS[value];

  // Wild Draw Four / Wild Draw Two: mini cards fanned in a white oval.
  if (value === 'wild4' || value === 'wild2') {
    const fan = value === 'wild4'
      ? [[-30, -30, 1], [-14, -20, 3], [-10, -8, 0], [6, 2, 2]]
      : [[-20, -24, 1], [-4, -6, 3]];
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
        <Frame face={BLACK} dark={dark} />
        <ellipse cx="60" cy="90" rx="40" ry="64" transform={OVAL_TILT} fill="#fff" />
        <g transform="translate(60 90)">
          {fan.map(([x, y, i]) => <MiniCard key={i} x={x!} y={y!} fill={palette[i!]!} />)}
        </g>
        <Corners><OutlinedText size={24} fill="#fff">{label}</OutlinedText></Corners>
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <Frame face={BLACK} dark={dark} />
      <g transform="translate(60 90)"><FourColorOval rx={40} ry={64} border={4} colors={palette} /></g>
      {value === 'wildColor' ? (
        <>
          <g transform="translate(60 90)"><OutlinedText size={44} fill="#fff">+?</OutlinedText></g>
          <Corners><OutlinedText size={22} fill="#fff">+?</OutlinedText></Corners>
        </>
      ) : (
        <Corners><FourColorOval rx={7} ry={11} border={1.5} colors={palette} /></Corners>
      )}
    </svg>
  );
}
