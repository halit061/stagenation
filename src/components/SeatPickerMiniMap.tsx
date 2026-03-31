import { useMemo, memo } from 'react';
import type { SeatSection } from '../types/seats';
import type { FloorplanObject } from '../services/seatPickerService';

interface Props {
  sections: SeatSection[];
  floorplanObjects?: FloorplanObject[];
  canvasWidth?: number;
  canvasHeight?: number;
  viewport: { x: number; y: number; w: number; h: number } | null;
}

const MINI_W = 140;
const MINI_H = 90;

export const SeatPickerMiniMap = memo(function SeatPickerMiniMap({ sections, floorplanObjects = [], viewport }: Props) {
  const bounds = useMemo(() => {
    if (sections.length === 0 && floorplanObjects.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const sec of sections) {
      minX = Math.min(minX, sec.position_x);
      minY = Math.min(minY, sec.position_y);
      maxX = Math.max(maxX, sec.position_x + sec.width);
      maxY = Math.max(maxY, sec.position_y + sec.height);
    }
    for (const obj of floorplanObjects) {
      minX = Math.min(minX, Number(obj.x));
      minY = Math.min(minY, Number(obj.y));
      maxX = Math.max(maxX, Number(obj.x) + Number(obj.width));
      maxY = Math.max(maxY, Number(obj.y) + Number(obj.height));
    }
    if (minX === Infinity) return null;
    return { minX: minX - 20, minY: minY - 20, maxX: maxX + 20, maxY: maxY + 20 };
  }, [sections, floorplanObjects]);

  if (!bounds || !viewport) return null;

  const bW = bounds.maxX - bounds.minX;
  const bH = bounds.maxY - bounds.minY;
  const scaleX = MINI_W / bW;
  const scaleY = MINI_H / bH;
  const scale = Math.min(scaleX, scaleY);

  return (
    <div className="absolute top-3 left-3 z-10 pointer-events-none" aria-hidden="true">
      <div className="bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-lg p-1.5 shadow-lg">
        <svg width={MINI_W} height={MINI_H} role="img" aria-label="Minimap overview">
          {floorplanObjects.map(obj => (
            <rect
              key={obj.id}
              x={(Number(obj.x) - bounds.minX) * scale}
              y={(Number(obj.y) - bounds.minY) * scale}
              width={Number(obj.width) * scale}
              height={Number(obj.height) * scale}
              fill={obj.color || '#6b7280'}
              fillOpacity={0.25}
              rx={0.5}
            />
          ))}
          {sections.map(sec => (
            <rect
              key={sec.id}
              x={(sec.position_x - bounds.minX) * scale}
              y={(sec.position_y - bounds.minY) * scale}
              width={sec.width * scale}
              height={sec.height * scale}
              fill={sec.color}
              fillOpacity={0.3}
              stroke={sec.color}
              strokeWidth={0.5}
              strokeOpacity={0.5}
              rx={1}
            />
          ))}
          <rect
            x={Math.max(0, (viewport.x - bounds.minX) * scale)}
            y={Math.max(0, (viewport.y - bounds.minY) * scale)}
            width={Math.min(MINI_W, viewport.w * scale)}
            height={Math.min(MINI_H, viewport.h * scale)}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1.5}
            rx={1}
            opacity={0.8}
          />
        </svg>
      </div>
    </div>
  );
});
