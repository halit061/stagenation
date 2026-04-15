import { useRef, useState, useCallback, useEffect, useMemo, memo } from 'react';
import { ArrowLeft, ZoomIn, ZoomOut, Maximize, Minus, Plus } from 'lucide-react';
import type { SeatSection } from '../types/seats';
import type { PickerSeat } from '../hooks/useSeatPickerState';
import type { FloorplanObject } from '../services/seatPickerService';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';
import { SvgSeatChair } from './SeatIcon';
import { getColorCategory } from '../config/sectionColors';

const SEAT_SIZE_PRESETS = [
  { size: 56, label: 'M' },
  { size: 68, label: 'L' },
  { size: 80, label: 'XL' },
];
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5;
const ZOOM_STEP_FACTOR = 1.4;
const ZOOM_SECTION_FILL = 0.7;

function getSectionTier(color: string): 'vip' | 'premium' | 'regular' {
  const cat = getColorCategory(color);
  if (cat === 'premium') {
    const lower = color.toLowerCase();
    if (lower.includes('d4af') || lower.includes('c0a0') || lower.includes('b886')) return 'vip';
    return 'premium';
  }
  return 'regular';
}

interface Props {
  sections: SeatSection[];
  seats: PickerSeat[];
  selectedIds: Set<string>;
  highlightedIds?: Set<string>;
  flashingIds?: Set<string>;
  restrictedSectionIds?: Set<string>;
  floorplanObjects?: FloorplanObject[];
  ticketTypeColorMap?: Record<string, string>;
  sectionTicketPrices?: Map<string, { ttName: string; price: number }>;
  onSeatClick: (seatId: string) => void;
  canvasWidth?: number;
  canvasHeight?: number;
  onViewportChange?: (vp: { x: number; y: number; w: number; h: number }) => void;
}

