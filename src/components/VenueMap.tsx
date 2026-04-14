import { useMemo, useRef, useState, useCallback, useEffect, memo } from 'react';
import { MapPin, ArrowRight, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { SvgSeatChair } from './SeatIcon';
import type { Seat, SeatSection } from '../types/seats';
import type { FloorplanObject, TicketTypeColor } from '../services/seatPickerService';

interface PickerSeat extends Seat {
  cx: number;
  cy: number;
  sectionId: string;
}

interface VenueMapProps {
  sections: SeatSection[];
  seats: Seat[];
  floorplanObjects: FloorplanObject[];
  ticketTypeColors: TicketTypeColor[];
  onNavigateToSeatPicker?: () => void;
}

const HEADER_H = 24;
const PAD = 10;
const SEAT_SIZE = 56;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5;
const ZOOM_STEP_FACTOR = 1.4;

function computePickerSeats(section: SeatSection, seats: Seat[]): PickerSeat[] {
  if (seats.length === 0) return [];
  const sx = section.position_x;
  const sy = section.position_y;
  const sw = section.width;
  const sh = section.height;
  const bodyTop = sy + HEADER_H + PAD;
  const bodyH = Math.max(1, sh - HEADER_H - PAD * 2);
  const bodyW = Math.max(1, sw - PAD * 2);
  const bodyLeft = sx + PAD;

  const xPositions = seats.map(s => s.x_position);
  const yPositions = seats.map(s => s.y_position);
  const minX = Math.min(...xPositions);
  const maxX = Math.max(...xPositions);
  const minY = Math.min(...yPositions);
  const maxY = Math.max(...yPositions);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min(bodyW / rangeX, bodyH / rangeY);
  const fittedW = rangeX * scale;
  const fittedH = rangeY * scale;
  const offsetX = bodyLeft + (bodyW - fittedW) / 2;
  const offsetY = bodyTop + (bodyH - fittedH) / 2;

  const clampMinX = sx + 2;
  const clampMaxX = sx + sw - 2;
  const clampMinY = sy + HEADER_H + 2;
  const clampMaxY = sy + sh - 2;

  return seats.map(seat => {
    const rawCx = offsetX + (seat.x_position - minX) * scale;
    const rawCy = offsetY + (seat.y_position - minY) * scale;
    const cx = Math.max(clampMinX, Math.min(clampMaxX, rawCx));
    const cy = Math.max(clampMinY, Math.min(clampMaxY, rawCy));
    return { ...seat, cx, cy, sectionId: section.id };
  });
}

export const VenueMap = memo(function VenueMap({
  sections,
  seats,
  floorplanObjects,
  ticketTypeColors,
  onNavigateToSeatPicker,
}: VenueMapProps) {
  const { language, t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const ttColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const tt of ticketTypeColors) {
      if (tt.color) m[tt.id] = tt.color;
    }
    return m;
  }, [ticketTypeColors]);

  const ttInfoMap = useMemo(() => {
    const m = new Map<string, TicketTypeColor>();
    for (const tt of ticketTypeColors) m.set(tt.id, tt);
    return m;
  }, [ticketTypeColors]);

  const computedSeats = useMemo(() => {
    if (!seats || seats.length === 0) return [];
    const results: PickerSeat[] = [];
    for (const sec of sections) {
      const secSeats = seats.filter(s => s.section_id === sec.id);
      results.push(...computePickerSeats(sec, secSeats));
    }
    return results;
  }, [sections, seats]);

  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const half = SEAT_SIZE / 2;
    for (const s of computedSeats) {
      minX = Math.min(minX, s.cx - half);
      minY = Math.min(minY, s.cy - half);
      maxX = Math.max(maxX, s.cx + half);
      maxY = Math.max(maxY, s.cy + half);
    }
    for (const obj of floorplanObjects) {
      minX = Math.min(minX, Number(obj.x));
      minY = Math.min(minY, Number(obj.y));
      maxX = Math.max(maxX, Number(obj.x) + Number(obj.width));
      maxY = Math.max(maxY, Number(obj.y) + Number(obj.height));
    }
    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 1600, maxY: 1000 };
    return { minX, minY, maxX, maxY };
  }, [computedSeats, floorplanObjects]);

  const fitToOverview = useCallback(() => {
    if (!containerRef.current) return null;
    if (bounds.minX === Infinity) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const pad = 60;
    const contentW = bounds.maxX - bounds.minX + pad * 2;
    const contentH = bounds.maxY - bounds.minY + pad * 2;
    const fitZoom = Math.min(rect.width / contentW, rect.height / contentH, 2);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    return {
      zoom: fitZoom,
      panX: rect.width / 2 - centerX * fitZoom,
      panY: rect.height / 2 - centerY * fitZoom,
    };
  }, [bounds]);

  useEffect(() => {
    if (computedSeats.length === 0 && floorplanObjects.length === 0) return;
    const fit = fitToOverview();
    if (fit) {
      setZoom(fit.zoom);
      setPan({ x: fit.panX, y: fit.panY });
    }
  }, [computedSeats.length, floorplanObjects.length, fitToOverview]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (computedSeats.length === 0 && floorplanObjects.length === 0) return;
      const fit = fitToOverview();
      if (fit) {
        setZoom(fit.zoom);
        setPan({ x: fit.panX, y: fit.panY });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [computedSeats.length, floorplanObjects.length, fitToOverview]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom(prev => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev * factor));
        const s = newZoom / prev;
        setPan(p => ({ x: cx - s * (cx - p.x), y: cy - s * (cy - p.y) }));
        return newZoom;
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { x: pan.x, y: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan({
      x: panStart.current.x + (e.clientX - dragStart.current.x),
      y: panStart.current.y + (e.clientY - dragStart.current.y),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      lastPinchDist.current = d;
      lastTouchPos.current = null;
    } else if (e.touches.length === 1) {
      lastTouchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const scale = d / lastPinchDist.current;
      lastPinchDist.current = d;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const cx = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
      const cy = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * scale));
      const s = newZoom / zoom;
      setPan(prev => ({ x: cx - s * (cx - prev.x), y: cy - s * (cy - prev.y) }));
      setZoom(newZoom);
      lastTouchPos.current = null;
    } else if (e.touches.length === 1 && lastTouchPos.current) {
      const dx = e.touches[0].clientX - lastTouchPos.current.x;
      const dy = e.touches[0].clientY - lastTouchPos.current.y;
      lastTouchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
  }, [zoom]);

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
    lastTouchPos.current = null;
  }, []);

  const handleFit = useCallback(() => {
    const fit = fitToOverview();
    if (fit) {
      setZoom(fit.zoom);
      setPan({ x: fit.panX, y: fit.panY });
    }
  }, [fitToOverview]);

  const handleZoomIn = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newZoom = Math.min(MAX_ZOOM, zoom * ZOOM_STEP_FACTOR);
    const s = newZoom / zoom;
    setPan(p => ({ x: cx - s * (cx - p.x), y: cy - s * (cy - p.y) }));
    setZoom(newZoom);
  }, [zoom]);

  const handleZoomOut = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newZoom = Math.max(MIN_ZOOM, zoom / ZOOM_STEP_FACTOR);
    const s = newZoom / zoom;
    setPan(p => ({ x: cx - s * (cx - p.x), y: cy - s * (cy - p.y) }));
    setZoom(newZoom);
  }, [zoom]);

  const seatsBySection = useMemo(() => {
    const map = new Map<string, PickerSeat[]>();
    for (const seat of computedSeats) {
      if (!map.has(seat.sectionId)) map.set(seat.sectionId, []);
      map.get(seat.sectionId)!.push(seat);
    }
    return map;
  }, [computedSeats]);

  const rowLabelsBySection = useMemo(() => {
    const map = new Map<string, { label: string; y: number; minX: number }[]>();
    for (const [secId, secSeats] of seatsBySection) {
      const rowMap = new Map<string, { minY: number; maxY: number; minCx: number }>();
      for (const s of secSeats) {
        const existing = rowMap.get(s.row_label);
        if (existing) {
          existing.minY = Math.min(existing.minY, s.cy);
          existing.maxY = Math.max(existing.maxY, s.cy);
          existing.minCx = Math.min(existing.minCx, s.cx);
        } else {
          rowMap.set(s.row_label, { minY: s.cy, maxY: s.cy, minCx: s.cx });
        }
      }
      const labels: { label: string; y: number; minX: number }[] = [];
      for (const [label, info] of rowMap) {
        labels.push({ label, y: (info.minY + info.maxY) / 2, minX: info.minCx });
      }
      map.set(secId, labels);
    }
    return map;
  }, [seatsBySection]);

  const handleSeatHover = useCallback((seat: PickerSeat, e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tt = seat.ticket_type_id ? ttInfoMap.get(seat.ticket_type_id) : null;
    const parts = [`Rij ${seat.row_label} - Stoel ${seat.seat_number}`];
    if (tt?.name) parts.push(tt.name);
    if (tt?.price) parts.push(`\u20AC${tt.price.toFixed(2)}`);
    if (seat.status === 'sold' || seat.status === 'reserved') parts.push('Verkocht');
    else if (seat.status === 'blocked') parts.push('Niet beschikbaar');
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 40,
      text: parts.join(' \u2022 '),
    });
  }, [ttInfoMap]);

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

    for (const tt of ticketTypeColors) {
      const count = ttCounts.get(tt.id) || 0;
      if (count > 0) {
        items.push({
          color: tt.color || '#4ade80',
          label: `${tt.name} - \u20AC${tt.price.toFixed(2)}`,
          count,
        });
      }
    }

    const availWithoutTT = computedSeats.filter(s => s.status === 'available' && !s.ticket_type_id).length;
    if (availWithoutTT > 0) {
      items.push({ color: '#4ade80', label: 'Beschikbaar', count: availWithoutTT });
    }

    if (soldCount > 0) items.push({ color: '#f87171', label: 'Verkocht', count: soldCount });
    if (blockedCount > 0) items.push({ color: '#d1d5db', label: 'Niet beschikbaar', count: blockedCount });

    return items;
  }, [computedSeats, ticketTypeColors]);

  if (floorplanObjects.length === 0 && sections.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-700" />
          <span className="text-sm font-bold text-slate-800 tracking-wide">{t('tickets.venueMap').toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleFit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Overzicht"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-hidden cursor-grab active:cursor-grabbing select-none bg-white h-[280px] sm:h-[380px] lg:h-[500px]"
        style={{ touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setTooltip(null); }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <svg
          width="100%"
          height="100%"
          style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {bounds.minX !== Infinity && (
              <rect
                x={bounds.minX - 400}
                y={bounds.minY - 400}
                width={bounds.maxX - bounds.minX + 800}
                height={bounds.maxY - bounds.minY + 800}
                fill="#ffffff"
              />
            )}

            {floorplanObjects.map(obj => {
              const ox = Number(obj.x);
              const oy = Number(obj.y);
              const ow = Number(obj.width);
              const oh = Number(obj.height);
              const objType = (obj.type || '').toUpperCase();
              const isDancefloor = objType === 'DANCEFLOOR';
              const isTribune = objType === 'TRIBUNE';
              const isStage = objType === 'STAGE' || objType === 'PODIUM';
              const isBar = objType === 'BAR';
              const displayName = obj.name || obj.type || 'Object';

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
                        fill="#94a3b8"
                        fontSize={obj.font_size || Math.min(28, ow * 0.12)}
                        fontWeight="700" letterSpacing="0.3em"
                      >
                        {displayName.toUpperCase()}
                      </text>
                    </>
                  ) : isBar ? (
                    <>
                      <rect
                        x={ox} y={oy} width={ow} height={oh}
                        fill="#1e293b" stroke="#475569" strokeWidth={1.5} rx={6}
                      />
                      <text
                        x={ox + ow / 2} y={oy + oh / 2}
                        textAnchor="middle" dominantBaseline="central"
                        fill="#94a3b8"
                        fontSize={obj.font_size || 14}
                        fontWeight="600" letterSpacing="0.15em"
                      >
                        {displayName.toUpperCase()}
                      </text>
                    </>
                  ) : isTribune ? (
                    <>
                      <rect
                        x={ox} y={oy} width={ow} height={oh}
                        fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} rx={6}
                      />
                      <text
                        x={ox + ow / 2} y={oy + oh / 2}
                        textAnchor="middle" dominantBaseline="central"
                        fill="#475569"
                        fontSize={obj.font_size || 13}
                        fontWeight="600" letterSpacing="0.08em"
                      >
                        {displayName.toUpperCase()}
                      </text>
                    </>
                  ) : isDancefloor ? (
                    <>
                      <rect
                        x={ox} y={oy} width={ow} height={oh}
                        fill="#1e293b" stroke="#475569" strokeWidth={1.5} rx={8}
                        opacity={0.85}
                      />
                      <text
                        x={ox + ow / 2} y={oy + oh / 2}
                        textAnchor="middle" dominantBaseline="central"
                        fill="#94a3b8"
                        fontSize={obj.font_size || 14}
                        fontWeight="600" letterSpacing="0.12em"
                      >
                        {displayName.toUpperCase()}
                      </text>
                    </>
                  ) : (
                    <>
                      <rect
                        x={ox} y={oy} width={ow} height={oh}
                        fill="#1e293b" stroke="#475569" strokeWidth={1} rx={6}
                        opacity={0.9}
                      />
                      <text
                        x={ox + ow / 2} y={oy + oh / 2}
                        textAnchor="middle" dominantBaseline="central"
                        fill="#94a3b8"
                        fontSize={obj.font_size || 13}
                        fontWeight="600" letterSpacing="0.05em"
                      >
                        {displayName.toUpperCase()}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {sections.map(section => {
              const secSeats = seatsBySection.get(section.id) || [];
              const rowLabels = rowLabelsBySection.get(section.id) || [];
              const color = section.color || '#3b82f6';

              return (
                <g key={section.id} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={section.position_x}
                    y={section.position_y}
                    width={section.width}
                    height={section.height}
                    rx={8}
                    fill={color}
                    fillOpacity={0.05}
                    stroke={color}
                    strokeWidth={1}
                    strokeOpacity={0.15}
                  />

                  <text
                    x={section.position_x + section.width / 2}
                    y={section.position_y + 14}
                    textAnchor="middle"
                    fill={color}
                    fillOpacity={0.6}
                    fontSize="11"
                    fontWeight="600"
                    letterSpacing="0.04em"
                  >
                    {section.name}
                  </text>

                  {rowLabels.map(rl => (
                    <text
                      key={rl.label}
                      x={rl.minX - SEAT_SIZE / 2 - 8}
                      y={rl.y}
                      textAnchor="end"
                      dominantBaseline="central"
                      fill="#94a3b8"
                      fontSize={9}
                      fontWeight={600}
                    >
                      {rl.label}
                    </text>
                  ))}

                  {secSeats.map(seat => {
                    const isBlocked = seat.status === 'blocked';
                    const isSold = seat.status === 'sold';
                    const isReserved = seat.status === 'reserved';
                    const isAvailable = seat.status === 'available';

                    let fillColor: string;
                    let borderColor: string;
                    let fillOpacity = 1;

                    if (isSold) {
                      fillColor = '#f87171';
                      borderColor = '#dc2626';
                      fillOpacity = 0.85;
                    } else if (isReserved) {
                      fillColor = '#fb923c';
                      borderColor = '#ea580c';
                      fillOpacity = 0.9;
                    } else if (isBlocked) {
                      fillColor = '#d1d5db';
                      borderColor = '#9ca3af';
                      fillOpacity = 0.5;
                    } else if (isAvailable) {
                      const ttColor = seat.ticket_type_id ? ttColorMap[seat.ticket_type_id] : null;
                      if (ttColor) {
                        fillColor = ttColor;
                        borderColor = ttColor;
                      } else {
                        fillColor = '#4ade80';
                        borderColor = '#16a34a';
                      }
                    } else {
                      fillColor = '#4ade80';
                      borderColor = '#16a34a';
                    }

                    return (
                      <SvgSeatChair
                        key={seat.id}
                        cx={seat.cx}
                        cy={seat.cy}
                        size={SEAT_SIZE}
                        color={fillColor}
                        opacity={fillOpacity}
                        strokeColor={borderColor}
                        strokeWidth={2}
                        style={{ cursor: 'default', pointerEvents: 'all' }}
                        onPointerEnter={(e) => handleSeatHover(seat, e)}
                        onPointerLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>

        {tooltip && (
          <div
            className="absolute z-50 pointer-events-none px-2.5 py-1.5 bg-slate-800 border border-slate-600/50 rounded-lg shadow-xl"
            style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}
          >
            <span className="text-[11px] text-white whitespace-nowrap">{tooltip.text}</span>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-slate-200 space-y-2.5">
        {legendItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {legendItems.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[11px] text-slate-600">
                  {item.label}
                  <span className="text-slate-400 ml-1">({item.count})</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {onNavigateToSeatPicker && (
          <button
            onClick={onNavigateToSeatPicker}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Kies je stoelen
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
});
