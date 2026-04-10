import { memo } from 'react';

interface SeatChairProps {
  color: string;
  size?: number;
  selected?: boolean;
  opacity?: number;
  glowColor?: string;
  borderColor?: string;
}

export const SeatChair = memo(function SeatChair({
  color,
  size = 18,
  selected = false,
  opacity = 1,
  glowColor,
  borderColor,
}: SeatChairProps) {
  const r = size / 2;
  const border = borderColor || darkenHex(color, 0.25);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={r} cy={r} r={r - 1} fill={color} opacity={opacity} stroke={border} strokeWidth={1.5} />
      <circle cx={r - r * 0.15} cy={r - r * 0.22} r={r * 0.35} fill="rgba(255,255,255,0.2)" />
      {selected && (
        <circle cx={r} cy={r} r={r - 0.5} stroke={glowColor || '#ffffff'} strokeWidth={2} fill="none" />
      )}
    </svg>
  );
});

function darkenHex(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`;
}

interface SvgSeatChairProps {
  cx: number;
  cy: number;
  size: number;
  color: string;
  opacity?: number;
  selected?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  className?: string;
  style?: React.CSSProperties;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerEnter?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const SvgSeatChair = memo(function SvgSeatChair({
  cx,
  cy,
  size,
  color,
  opacity = 1,
  selected = false,
  strokeColor,
  strokeWidth = 2,
  strokeOpacity = 1,
  className,
  style,
  onPointerDown,
  onPointerUp,
  onPointerEnter,
  onPointerLeave,
  onClick,
  onMouseDown,
  onMouseMove,
  onContextMenu,
}: SvgSeatChairProps) {
  const r = size / 2;
  const borderW = strokeWidth;
  const hlR = r * 0.35;
  const hlCx = cx - r * 0.15;
  const hlCy = cy - r * 0.22;

  return (
    <g
      className={className}
      style={style}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onContextMenu={onContextMenu}
    >
      <circle
        cx={cx} cy={cy + 1} r={r}
        fill="rgba(0,0,0,0.08)"
        style={{ pointerEvents: 'none' }}
      />
      <circle
        cx={cx} cy={cy} r={r - borderW / 2}
        fill={color}
        opacity={opacity}
        stroke={strokeColor || color}
        strokeWidth={borderW}
        strokeOpacity={strokeOpacity}
      />
      <circle
        cx={hlCx} cy={hlCy} r={hlR}
        fill="rgba(255,255,255,0.18)"
        style={{ pointerEvents: 'none' }}
      />
      {selected && (
        <circle
          cx={cx} cy={cy} r={r + 1}
          stroke="#ffffff"
          strokeWidth={2.5}
          fill="none"
          style={{ pointerEvents: 'none' }}
        />
      )}
      <circle
        cx={cx} cy={cy} r={r + 2}
        fill="transparent"
      />
    </g>
  );
});

interface SvgSeatDotChairProps {
  cx: number;
  cy: number;
  size: number;
  color: string;
  opacity?: number;
}

export const SvgSeatDotChair = memo(function SvgSeatDotChair({
  cx,
  cy,
  size,
  color,
  opacity = 0.7,
}: SvgSeatDotChairProps) {
  const r = size / 2;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={r} fill={color} opacity={opacity} />
    </g>
  );
});
