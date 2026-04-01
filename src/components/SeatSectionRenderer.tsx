import React from 'react';
import type { SeatSection } from '../types/seats';

const HEADER_H = 24;

interface Props {
  section: SeatSection;
  seatCount: number;
  isSelected: boolean;
  isHovered?: boolean;
  currentTool: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  renderResizeHandles: () => React.ReactNode;
}

function SeatSectionRendererInner({
  section,
  seatCount,
  isSelected,
  isHovered = false,
  currentTool,
  onMouseDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  renderResizeHandles,
}: Props) {
  const isTribune = section.section_type === 'tribune';
  const sx = section.position_x;
  const sy = section.position_y;
  const sw = section.width;
  const sh = section.height;

  const rotation = section.rotation || 0;
  const centerX = sx + sw / 2;
  const centerY = sy + sh / 2;

  const strokeColor = isSelected ? '#3b82f6' : isHovered ? '#60a5fa' : section.color;
  const strokeW = isSelected ? 2.5 : isHovered ? 2 : 1.5;

  return (
    <g style={rotation ? { transform: `rotate(${rotation}deg)`, transformOrigin: `${centerX}px ${centerY}px` } : undefined}>
      <g
        onMouseDown={onMouseDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ cursor: currentTool === 'select' ? 'grab' : 'default' }}
      >
        <rect
          x={sx} y={sy} width={sw} height={sh}
          fill={section.color} fillOpacity={isHovered ? 0.18 : 0.12}
          stroke={strokeColor}
          strokeWidth={strokeW}
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

        {seatCount === 0 && (
          <text
            x={sx + sw / 2} y={sy + sh / 2 + 4}
            textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11"
            className="pointer-events-none"
          >
            Geen stoelen — dubbelklik om te configureren
          </text>
        )}

        {section.price_category && (
          <>
            <rect
              x={sx} y={sy + sh - 20}
              width={sw} height={20}
              fill={section.color} fillOpacity={0.25} rx="0"
            />
            <text
              x={sx + 8} y={sy + sh - 6}
              fill="rgba(255,255,255,0.7)" fontSize="10"
              className="pointer-events-none"
            >
              {section.price_category} — EUR {section.price_amount.toFixed(2)}
            </text>
          </>
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
  if (prev.section.rotation !== next.section.rotation) return false;
  if (prev.seatCount !== next.seatCount) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isHovered !== next.isHovered) return false;
  if (prev.currentTool !== next.currentTool) return false;
  return true;
});