export const SeatPickerMap = memo(function SeatPickerMap({
  sections,
  seats,
  selectedIds,
  highlightedIds,
  flashingIds,
  restrictedSectionIds,
  floorplanObjects = [],
  ticketTypeColorMap = {},
  sectionTicketPrices,
  onSeatClick,
  onViewportChange,
}: Props) {
  const { language } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [hoveredSeat, setHoveredSeat] = useState<PickerSeat | null>(null);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [animating, setAnimating] = useState(false);
  const [seatSizeIdx, setSeatSizeIdx] = useState(0);
  const animRef = useRef<number | null>(null);
  const lastPinchDist = useRef<number | null>(null);
  const didPan = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);

  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const half = SEAT_SIZE_PRESETS[0].size / 2;
    for (const s of seats) {
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
  }, [seats, floorplanObjects]);

  const fitToOverview = useCallback(() => {
    if (!containerRef.current) return;
    if (bounds.minX === Infinity) return;
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
    if (seats.length === 0 && floorplanObjects.length === 0) return;
    const fit = fitToOverview();
    if (fit) {
      setZoom(fit.zoom);
      setPan({ x: fit.panX, y: fit.panY });
    }
  }, [seats.length, floorplanObjects.length, fitToOverview]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (seats.length === 0 && floorplanObjects.length === 0) return;
      const fit = fitToOverview();
      if (fit) {
        setZoom(fit.zoom);
        setPan({ x: fit.panX, y: fit.panY });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [seats.length, floorplanObjects.length, fitToOverview]);

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const direction = e.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? 1.15 : 1 / 1.15;
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
    didPan.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { x: pan.x, y: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan.current = true;
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const animateTo = useCallback((targetZoom: number, targetPanX: number, targetPanY: number) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setAnimating(true);
    const startZoom = zoom;
    const startPanX = pan.x;
    const startPanY = pan.y;
    const duration = 350;
    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const z = startZoom + (targetZoom - startZoom) * ease;
      const px = startPanX + (targetPanX - startPanX) * ease;
      const py = startPanY + (targetPanY - startPanY) * ease;
      setZoom(z);
      setPan({ x: px, y: py });
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        setAnimating(false);
        animRef.current = null;
      }
    }
    animRef.current = requestAnimationFrame(step);
  }, [zoom, pan]);

  const handleOverview = useCallback(() => {
    setFocusedSectionId(null);
    const fit = fitToOverview();
    if (fit) animateTo(fit.zoom, fit.panX, fit.panY);
  }, [fitToOverview, animateTo]);

  const handleSectionClick = useCallback((sectionId: string) => {
    const isRestricted = restrictedSectionIds?.has(sectionId) ?? false;
    if (isRestricted) return;
    const section = sections.find(s => s.id === sectionId);
    if (!section || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const sectionCenterX = section.position_x + section.width / 2;
    const sectionCenterY = section.position_y + section.height / 2;
    const zoomX = (rect.width * ZOOM_SECTION_FILL) / section.width;
    const zoomY = (rect.height * ZOOM_SECTION_FILL) / section.height;
    const targetZoom = Math.min(zoomX, zoomY, MAX_ZOOM);
    const targetPanX = rect.width / 2 - sectionCenterX * targetZoom;
    const targetPanY = rect.height / 2 - sectionCenterY * targetZoom;
    setFocusedSectionId(sectionId);
    animateTo(targetZoom, targetPanX, targetPanY);
  }, [sections, restrictedSectionIds, animateTo]);

  const handleZoomIn = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newZoom = Math.min(MAX_ZOOM, zoom * ZOOM_STEP_FACTOR);
    const s = newZoom / zoom;
    const newPan = { x: cx - s * (cx - pan.x), y: cy - s * (cy - pan.y) };
    animateTo(newZoom, newPan.x, newPan.y);
  }, [zoom, pan, animateTo]);

  const handleZoomOut = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newZoom = Math.max(MIN_ZOOM, zoom / ZOOM_STEP_FACTOR);
    const s = newZoom / zoom;
    const newPan = { x: cx - s * (cx - pan.x), y: cy - s * (cy - pan.y) };
    animateTo(newZoom, newPan.x, newPan.y);
  }, [zoom, pan, animateTo]);

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
      didPan.current = false;
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
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didPan.current = true;
      lastTouchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
  }, [zoom]);

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
    lastTouchPos.current = null;
  }, []);

  const sizePreset = SEAT_SIZE_PRESETS[seatSizeIdx];
  const SEAT_CHAIR_SIZE = sizePreset.size;

  const seatSize = SEAT_CHAIR_SIZE;

  const handleSeatPointerDown = useCallback((e: React.PointerEvent, seat: PickerSeat) => {
    if (seat.status === 'blocked' || seat.status === 'sold') return;
    if (seat.status === 'reserved' && !selectedIds.has(seat.id)) return;

    if (e.pointerType !== 'touch') {
      e.stopPropagation();
      onSeatClick(seat.id);
      return;
    }

    didPan.current = false;
    longPressTimer.current = setTimeout(() => {
      setHoveredSeat(seat);
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        setTooltipPos({
          x: e.clientX - rect.left + 16,
          y: e.clientY - rect.top - 12,
        });
      }
    }, 400);
  }, [selectedIds, onSeatClick]);

  const handleSeatPointerUp = useCallback((e: React.PointerEvent, seat: PickerSeat) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (hoveredSeat) { setHoveredSeat(null); setTooltipPos(null); return; }
    if (e.pointerType === 'touch' && !didPan.current) {
      onSeatClick(seat.id);
    }
  }, [onSeatClick, hoveredSeat]);

  const handleSeatHover = useCallback((seat: PickerSeat, ev: React.PointerEvent) => {
    if (ev.pointerType === 'touch') return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setHoveredSeat(seat);
    setTooltipPos({
      x: ev.clientX - rect.left + 16,
      y: ev.clientY - rect.top - 12,
    });
  }, []);

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

  const sectionForSeat = useCallback((seatId: string) => {
    const seat = seats.find(s => s.id === seatId);
    if (!seat) return null;
    return sections.find(s => s.id === seat.sectionId) || null;
  }, [seats, sections]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#f8fafc] rounded-xl select-none border border-slate-200"
      style={{ touchAction: 'none' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        role="img"
        aria-label={st(language, 'picker.title')}
        style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
      >
        <defs>
          <filter id="seatSelectedGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.6" />
          </filter>
          <filter id="seatHoverGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgba(255,255,255,0.4)" floodOpacity="0.5" />
          </filter>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {bounds.minX !== Infinity && (
            <rect
              x={bounds.minX - 400}
              y={bounds.minY - 400}
              width={bounds.maxX - bounds.minX + 800}
              height={bounds.maxY - bounds.minY + 800}
              fill="#f8fafc"
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
                      fill="#1e293b"
                      stroke="#475569" strokeWidth={2} rx={10}
                    />
                    <text
                      x={ox + ow / 2} y={oy + oh / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill="#94a3b8"
                      fontSize={obj.font_size || Math.min(28, ow * 0.12)}
                      fontWeight="700"
                      letterSpacing="0.3em"
                    >
                      {displayName.toUpperCase()}
                    </text>
                  </>
                ) : isBar ? (
                  <>
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill="#1e293b"
                      stroke="#475569" strokeWidth={1.5} rx={6}
                    />
                    <text
                      x={ox + ow / 2} y={oy + oh / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill="#94a3b8"
                      fontSize={obj.font_size || 14}
                      fontWeight="600"
                      letterSpacing="0.15em"
                    >
                      {displayName.toUpperCase()}
                    </text>
                  </>
                ) : isTribune ? (
                  <>
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill="#e2e8f0"
                      stroke="#94a3b8" strokeWidth={1} rx={6}
                    />
                    <text
                      x={ox + ow / 2} y={oy + oh / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill="#475569"
                      fontSize={obj.font_size || 13}
                      fontWeight="600"
                      letterSpacing="0.08em"
                    >
                      {displayName.toUpperCase()}
                    </text>
                  </>
                ) : isDancefloor ? (
                  <>
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill="#1e293b"
                      stroke="#475569" strokeWidth={1.5} rx={8}
                      opacity={0.85}
                    />
                    <text
                      x={ox + ow / 2} y={oy + oh / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill="#94a3b8"
                      fontSize={obj.font_size || 14}
                      fontWeight="600"
                      letterSpacing="0.12em"
                    >
                      {displayName.toUpperCase()}
                    </text>
                  </>
                ) : (
                  <>
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill="#1e293b"
                      stroke="#475569" strokeWidth={1} rx={6}
                      opacity={0.9}
                    />
                    <text
                      x={ox + ow / 2} y={oy + oh / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill="#94a3b8"
                      fontSize={obj.font_size || 13}
                      fontWeight="600"
                      letterSpacing="0.05em"
                    >
                      {displayName.toUpperCase()}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {sections.map(section => {
            const isRestricted = restrictedSectionIds?.has(section.id) ?? false;
            const secSeats = seatsBySection.get(section.id) || [];
            const rowLabels = rowLabelsBySection.get(section.id) || [];
            const color = section.color || '#3b82f6';
            const isFocused = focusedSectionId === section.id;
            const isHovered = hoveredSectionId === section.id;
            const tier = getSectionTier(color);

            return (
              <g
                key={section.id}
                style={{
                  ...getSectionTransform(section.id),
                  transition: 'opacity 200ms ease',
                  opacity: isRestricted ? 0.4 : 1,
                }}
                onPointerEnter={() => !isRestricted && setHoveredSectionId(section.id)}
                onPointerLeave={() => setHoveredSectionId(null)}
              >
                <rect
                  x={section.position_x}
                  y={section.position_y}
                  width={section.width}
                  height={section.height}
                  rx={8}
                  fill={color}
                  fillOpacity={isRestricted ? 0.05 : (isHovered ? 0.08 : 0.05)}
                  stroke={color}
                  strokeWidth={isFocused ? 1.5 : 1}
                  strokeOpacity={isFocused ? 0.4 : (isHovered ? 0.3 : 0.15)}
                  style={{
                    cursor: isRestricted ? 'not-allowed' : 'pointer',
                    pointerEvents: 'all',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isRestricted) handleSectionClick(section.id);
                  }}
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
                  style={{ pointerEvents: 'none' }}
                >
                  {section.name}{tier === 'vip' ? ' (VIP)' : ''}
                </text>

                {isRestricted && (
                  <text
                    x={section.position_x + section.width / 2}
                    y={section.position_y + section.height / 2 + 4}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#94a3b8"
                    fontSize={9}
                    fontWeight={500}
                    style={{ pointerEvents: 'none' }}
                  >
                    Niet beschikbaar
                  </text>
                )}

                {!isRestricted && (() => {
                  const secPrice = Number(section.price_amount) || 0;
                  const ttPrice = sectionTicketPrices?.get(section.id)?.price ?? 0;
                  const displayPrice = secPrice > 0 ? secPrice : ttPrice;
                  if (displayPrice <= 0) return null;
                  return (
                    <g style={{ pointerEvents: 'none' }}>
                      <rect
                        x={section.position_x + section.width / 2 - 36}
                        y={section.position_y + 22}
                        width={72}
                        height={18}
                        rx={9}
                        fill={color}
                        fillOpacity={0.12}
                      />
                      <text
                        x={section.position_x + section.width / 2}
                        y={section.position_y + 33}
                        textAnchor="middle"
                        fill={color}
                        fillOpacity={0.8}
                        fontSize="10"
                        fontWeight="700"
                      >
                        EUR {displayPrice.toFixed(2)}
                      </text>
                    </g>
                  );
                })()}

                {!isRestricted && rowLabels.map(rl => (
                  <text
                    key={rl.label}
                    x={rl.minX - seatSize / 2 - 8}
                    y={rl.y}
                    textAnchor="end"
                    dominantBaseline="central"
                    fill="#94a3b8"
                    fontSize={9}
                    fontWeight={600}
                    style={{ pointerEvents: 'none' }}
                  >
                    {rl.label}
                  </text>
                ))}

                {secSeats.map(seat => {
                  const isSelected = selectedIds.has(seat.id);
                  const isHighlighted = highlightedIds?.has(seat.id);
                  const isFlashing = flashingIds?.has(seat.id);
                  const isHoveredSeat = hoveredSeat?.id === seat.id;
                  const isBlocked = seat.status === 'blocked';
                  const isSold = seat.status === 'sold';
                  const isReservedSeat = seat.status === 'reserved' && !isSelected;
                  const isAvailable = seat.status === 'available';

                  let fillColor: string;
                  let borderColor: string;
                  let fillOpacity = 1;

                  if (isRestricted) {
                    fillColor = '#d1d5db';
                    borderColor = '#9ca3af';
                    fillOpacity = 0.4;
                  } else if (isSelected) {
                    fillColor = '#3b82f6';
                    borderColor = '#1d4ed8';
                  } else if (isSold) {
                    fillColor = '#f87171';
                    borderColor = '#dc2626';
                    fillOpacity = 0.85;
                  } else if (isReservedSeat) {
                    fillColor = '#fb923c';
                    borderColor = '#ea580c';
                    fillOpacity = 0.9;
                  } else if (isBlocked) {
                    fillColor = '#d1d5db';
                    borderColor = '#9ca3af';
                    fillOpacity = 0.5;
                  } else if (isAvailable) {
                    const ttColor = seat.ticket_type_id ? ticketTypeColorMap[seat.ticket_type_id] : null;
                    if (ttColor) {
                      fillColor = ttColor;
                      borderColor = ttColor;
                    } else if (tier === 'vip') {
                      fillColor = '#fbbf24';
                      borderColor = '#d97706';
                    } else {
                      fillColor = '#4ade80';
                      borderColor = '#16a34a';
                    }
                  } else {
                    fillColor = '#4ade80';
                    borderColor = '#16a34a';
                  }

                  const currentSize = isHoveredSeat && !isRestricted ? SEAT_CHAIR_SIZE * 1.2 : SEAT_CHAIR_SIZE;
                  const clickable = !isRestricted && (isAvailable || isSelected);

                  const seatFilter = isSelected
                    ? 'url(#seatSelectedGlow)'
                    : isHoveredSeat && !isRestricted
                      ? 'url(#seatHoverGlow)'
                      : undefined;

                  return (
                    <g key={seat.id} filter={seatFilter}>
                      {isHighlighted && (
                        <circle
                          cx={seat.cx}
                          cy={seat.cy}
                          r={SEAT_CHAIR_SIZE * 1.15}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth={1.5}
                          className="seat-best-pulse"
                          style={{ pointerEvents: 'none' }}
                        />
                      )}
                      <SvgSeatChair
                        cx={seat.cx}
                        cy={seat.cy}
                        size={currentSize}
                        color={fillColor}
                        opacity={fillOpacity}
                        selected={isSelected}
                        strokeColor={borderColor}
                        strokeWidth={isSelected ? 2.5 : 2}
                        className={`seat-round-transition ${isSelected ? 'seat-picker-selected' : ''} ${isFlashing ? 'seat-status-flash' : ''}`}
                        style={{
                          cursor: clickable ? 'pointer' : (isSold || isBlocked) ? 'not-allowed' : 'default',
                          pointerEvents: clickable ? 'all' : (isSold || isBlocked) ? 'all' : 'none',
                        }}
                        onPointerDown={clickable ? (e) => handleSeatPointerDown(e, seat) : undefined}
                        onPointerUp={clickable ? (e) => handleSeatPointerUp(e, seat) : undefined}
                        onPointerEnter={(e) => handleSeatHover(seat, e)}
                        onPointerLeave={handleSeatLeave}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>

      {hoveredSeat && tooltipPos && (
        <SeatTooltip
          seat={hoveredSeat}
          pos={tooltipPos}
          section={sectionForSeat(hoveredSeat.id)}
          sectionTicketPrices={sectionTicketPrices}
          isSelected={selectedIds.has(hoveredSeat.id)}
        />
      )}

      {focusedSectionId && (
        <button
          onClick={handleOverview}
          className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Overzicht
        </button>
      )}

      <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-10">
        <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          <button
            onClick={() => setSeatSizeIdx(i => Math.max(0, i - 1))}
            disabled={seatSizeIdx === 0}
            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            aria-label="Stoelen kleiner"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[10px] font-bold text-slate-400 w-5 text-center">{sizePreset.label}</span>
          <button
            onClick={() => setSeatSizeIdx(i => Math.min(SEAT_SIZE_PRESETS.length - 1, i + 1))}
            disabled={seatSizeIdx === SEAT_SIZE_PRESETS.length - 1}
            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            aria-label="Stoelen groter"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <button
          onClick={handleZoomIn}
          className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleOverview}
          className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
          aria-label="Overzicht"
        >
          <Maximize className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

function SeatTooltip({
  seat,
  pos,
  section,
  sectionTicketPrices,
  isSelected,
}: {
  seat: PickerSeat;
  pos: { x: number; y: number };
  section: { name: string; price_amount: number } | null;
  sectionTicketPrices?: Map<string, { ttName: string; price: number }>;
  isSelected: boolean;
}) {
  const { language } = useLanguage();
  const sectionPrice = section ? Number(section.price_amount) : 0;
  const ttInfo = sectionTicketPrices?.get(seat.sectionId);
  const resolvedPrice = sectionPrice > 0 ? sectionPrice : (ttInfo?.price ?? 0);
  const price = seat.price_override ?? resolvedPrice;

  return (
    <div
      className="absolute pointer-events-none seat-tooltip-enter z-50"
      style={{
        left: pos.x,
        top: pos.y,
        transform: 'translate(0, -100%)',
      }}
      role="tooltip"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-sm whitespace-nowrap">
        {section && (
          <div className="text-slate-400 text-xs font-semibold mb-0.5">
            {section.name}
          </div>
        )}
        <div className="font-semibold text-white">
          {st(language, 'picker.row')} {seat.row_label} &mdash; {st(language, 'picker.seatLabel')} {seat.seat_number}
        </div>
        <div className="text-emerald-400 font-bold mt-0.5">
          EUR {price.toFixed(2)}
        </div>
        {isSelected && (
          <div className="text-blue-400 text-xs mt-0.5">{st(language, 'picker.selected')}</div>
        )}
      </div>
    </div>
  );
}
