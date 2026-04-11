import React from 'react';
import type { SeatSection } from '../types/seats';

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
  const sx = section.position_x;
  const sy = section.position_y;
  const sw = section.width;
  const sh = section.height;

  const rotation = section.rotation || 0;
  const centerX = sx + sw / 2;
  const centerY = sy + sh / 2;

  const strokeColor = isSelected ? '#2563eb' : isHovered ? '#60a5fa' : '#cbd5e1';
  const strokeW = isSelected ? 2 : isHovered ? 1.5 : 0.8;

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
          fill={isHovered ? '#f1f5f9' : 'transparent'}
          stroke={strokeColor}
          strokeWidth={strokeW}
          strokeDasharray={isSelected ? 'none' : '6 3'}
          rx="3"
        />
        <text
          x={sx + 6} y={sy + 13}
          fill="#64748b" fontSize="11" fontWeight="600"
          className="pointer-events-none"
        >
          {section.name}
        </text>
        <text
          x={sx + sw - 6} y={sy + 13}
          fill="#94a3b8" fontSize="9" textAnchor="end"
          className="pointer-events-none"
        >
          {seatCount}
        </text>

        {seatCount === 0 && (
          <text
            x={sx + sw / 2} y={sy + sh / 2 + 4}
            textAnchor="middle" fill="#94a3b8" fontSize="10"
            className="pointer-events-none"
          >
            Geen stoelen
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
  if (prev.section.rotation !== next.section.rotation) return false;
  if (prev.seatCount !== next.seatCount) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isHovered !== next.isHovered) return false;
  if (prev.currentTool !== next.currentTool) return false;
  return true;
});
