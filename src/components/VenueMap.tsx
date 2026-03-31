import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface FloorplanObject {
  id: string;
  type: string;
  name: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  is_active: boolean;
  is_visible?: boolean;
  font_size?: number;
  font_color?: string;
  font_weight?: string;
  name_nl?: string;
  name_tr?: string;
  name_fr?: string;
  name_de?: string;
}

interface SectionPreview {
  id: string;
  name: string;
  color: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
}

interface SeatDot {
  section_id: string;
  x_position: number;
  y_position: number;
  status: string;
}

interface VenueMapProps {
  objects: FloorplanObject[];
  sections: SectionPreview[];
  seatDots: SeatDot[];
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

const HEADER_H = 24;
const PAD = 10;
const DOT_R = 1.8;

export function VenueMap({ objects, sections, seatDots }: VenueMapProps) {
  const { language, t } = useLanguage();

  const getObjectName = (obj: FloorplanObject) => {
    const langKey = `name_${language}` as keyof FloorplanObject;
    return (obj[langKey] as string) || obj.label || obj.name;
  };

  const allElements = useMemo(() => [
    ...objects.map(o => ({ x: Number(o.x), y: Number(o.y), w: Number(o.width), h: Number(o.height) })),
    ...sections.map(s => ({ x: s.position_x, y: s.position_y, w: s.width, h: s.height })),
  ], [objects, sections]);

  const seatsBySectionMap = useMemo(() => {
    const map = new Map<string, SeatDot[]>();
    for (const dot of seatDots) {
      if (!map.has(dot.section_id)) map.set(dot.section_id, []);
      map.get(dot.section_id)!.push(dot);
    }
    return map;
  }, [seatDots]);

  const computedDots = useMemo(() => {
    const results: { cx: number; cy: number; available: boolean }[] = [];
    for (const section of sections) {
      const dots = seatsBySectionMap.get(section.id);
      if (!dots || dots.length === 0) continue;
      const sx = section.position_x;
      const sy = section.position_y;
      const sw = section.width;
      const sh = section.height;
      const bodyTop = sy + HEADER_H + PAD;
      const bodyH = sh - HEADER_H - PAD * 2;
      const bodyW = sw - PAD * 2;
      const bodyLeft = sx + PAD;

      const minX = Math.min(...dots.map(d => d.x_position));
      const maxX = Math.max(...dots.map(d => d.x_position));
      const minY = Math.min(...dots.map(d => d.y_position));
      const maxY = Math.max(...dots.map(d => d.y_position));
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;
      const scaleX = bodyW / rangeX;
      const scaleY = bodyH / rangeY;
      const scale = Math.min(scaleX, scaleY);
      const fittedW = rangeX * scale;
      const fittedH = rangeY * scale;
      const offsetX = bodyLeft + (bodyW - fittedW) / 2;
      const offsetY = bodyTop + (bodyH - fittedH) / 2;

      for (const dot of dots) {
        results.push({
          cx: offsetX + (dot.x_position - minX) * scale,
          cy: offsetY + (dot.y_position - minY) * scale,
          available: dot.status === 'available',
        });
      }
    }
    return results;
  }, [sections, seatsBySectionMap]);

  if (allElements.length === 0) return null;

  const padding = 40;
  const minX = Math.min(...allElements.map(e => e.x)) - padding;
  const minY = Math.min(...allElements.map(e => e.y)) - padding;
  const maxX = Math.max(...allElements.map(e => e.x + e.w)) + padding;
  const maxY = Math.max(...allElements.map(e => e.y + e.h)) + padding;
  const viewbox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/40">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-white tracking-wide">{t('tickets.venueMap').toUpperCase()}</span>
        </div>
      </div>

      <div className="px-4 py-4">
        <svg viewBox={viewbox} className="w-full max-h-[360px]" preserveAspectRatio="xMidYMid meet">
          <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="#0f172a" rx="8" />

          {objects.map((obj) => {
            const ox = Number(obj.x);
            const oy = Number(obj.y);
            const ow = Number(obj.width);
            const oh = Number(obj.height);
            const objType = (obj.type || '').toUpperCase();
            const isDancefloor = objType === 'DANCEFLOOR';
            const isTribune = objType === 'TRIBUNE';
            const displayName = getObjectName(obj);

            return (
              <g key={obj.id}>
                <rect
                  x={ox} y={oy} width={ow} height={oh}
                  fill={obj.color}
                  stroke={isTribune ? '#78350f' : 'rgba(71,85,105,0.4)'}
                  strokeWidth={1.5}
                  rx={4}
                  opacity={isDancefloor ? 0.3 : 0.9}
                />
                {isTribune && [0.2, 0.4, 0.6, 0.8].map((frac) => (
                  <line key={frac}
                    x1={ox + ow * frac} y1={oy + 4}
                    x2={ox + ow * frac} y2={oy + oh - 4}
                    stroke="rgba(0,0,0,0.2)" strokeWidth={1}
                  />
                ))}
                <text
                  x={ox + ow / 2} y={oy + oh / 2}
                  textAnchor="middle" dominantBaseline="central"
                  fill={obj.font_color || 'white'}
                  fontSize={obj.font_size || 14}
                  fontWeight={obj.font_weight || 'bold'}
                  letterSpacing="0.05em" pointerEvents="none"
                  opacity={isDancefloor ? 0.6 : 1}
                >
                  {displayName.toUpperCase()}
                </text>
              </g>
            );
          })}

          {sections.map((section) => {
            const color = section.color || '#06b6d4';
            return (
              <g key={section.id}>
                <rect
                  x={section.position_x} y={section.position_y}
                  width={section.width} height={section.height}
                  rx={6}
                  fill={hexToRgba(color, 0.15)}
                  stroke={hexToRgba(color, 0.4)}
                  strokeWidth={1}
                />
                <rect
                  x={section.position_x} y={section.position_y}
                  width={section.width} height={HEADER_H}
                  rx={6}
                  fill={hexToRgba(color, 0.25)}
                />
                <rect
                  x={section.position_x} y={section.position_y + HEADER_H - 3}
                  width={section.width} height={3}
                  fill={hexToRgba(color, 0.25)}
                />
                <text
                  x={section.position_x + section.width / 2}
                  y={section.position_y + HEADER_H / 2}
                  textAnchor="middle" dominantBaseline="central"
                  fill="rgba(255,255,255,0.8)" fontSize={11} fontWeight={700}
                  pointerEvents="none"
                >
                  {section.name}
                </text>
              </g>
            );
          })}

          {computedDots.map((dot, i) => (
            <circle
              key={i}
              cx={dot.cx} cy={dot.cy} r={DOT_R}
              fill={dot.available ? '#22c55e' : '#ef4444'}
              opacity={dot.available ? 0.85 : 0.6}
            />
          ))}
        </svg>
      </div>

      {sections.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-5 py-3 border-t border-slate-700/40">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            <span className="text-[11px] text-slate-400">Beschikbaar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            <span className="text-[11px] text-slate-400">Verkocht</span>
          </div>
        </div>
      )}
    </div>
  );
}
