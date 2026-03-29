import React, { useMemo } from 'react';
import type { SeatSection, Seat, SeatStatus } from '../types/seats';

const HEADER_H = 24;
const PAD = 10;

const STATUS_COLOR: Record<SeatStatus, string> = {
  available: '#22c55e',
  blocked: '#6b7280',
  reserved: '#f59e0b',
  sold: '#ef4444',
};

const STATUS_LABEL: Record<SeatStatus, string> = {
  available: 'Beschikbaar',
  blocked: 'Geblokkeerd',
  reserved: 'Gereserveerd',
  sold: 'Verkocht',
};

interface Props {
  section: SeatSection;
  seats: Seat[];
  zoom: number;
  isSelected: boolean;
  currentTool: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  renderResizeHandles: () => React.ReactNode;
}

function SeatSectionRendererInner({
  section,
  seats,
  isSelected,
  currentTool,
  onMouseDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  renderResizeHandles,
}: Props) {
  const isTribune = section.section_type === 'tribune';
  const seatCount = section.rows_count * section.seats_per_row;
  const sx = section.position_x;
  const sy = section.position_y;
  const sw = section.width;
  const sh = section.height;

  const seatPositions = useMemo(() => {
    if (seats.length === 0) return [];

    const bodyTop = sy + HEADER_H + PAD;
    const bodyH = sh - HEADER_H - PAD * 2;
    const bodyW = sw - PAD * 2;
    const centerX = sx + sw / 2;

    const minX = Math.min(...seats.map((s) => s.x_position));
    const maxX = Math.max(...seats.map((s) => s.x_position));
    const minY = Math.min(...seats.map((s) => s.y_position));
    const maxY = Math.max(...seats.map((s) => s.y_position));
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const useScaling = rangeX > bodyW || rangeY > bodyH;
    const scaleX = bodyW / rangeX;
    const scaleY = bodyH / rangeY;

    return seats.map((seat) => {
      let cx: number;
      let cy: number;
      if (useScaling) {
        cx = sx + PAD + (seat.x_position - minX) * scaleX;
        cy = bodyTop + (seat.y_position - minY) * scaleY;
      } else {
        cx = centerX + seat.x_position;
        cy = bodyTop + seat.y_position - minY;
        if (cy > sy + sh - PAD) cy = sy + sh - PAD;
      }
      return { ...seat, cx, cy };
    });
  }, [seats, sx, sy, sw, sh]);

  const seatRadius = useMemo(() => {
    if (seats.length === 0) return 4;
    const spacingX = sw / (section.seats_per_row || 1);
    const spacingY = (sh - HEADER_H - PAD * 2) / (section.rows_count || 1);
    const minSpacing = Math.min(spacingX, spacingY);
    return Math.max(2, Math.min(6, minSpacing * 0.35));
  }, [seats.length, sw, sh, section.seats_per_row, section.rows_count]);

  return (
    <g>
      <g
        onMouseDown={onMouseDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        style={{ cursor: currentTool === 'select' ? 'move' : 'default' }}
      >
        <rect
          x={sx} y={sy} width={sw} height={sh}
          fill={section.color} fillOpacity={0.12}
          stroke={isSelected ? '#ef4444' : section.color}
          strokeWidth={isSelected ? 3 : 2}
          strokeDasharray={isTribune ? 'none' : '8 4'}
          rx="6"
        />
        <rect
          x={sx} y={sy} width={sw} height={HEADER_H}
          fill={section.color} fillOpacity={0.4} rx="6"
        />
        <rect
          x={sx} y={sy + HEADER_H - 6}
          width={sw} height={6}
          fill={section.color} fillOpacity={0.4}
        />
        <text
          x={sx + 8} y={sy + 16}
          fill="white" fontSize="12" fontWeight="bold"
          className="pointer-events-none"
        >
          {isTribune ? 'T' : 'P'} {section.name}
        </text>
        <text
          x={sx + sw - 8} y={sy + 16}
          fill="rgba(255,255,255,0.7)" fontSize="10" textAnchor="end"
          className="pointer-events-none"
        >
          {seatCount} stoelen
        </text>

        {seats.length > 0 ? (
          seatPositions.map((sp) => (
            <circle
              key={sp.id}
              cx={sp.cx}
              cy={sp.cy}
              r={seatRadius}
              fill={STATUS_COLOR[sp.status as SeatStatus] || '#22c55e'}
              fillOpacity={0.9}
              stroke={sp.seat_type === 'vip' ? '#fbbf24' : 'rgba(0,0,0,0.3)'}
              strokeWidth={sp.seat_type === 'vip' ? 1.5 : 0.5}
              className="pointer-events-auto"
            >
              <title>Rij {sp.row_label} - Stoel {sp.seat_number} ({STATUS_LABEL[sp.status as SeatStatus] || sp.status})</title>
            </circle>
          ))
        ) : (
          <text
            x={sx + sw / 2} y={sy + sh / 2 + 4}
            textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11"
            className="pointer-events-none"
          >
            Geen stoelen — dubbelklik om te configureren
          </text>
        )}

        {section.price_category && (
          <rect
            x={sx} y={sy + sh - 20}
            width={sw} height={20}
            fill={section.color} fillOpacity={0.25} rx="0"
          />
        )}
        {section.price_category && (
          <text
            x={sx + 8} y={sy + sh - 6}
            fill="rgba(255,255,255,0.7)" fontSize="10"
            className="pointer-events-none"
          >
            {section.price_category} — EUR {section.price_amount.toFixed(2)}
          </text>
        )}
      </g>
      {renderResizeHandles()}
    </g>
  );
}

export const SeatSectionRenderer = React.memo(SeatSectionRendererInner, (prev, next) => {
  if (prev.section.id !== next.section.id) return false;
  if (prev.section.position_x !== next.section.position_x) return false;
  if (prev.section.position_y !== next.section.position_y) return false;
  if (prev.section.width !== next.section.width) return false;
  if (prev.section.height !== next.section.height) return false;
  if (prev.section.color !== next.section.color) return false;
  if (prev.section.name !== next.section.name) return false;
  if (prev.seats !== next.seats) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.currentTool !== next.currentTool) return false;
  return true;
});
