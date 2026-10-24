import { useId, type ReactNode } from 'react';
import { describeCard, type Card as CardData, type Color } from '@uno/shared';

export const CARD_COLORS: Record<Color, string> = {
  red: '#d72600',
  yellow: '#ecd407',
  green: '#379711',
  blue: '#0956bf',
};
const BLACK = '#111';

// Card art is drawn on a 120 x 180 grid.
const W = 120;
const H = 180;
const OVAL_TILT = 'rotate(30 60 90)';

interface CardProps {
  card: CardData;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
  className?: string;
}

export function Card({ card, onClick, disabled, highlight, className = '' }: CardProps) {
  const classes = ['card', onClick && !disabled ? 'card--clickable' : '', disabled ? 'card--disabled' : '', highlight ? 'card--highlight' : '', className];
  const art = <CardFace card={card} />;
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

function CardFace({ card }: { card: CardData }) {
  if (card.color === 'wild') return card.value === 'wild' ? <WildFace /> : <WildDrawFourFace />;
  const color = CARD_COLORS[card.color];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <Frame face={color} />
      <ellipse cx="60" cy="90" rx="40" ry="64" transform={OVAL_TILT} fill="#fff" />
      <Corners>
        <CornerMark value={card.value} />
      </Corners>
      <CenterMark value={card.value} color={color} />
    </svg>
  );
}

/** White border with rounded corners around the colored face. */
function Frame({ face }: { face: string }) {
  return (
    <>
      <rect width={W} height={H} rx="12" fill="#fff" />
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

/** Small white mark centered on (0, 0). */
function CornerMark({ value }: { value: CardData['value'] }) {
  if (typeof value === 'number') return <OutlinedText size={30} fill="#fff" underline={value === 6 || value === 9}>{value}</OutlinedText>;
  if (value === 'draw2') return <OutlinedText size={24} fill="#fff">+2</OutlinedText>;
  return <g transform="scale(11)"><ActionSymbol value={value} fill="#fff" /></g>;
}

/** Big mark in the white oval. */
function CenterMark({ value, color }: { value: CardData['value']; color: string }) {
  if (typeof value === 'number') {
    return (
      <g transform="translate(60 90)">
        <OutlinedText size={84} fill={color} shadow underline={value === 6 || value === 9}>{value}</OutlinedText>
      </g>
    );
  }
  if (value === 'draw2') {
    return (
      <g transform="translate(60 90)">
        <MiniCard x={-20} y={-24} fill={color} />
        <MiniCard x={-4} y={-6} fill={color} />
      </g>
    );
  }
  return (
    <g transform="translate(60 90) scale(30)">
      <g transform="translate(-0.08 0.08)"><ActionSymbol value={value as 'skip' | 'reverse'} fill={BLACK} /></g>
      <ActionSymbol value={value as 'skip' | 'reverse'} fill={color} outline />
    </g>
  );
}

/** Skip and Reverse symbols drawn in a unit box centered on (0, 0). */
function ActionSymbol({ value, fill, outline }: { value: 'skip' | 'reverse' | 'wild' | 'wild4'; fill: string; outline?: boolean }) {
  const stroke = outline ? { stroke: BLACK, strokeWidth: 0.06, paintOrder: 'stroke' as const } : {};
  if (value === 'skip') {
    // Circle with a slash; the outline is a wider black copy underneath.
    const ring = (color: string, width: number) => (
      <g fill="none" stroke={color} strokeWidth={width}>
        <circle r="0.66" />
        <line x1="-0.47" y1="0.47" x2="0.47" y2="-0.47" />
      </g>
    );
    return (
      <>
        {outline && ring(BLACK, 0.34)}
        {ring(fill, 0.22)}
      </>
    );
  }
  // Two arrows pointing opposite ways, tilted like the real Reverse card.
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

/** Oval split into the four colors, as on Wild cards. */
function FourColorOval({ rx, ry, border }: { rx: number; ry: number; border: number }) {
  const id = useId();
  return (
    <g transform="rotate(30)">
      <clipPath id={id}>
        <ellipse rx={rx} ry={ry} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x={-rx} y={-ry} width={rx} height={ry} fill={CARD_COLORS.red} />
        <rect x={0} y={-ry} width={rx} height={ry} fill={CARD_COLORS.blue} />
        <rect x={-rx} y={0} width={rx} height={ry} fill={CARD_COLORS.yellow} />
        <rect x={0} y={0} width={rx} height={ry} fill={CARD_COLORS.green} />
      </g>
      <ellipse rx={rx} ry={ry} fill="none" stroke="#fff" strokeWidth={border} />
    </g>
  );
}

function WildFace() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <Frame face={BLACK} />
      <g transform="translate(60 90)"><FourColorOval rx={40} ry={64} border={4} /></g>
      <Corners><FourColorOval rx={7} ry={11} border={1.5} /></Corners>
    </svg>
  );
}

function WildDrawFourFace() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <Frame face={BLACK} />
      <ellipse cx="60" cy="90" rx="40" ry="64" transform={OVAL_TILT} fill="#fff" />
      <g transform="translate(60 90)">
        <MiniCard x={-30} y={-30} fill={CARD_COLORS.blue} />
        <MiniCard x={-14} y={-20} fill={CARD_COLORS.green} />
        <MiniCard x={-10} y={-8} fill={CARD_COLORS.red} />
        <MiniCard x={6} y={2} fill={CARD_COLORS.yellow} />
      </g>
      <Corners><OutlinedText size={24} fill="#fff">+4</OutlinedText></Corners>
    </svg>
  );
}
