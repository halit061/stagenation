import { memo } from 'react';

interface SeatChairProps {
  color: string;
  size?: number;
  selected?: boolean;
  opacity?: number;
  glowColor?: string;
}

export const SeatChair = memo(function SeatChair({
  color,
  size = 18,
  selected = false,
  opacity = 0.9,
  glowColor,
}: SeatChairProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ display: 'block' }}>
      <rect x="4" y="1" width="12" height="9" rx="2.5" fill={color} opacity={opacity} />
      <rect x="2" y="10" width="16" height="5" rx="2" fill={color} opacity={Math.min(1, opacity + 0.1)} />
      <rect x="4" y="15" width="2.5" height="3.5" rx="1" fill={color} opacity={opacity * 0.7} />
      <rect x="13.5" y="15" width="2.5" height="3.5" rx="1" fill={color} opacity={opacity * 0.7} />
      {selected && (
        <rect x="0.5" y="0.5" width="19" height="19" rx="3.5" stroke={glowColor || '#ffffff'} strokeWidth="1.8" fill="none" />
      )}
    </svg>
  );
});

interface SvgSeatChairProps {
  cx: number;
  cy: number;
  size: number;
  color: string;
  opacity?: number;
  selected?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
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
  opacity = 0.9,
  selected = false,
  strokeColor,
  strokeWidth = 0,
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
  const half = size / 2;
  const s = size / 20;

  return (
    <g
      transform={`translate(${cx - half}, ${cy - half})`}
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
      <rect
        x={0} y={0}
        width={size} height={size}
        fill="transparent"
      />
      <rect x={4 * s} y={1 * s} width={12 * s} height={9 * s} rx={2.5 * s} fill={color} opacity={opacity} />
      <rect x={2 * s} y={10 * s} width={16 * s} height={5 * s} rx={2 * s} fill={color} opacity={Math.min(1, opacity + 0.1)} />
      <rect x={4 * s} y={15 * s} width={2.5 * s} height={3.5 * s} rx={1 * s} fill={color} opacity={opacity * 0.7} />
      <rect x={13.5 * s} y={15 * s} width={2.5 * s} height={3.5 * s} rx={1 * s} fill={color} opacity={opacity * 0.7} />
      {(selected || (strokeColor && strokeWidth > 0)) && (
        <rect
          x={0.5 * s} y={0.5 * s}
          width={19 * s} height={19 * s}
          rx={3.5 * s}
          stroke={strokeColor || '#ffffff'}
          strokeWidth={strokeWidth || 1.8 * s}
          fill="none"
        />
      )}
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
  const half = size / 2;
  const s = size / 20;

  return (
    <g transform={`translate(${cx - half}, ${cy - half})`} style={{ pointerEvents: 'none' }}>
      <rect x={4 * s} y={2 * s} width={12 * s} height={8 * s} rx={2 * s} fill={color} opacity={opacity} />
      <rect x={2 * s} y={10 * s} width={16 * s} height={5 * s} rx={1.5 * s} fill={color} opacity={opacity} />
      <rect x={4.5 * s} y={15 * s} width={2 * s} height={3 * s} rx={0.8 * s} fill={color} opacity={opacity * 0.6} />
      <rect x={13.5 * s} y={15 * s} width={2 * s} height={3 * s} rx={0.8 * s} fill={color} opacity={opacity * 0.6} />
    </g>
  );
});
