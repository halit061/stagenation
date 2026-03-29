import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { SeatSection } from '../types/seats';
import type { PickerSeat } from '../hooks/useSeatPickerState';
import type React from 'react';

const HEADER_H = 24;
const SEAT_R = 5;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.15;

interface Props {
  sections: SeatSection[];
  seats: PickerSeat[];
  selectedIds: Set<string>;
  highlightedIds?: Set<string>;
  flashingIds?: Set<string>;
  onSeatClick: (seatId: string) => void;
  canvasWidth?: number;
  canvasHeight?: number;
  onViewportChange?: (vp: { x: number; y: number; w: number; h: number }) => void;
}

export function SeatPickerMap({
  sections,
  seats,
  selectedIds,
  highlightedIds,
  flashingIds,
  onSeatClick,
  onViewportChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const [hoveredSeat, setHoveredSeat] = useState<PickerSeat | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didPan = useRef(false);

  useEffect(() => {
    if (!containerRef.current || sections.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const sec of sections) {
      minX = Math.min(minX, sec.position_x);
      minY = Math.min(minY, sec.position_y);
      maxX = Math.max(maxX, sec.position_x + sec.width);
      maxY = Math.max(maxY, sec.position_y + sec.height);
    }
    const contentW = maxX - minX + 60;
    const contentH = maxY - minY + 60;
    const fitZoom = Math.min(rect.width / contentW, rect.height / contentH, 1.5);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(fitZoom);
    setPan({
      x: rect.width / 2 - centerX * fitZoom,
      y: rect.height / 2 - centerY * fitZoom,
    });
  }, [sections]);

  useEffect(() => {
    if (!containerRef.current || !onViewportChange) return;
    const rect = containerRef.current.getBoundingClientRect();
    onViewportChange({
      x: -pan.x / zoom,
      y: -pan.y / zoom,
      w: rect.width / zoom,
      h: rect.height / zoom,
    });
  }, [zoom, pan, onViewportChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
    const scale = newZoom / zoom;
    setPan(prev => ({
      x: mx - scale * (mx - prev.x),
      y: my - scale * (my - prev.y),
    }));
    setZoom(newZoom);
  }, [zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    didPan.current = false;
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan.current = true;
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      lastPinchDist.current = d;
      return;
    }
    if (e.touches.length === 1) {
      isPanning.current = true;
      didPan.current = false;
      panStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  }, [pan]);

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
      return;
    }
    if (e.touches.length === 1 && isPanning.current) {
      const dx = e.touches[0].clientX - panStart.current.x;
      const dy = e.touches[0].clientY - panStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan.current = true;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    }
  }, [zoom]);

  const handleTouchEnd = useCallback(() => {
    isPanning.current = false;
    lastPinchDist.current = null;
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const newZoom = Math.min(MAX_ZOOM, zoom * 1.5);
    const scale = newZoom / zoom;
    setPan(prev => ({ x: mx - scale * (mx - prev.x), y: my - scale * (my - prev.y) }));
    setZoom(newZoom);
  }, [zoom]);

  const seatRadius = useMemo(() => {
    if (seats.length === 0) return SEAT_R;
    let minSpacing = Infinity;
    for (const section of sections) {
      const spacingX = section.width / (section.seats_per_row || 1);
      const spacingY = (section.height - HEADER_H - 20) / (section.rows_count || 1);
      minSpacing = Math.min(minSpacing, spacingX, spacingY);
    }
    return Math.max(2.5, Math.min(SEAT_R, minSpacing * 0.35));
  }, [seats.length, sections]);

  const handleSeatPointerDown = useCallback((e: React.PointerEvent, seat: PickerSeat) => {
    if (seat.status === 'blocked' || seat.status === 'sold') return;
    if (seat.status === 'reserved' && !selectedIds.has(seat.id)) return;

    if (e.pointerType === 'touch') {
      longPressTimer.current = setTimeout(() => {
        setHoveredSeat(seat);
        if (containerRef.current) {
          setTooltipPos({
            x: pan.x + seat.cx * zoom,
            y: pan.y + seat.cy * zoom - 10,
          });
        }
      }, 400);
    }
  }, [selectedIds, zoom, pan]);

  const handleSeatPointerUp = useCallback((_e: React.PointerEvent, seat: PickerSeat) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (didPan.current) return;
    if (hoveredSeat) { setHoveredSeat(null); setTooltipPos(null); return; }
    onSeatClick(seat.id);
  }, [onSeatClick, hoveredSeat]);

  const handleSeatHover = useCallback((seat: PickerSeat, ev: React.PointerEvent) => {
    if (ev.pointerType === 'touch') return;
    setHoveredSeat(seat);
    setTooltipPos({
      x: pan.x + seat.cx * zoom,
      y: pan.y + seat.cy * zoom - 10,
    });
  }, [zoom, pan]);

  const handleSeatLeave = useCallback(() => {
    setHoveredSeat(null);
    setTooltipPos(null);
  }, []);

  const sectionMap = useMemo(() => {
    const map = new Map<string, SeatSection>();
    for (const s of sections) map.set(s.id, s);
    return map;
  }, [sections]);

  function getSectionTransform(sectionId: string): React.CSSProperties | undefined {
    const sec = sectionMap.get(sectionId);
    if (!sec || !sec.rotation) return undefined;
    const cx = sec.position_x + sec.width / 2;
    const cy = sec.position_y + sec.height / 2;
    return { transform: `rotate(${sec.rotation}deg)`, transformOrigin: `${cx}px ${cy}px` };
  }

  const seatsBySection = useMemo(() => {
    const map = new Map<string, PickerSeat[]>();
    for (const seat of seats) {
      if (!map.has(seat.sectionId)) map.set(seat.sectionId, []);
      map.get(seat.sectionId)!.push(seat);
    }
    return map;
  }, [seats]);

  const sectionForSeat = useCallback((seatId: string) => {
    const seat = seats.find(s => s.id === seatId);
    if (!seat) return null;
    return sections.find(s => s.id === seat.sectionId) || null;
  }, [seats, sections]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-slate-950 rounded-xl select-none"
      style={{ touchAction: 'none' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          cursor: isPanning.current ? 'grabbing' : 'grab',
        }}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {sections.map(section => (
            <g key={section.id} style={getSectionTransform(section.id)}>
              <rect
                x={section.position_x}
                y={section.position_y}
                width={section.width}
                height={section.height}
                rx={6}
                fill="rgba(30,41,59,0.4)"
                stroke="rgba(100,116,139,0.3)"
                strokeWidth={1}
              />
              <rect
                x={section.position_x}
                y={section.position_y}
                width={section.width}
                height={HEADER_H}
                rx={6}
                fill={section.color + '33'}
              />
              <rect
                x={section.position_x}
                y={section.position_y + HEADER_H - 3}
                width={section.width}
                height={3}
                fill={section.color + '33'}
              />
              <text
                x={section.position_x + section.width / 2}
                y={section.position_y + HEADER_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="rgba(255,255,255,0.7)"
                fontSize={11}
                fontWeight={600}
              >
                {section.name}
              </text>
              {(seatsBySection.get(section.id) || []).map(seat => {
                const isSelected = selectedIds.has(seat.id);
                const isHighlighted = highlightedIds?.has(seat.id);
                const isFlashing = flashingIds?.has(seat.id);
                const isHovered = hoveredSeat?.id === seat.id;
                const isBlocked = seat.status === 'blocked';
                const isSold = seat.status === 'sold';
                const isReserved = seat.status === 'reserved' && !isSelected;
                const isAvailable = seat.status === 'available';

                if (isBlocked) return null;

                let fillColor = '#22c55e';
                let fillOpacity = 0.85;
                let strokeColor = 'rgba(0,0,0,0.2)';
                let strokeW = 0.5;

                if (isSelected) {
                  fillColor = '#3b82f6';
                  fillOpacity = 1;
                  strokeColor = '#ffffff';
                  strokeW = 2;
                } else if (isSold || isReserved) {
                  fillColor = '#4b5563';
                  fillOpacity = 0.5;
                  strokeColor = 'transparent';
                } else if (seat.seat_type === 'vip' && isAvailable) {
                  fillColor = '#eab308';
                  fillOpacity = 0.9;
                  strokeColor = '#fbbf24';
                  strokeW = 1;
                }

                const r = isHovered ? seatRadius * 1.3 : seatRadius;
                const clickable = isAvailable || isSelected;

                return (
                  <g key={seat.id}>
                    {isHighlighted && (
                      <circle
                        cx={seat.cx}
                        cy={seat.cy}
                        r={seatRadius * 2.5}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        className="seat-best-pulse"
                      />
                    )}
                    <circle
                      cx={seat.cx}
                      cy={seat.cy}
                      r={r}
                      fill={fillColor}
                      fillOpacity={fillOpacity}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      className={`seat-picker-hover ${isSelected ? 'seat-picker-selected' : ''} ${isFlashing ? 'seat-status-flash' : ''}`}
                      style={{
                        cursor: clickable ? 'pointer' : 'default',
                        filter: isSelected
                          ? 'drop-shadow(0 0 4px rgba(59,130,246,0.6))'
                          : isHovered && clickable
                          ? 'drop-shadow(0 0 3px rgba(255,255,255,0.3))'
                          : undefined,
                        pointerEvents: 'all',
                      }}
                      onPointerDown={(e) => handleSeatPointerDown(e, seat)}
                      onPointerUp={(e) => handleSeatPointerUp(e, seat)}
                      onPointerEnter={(e) => clickable ? handleSeatHover(seat, e) : undefined}
                      onPointerLeave={handleSeatLeave}
                    />
                  </g>
                );
              })}
            </g>
          ))}
        </g>
      </svg>

      {hoveredSeat && tooltipPos && (
        <SeatTooltip
          seat={hoveredSeat}
          pos={tooltipPos}
          section={sectionForSeat(hoveredSeat.id)}
          isSelected={selectedIds.has(hoveredSeat.id)}
        />
      )}

      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-10">
        <button
          onClick={() => {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const newZoom = Math.min(MAX_ZOOM, zoom * 1.3);
            const s = newZoom / zoom;
            setPan(prev => ({ x: cx - s * (cx - prev.x), y: cy - s * (cy - prev.y) }));
            setZoom(newZoom);
          }}
          className="w-9 h-9 flex items-center justify-center bg-slate-800/90 backdrop-blur border border-slate-600/50 rounded-lg text-white hover:bg-slate-700 transition-colors text-lg font-bold"
        >
          +
        </button>
        <button
          onClick={() => {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const newZoom = Math.max(MIN_ZOOM, zoom / 1.3);
            const s = newZoom / zoom;
            setPan(prev => ({ x: cx - s * (cx - prev.x), y: cy - s * (cy - prev.y) }));
            setZoom(newZoom);
          }}
          className="w-9 h-9 flex items-center justify-center bg-slate-800/90 backdrop-blur border border-slate-600/50 rounded-lg text-white hover:bg-slate-700 transition-colors text-lg font-bold"
        >
          -
        </button>
      </div>
    </div>
  );
}

function SeatTooltip({
  seat,
  pos,
  section,
  isSelected,
}: {
  seat: PickerSeat;
  pos: { x: number; y: number };
  section: { name: string; price_amount: number } | null;
  isSelected: boolean;
}) {
  const price = seat.price_override ?? (section ? Number(section.price_amount) : 0);

  return (
    <div
      className="absolute pointer-events-none seat-tooltip-enter z-50"
      style={{
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-sm">
        <div className="font-semibold text-white">
          Rij {seat.row_label} - Stoel {seat.seat_number}
        </div>
        {section && (
          <div className="text-slate-400 text-xs">{section.name}</div>
        )}
        <div className="text-emerald-400 font-medium mt-0.5">
          EUR {price.toFixed(2)}
        </div>
        {isSelected && (
          <div className="text-blue-400 text-xs mt-0.5">Geselecteerd</div>
        )}
        <div
          className="absolute left-1/2 -bottom-1.5 w-3 h-3 bg-slate-900/95 border-r border-b border-slate-700 rotate-45"
          style={{ transform: 'translateX(-50%) rotate(45deg)' }}
        />
      </div>
    </div>
  );
}
