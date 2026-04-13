import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { MapPin, ArrowRight, ZoomIn, ZoomOut } from 'lucide-react';
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

interface SeatData {
  id: string;
  section_id: string;
  row_label: string;
  seat_number: number;
  x_position: number;
  y_position: number;
  status: string;
  ticket_type_id: string | null;
}

interface TicketTypeInfo {
  id: string;
  name: string;
  color: string | null;
  price: number;
}

interface ComputedSeat {
  cx: number;
  cy: number;
  row_label: string;
  seat_number: number;
  status: string;
  ticket_type_id: string | null;
  sectionId: string;
}

interface VenueMapProps {
  objects: FloorplanObject[];
  sections: SectionPreview[];
  seatDots: SeatData[];
  ticketTypes?: TicketTypeInfo[];
  onNavigateToSeatPicker?: () => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

const HEADER_H = 24;
const PAD = 10;
const SEAT_R = 3;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;

export function VenueMap({ objects, sections, seatDots, ticketTypes = [], onNavigateToSeatPicker }: VenueMapProps) {
  const { language, t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const ttMap = useMemo(() => {
    const m = new Map<string, TicketTypeInfo>();
    for (const tt of ticketTypes) m.set(tt.id, tt);
    return m;
  }, [ticketTypes]);

  const getObjectName = (obj: FloorplanObject) => {
    const langKey = `name_${language}` as keyof FloorplanObject;
    return (obj[langKey] as string) || obj.label || obj.name;
  };

  const computedSeats = useMemo(() => {
    const results: ComputedSeat[] = [];
    for (const section of sections) {
      const secSeats = seatDots.filter(s => s.section_id === section.id);
      if (secSeats.length === 0) continue;

      const sx = section.position_x;
      const sy = section.position_y;
      const sw = section.width;
      const sh = section.height;
      const bodyTop = sy + HEADER_H + PAD;
      const bodyH = Math.max(1, sh - HEADER_H - PAD * 2);
      const bodyW = Math.max(1, sw - PAD * 2);
      const bodyLeft = sx + PAD;

      const minX = Math.min(...secSeats.map(s => s.x_position));
      const maxX = Math.max(...secSeats.map(s => s.x_position));
      const minY = Math.min(...secSeats.map(s => s.y_position));
      const maxY = Math.max(...secSeats.map(s => s.y_position));
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;
      const scale = Math.min(bodyW / rangeX, bodyH / rangeY);
      const fittedW = rangeX * scale;
      const fittedH = rangeY * scale;
      const offsetX = bodyLeft + (bodyW - fittedW) / 2;
      const offsetY = bodyTop + (bodyH - fittedH) / 2;

      for (const seat of secSeats) {
        results.push({
          cx: offsetX + (seat.x_position - minX) * scale,
          cy: offsetY + (seat.y_position - minY) * scale,
          row_label: seat.row_label,
          seat_number: seat.seat_number,
          status: seat.status,
          ticket_type_id: seat.ticket_type_id,
          sectionId: section.id,
        });
      }
    }
    return results;
  }, [sections, seatDots]);

  const rowLabels = useMemo(() => {
    const rowMap = new Map<string, ComputedSeat[]>();
    for (const s of computedSeats) {
      const key = `${s.sectionId}::${s.row_label}`;
      if (!rowMap.has(key)) rowMap.set(key, []);
      rowMap.get(key)!.push(s);
    }
    const labels: { x: number; y: number; label: string }[] = [];
    for (const [, seats] of rowMap) {
      if (seats.length === 0) continue;
      let leftmost = seats[0];
      for (const s of seats) {
        if (s.cx < leftmost.cx) leftmost = s;
      }
      labels.push({ x: leftmost.cx - 14, y: leftmost.cy, label: leftmost.row_label });
    }
    return labels;
  }, [computedSeats]);

  const seatNumbers = useMemo(() => {
    const rowMap = new Map<string, ComputedSeat[]>();
    for (const s of computedSeats) {
      const key = `${s.sectionId}::${s.row_label}`;
      if (!rowMap.has(key)) rowMap.set(key, []);
      rowMap.get(key)!.push(s);
    }
    const nums: { cx: number; cy: number; num: number; light: boolean }[] = [];
    for (const [, seats] of rowMap) {
      if (seats.length === 0) continue;
      const sorted = [...seats].sort((a, b) => a.seat_number - b.seat_number);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const seatColor = getSeatColor(first, ttMap);
      const light = isLightColor(seatColor);
      nums.push({ cx: first.cx, cy: first.cy, num: first.seat_number, light });
      if (last.seat_number !== first.seat_number) {
        const lastColor = getSeatColor(last, ttMap);
        nums.push({ cx: last.cx, cy: last.cy, num: last.seat_number, light: isLightColor(lastColor) });
      }
    }
    return nums;
  }, [computedSeats, ttMap]);

  const sectionLabels = useMemo(() => {
    return sections.map(sec => {
      const secSeats = computedSeats.filter(s => s.sectionId === sec.id);
      if (secSeats.length === 0) {
        return { x: sec.position_x + sec.width / 2, y: sec.position_y + HEADER_H / 2, name: sec.name };
      }
      let minY = Infinity;
      let sumX = 0;
      let count = 0;
      for (const s of secSeats) {
        if (s.cy < minY) minY = s.cy;
        sumX += s.cx;
        count++;
      }
      return { x: sumX / count, y: minY - 12, name: sec.name };
    });
  }, [sections, computedSeats]);

  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const obj of objects) {
      minX = Math.min(minX, Number(obj.x));
      minY = Math.min(minY, Number(obj.y));
      maxX = Math.max(maxX, Number(obj.x) + Number(obj.width));
      maxY = Math.max(maxY, Number(obj.y) + Number(obj.height));
    }
    for (const sec of sections) {
      minX = Math.min(minX, sec.position_x);
      minY = Math.min(minY, sec.position_y);
      maxX = Math.max(maxX, sec.position_x + sec.width);
      maxY = Math.max(maxY, sec.position_y + sec.height);
    }
    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 1600, maxY: 1000 };
    const padX = (maxX - minX) * 0.06 + 30;
    const padY = (maxY - minY) * 0.06 + 30;
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
  }, [objects, sections]);

  const contentW = bounds.maxX - bounds.minX;
  const contentH = bounds.maxY - bounds.minY;

  const fitToView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => { fitToView(); }, [fitToView]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom(z => {
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      setPan(p => ({
        x: mx - (mx - p.x) * (nz / z),
        y: my - (my - p.y) * (nz / z),
      }));
      return nz;
    });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    setPan({
      x: panStart.current.x + (e.clientX - dragStart.current.x),
      y: panStart.current.y + (e.clientY - dragStart.current.y),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist.current !== null) {
        const factor = dist / lastPinchDist.current;
        setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor)));
      }
      lastPinchDist.current = dist;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
  }, []);

  const handleSeatHover = useCallback((e: React.MouseEvent, seat: ComputedSeat) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tt = seat.ticket_type_id ? ttMap.get(seat.ticket_type_id) : null;
    const price = tt ? `\u20AC${tt.price.toFixed(2)}` : '';
    const ttName = tt?.name || '';
    const parts = [`Rij ${seat.row_label} - Stoel ${seat.seat_number}`];
    if (ttName) parts.push(ttName);
    if (price) parts.push(price);
    if (seat.status === 'sold' || seat.status === 'reserved') parts.push('Verkocht');
    else if (seat.status === 'blocked') parts.push('Niet beschikbaar');
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 40,
      text: parts.join(' \u2022 '),
    });
  }, [ttMap]);

  const legendItems = useMemo(() => {
    const items: { color: string; label: string; count: number }[] = [];
    const ttCounts = new Map<string, number>();
    let blockedCount = 0;
    let soldCount = 0;

    for (const s of computedSeats) {
      if (s.status === 'blocked') { blockedCount++; continue; }
      if (s.status === 'sold' || s.status === 'reserved') { soldCount++; continue; }
      if (s.ticket_type_id) {
        ttCounts.set(s.ticket_type_id, (ttCounts.get(s.ticket_type_id) || 0) + 1);
      }
    }

    for (const tt of ticketTypes) {
      const count = ttCounts.get(tt.id) || 0;
      if (count > 0) {
        items.push({
          color: tt.color || '#22c55e',
          label: `${tt.name} - \u20AC${tt.price.toFixed(2)}`,
          count,
        });
      }
    }

    const availWithoutTT = computedSeats.filter(s => s.status === 'available' && !s.ticket_type_id).length;
    if (availWithoutTT > 0) {
      items.push({ color: '#22c55e', label: 'Beschikbaar', count: availWithoutTT });
    }

    if (soldCount > 0) items.push({ color: '#ef4444', label: 'Verkocht', count: soldCount });
    if (blockedCount > 0) items.push({ color: '#6b7280', label: 'Niet beschikbaar', count: blockedCount });

    return items;
  }, [computedSeats, ticketTypes]);

  const viewBox = `${bounds.minX} ${bounds.minY} ${contentW} ${contentH}`;
  const viewScale = zoom;

  if (objects.length === 0 && sections.length === 0) return null;

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/40">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-white tracking-wide">{t('tickets.venueMap').toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.3))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.3))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={fitToView}
            className="ml-1 px-2 py-1 rounded-lg text-[11px] text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
        style={{ height: 420, touchAction: 'none' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { handlePointerUp(); setTooltip(null); }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <svg
          viewBox={viewBox}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
          style={{
            transform: `scale(${viewScale}) translate(${pan.x / viewScale}px, ${pan.y / viewScale}px)`,
            transformOrigin: 'center center',
          }}
        >
          <rect x={bounds.minX} y={bounds.minY} width={contentW} height={contentH} fill="#0f172a" />

          {objects.map((obj) => {
            const ox = Number(obj.x);
            const oy = Number(obj.y);
            const ow = Number(obj.width);
            const oh = Number(obj.height);
            const objType = (obj.type || '').toUpperCase();
            const isDancefloor = objType === 'DANCEFLOOR';
            const isTribune = objType === 'TRIBUNE';
            const isStage = objType === 'STAGE' || objType === 'PODIUM';
            const displayName = getObjectName(obj);

            return (
              <g key={obj.id} style={{ pointerEvents: 'none' }}>
                {isStage ? (
                  <>
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill="#1e293b" stroke="#475569" strokeWidth={2} rx={10}
                    />
                    <text
                      x={ox + ow / 2} y={oy + oh / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill="#94a3b8" fontSize={obj.font_size || Math.min(28, ow * 0.12)}
                      fontWeight="700" letterSpacing="0.3em"
                    >
                      {displayName.toUpperCase()}
                    </text>
                  </>
                ) : (
                  <>
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill={obj.color || '#374151'}
                      stroke={isTribune ? '#78350f' : 'rgba(71,85,105,0.4)'}
                      strokeWidth={1.5} rx={4}
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
                  </>
                )}
              </g>
            );
          })}

          {sections.map((section) => {
            const color = section.color || '#06b6d4';
            return (
              <g key={section.id} style={{ pointerEvents: 'none' }}>
                <rect
                  x={section.position_x} y={section.position_y}
                  width={section.width} height={section.height}
                  rx={6}
                  fill={hexToRgba(color, 0.08)}
                  stroke={hexToRgba(color, 0.25)}
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {computedSeats.map((seat, i) => {
            const color = getSeatColor(seat, ttMap);
            return (
              <circle
                key={i}
                cx={seat.cx} cy={seat.cy} r={SEAT_R}
                fill={color}
                opacity={seat.status === 'available' ? 0.9 : seat.status === 'blocked' ? 0.4 : 0.6}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => handleSeatHover(e, seat)}
                onMouseMove={(e) => handleSeatHover(e, seat)}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}

          {viewScale > 0.8 && rowLabels.map((rl, i) => (
            <text
              key={`rl-${i}`}
              x={rl.x} y={rl.y}
              textAnchor="end" dominantBaseline="central"
              fill="#94a3b8"
              fontSize={Math.max(6, Math.min(10, 8 / Math.sqrt(viewScale)))}
              fontWeight="600"
              fontFamily="monospace"
              style={{ pointerEvents: 'none' }}
            >
              {rl.label}
            </text>
          ))}

          {viewScale > 1.5 && seatNumbers.map((sn, i) => (
            <text
              key={`sn-${i}`}
              x={sn.cx} y={sn.cy + SEAT_R + 6}
              textAnchor="middle" dominantBaseline="central"
              fill={sn.light ? '#1e293b' : '#cbd5e1'}
              fontSize={Math.max(4, Math.min(7, 5 / Math.sqrt(viewScale)))}
              fontWeight="500"
              style={{ pointerEvents: 'none' }}
            >
              {sn.num}
            </text>
          ))}

          {viewScale > 0.7 && sectionLabels.map((sl, i) => (
            <g key={`sl-${i}`} style={{ pointerEvents: 'none' }}>
              <rect
                x={sl.x - sl.name.length * 3 - 6}
                y={sl.y - 7}
                width={sl.name.length * 6 + 12}
                height={14}
                rx={4}
                fill="rgba(15,23,42,0.85)"
              />
              <text
                x={sl.x} y={sl.y}
                textAnchor="middle" dominantBaseline="central"
                fill="white"
                fontSize={9}
                fontWeight="700"
              >
                {sl.name}
              </text>
            </g>
          ))}
        </svg>

        {tooltip && (
          <div
            className="absolute z-50 pointer-events-none px-2.5 py-1.5 bg-slate-900/95 border border-slate-600/50 rounded-lg shadow-xl"
            style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}
          >
            <span className="text-[11px] text-slate-200 whitespace-nowrap">{tooltip.text}</span>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-slate-700/40 space-y-2.5">
        {legendItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {legendItems.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[11px] text-slate-400">
                  {item.label}
                  <span className="text-slate-500 ml-1">({item.count})</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {onNavigateToSeatPicker && (
          <button
            onClick={onNavigateToSeatPicker}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Kies je stoelen
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function getSeatColor(seat: ComputedSeat, ttMap: Map<string, TicketTypeInfo>): string {
  if (seat.status === 'blocked') return '#6b7280';
  if (seat.status === 'sold' || seat.status === 'reserved') return '#ef4444';
  if (seat.ticket_type_id) {
    const tt = ttMap.get(seat.ticket_type_id);
    if (tt?.color) return tt.color;
  }
  return '#22c55e';
}
