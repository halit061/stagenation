import { useRef, useState, useCallback, useEffect, useMemo, memo } from 'react';
import { ArrowLeft, ZoomIn, ZoomOut, Maximize, Minus, Plus } from 'lucide-react';
import type { SeatSection } from '../types/seats';
import type { PickerSeat } from '../hooks/useSeatPickerState';
import type { FloorplanObject } from '../services/seatPickerService';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';
import { SvgSeatChair } from './SeatIcon';

const HEADER_H = 24;
const SEAT_SIZE_PRESETS = [
  { size: 64, label: 'M' },
  { size: 76, label: 'L' },
  { size: 88, label: 'XL' },
];
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5;
const ZOOM_STEP_FACTOR = 1.4;
const ZOOM_SECTION_FILL = 0.7;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

interface Props {
  sections: SeatSection[];
  seats: PickerSeat[];
  selectedIds: Set<string>;
  highlightedIds?: Set<string>;
  flashingIds?: Set<string>;
  restrictedSectionIds?: Set<string>;
  floorplanObjects?: FloorplanObject[];
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
    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 1600, maxY: 1000 };
    return { minX, minY, maxX, maxY };
  }, [sections, floorplanObjects]);

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
    if (sections.length === 0 && floorplanObjects.length === 0) return;
    const fit = fitToOverview();
    if (fit) {
      setZoom(fit.zoom);
      setPan({ x: fit.panX, y: fit.panY });
    }
  }, [sections.length, floorplanObjects.length, fitToOverview]);

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
    if (e.pointerType === 'touch') {
      didPan.current = false;
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
      className="relative w-full h-full overflow-hidden bg-slate-950 rounded-xl select-none"
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
          <pattern id="seatPickerGrid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(51,65,85,0.15)" strokeWidth="0.5" />
          </pattern>
          <filter id="stageGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.23  0 0 0 0 0.51  0 0 0 0 0.93  0 0 0 0.4 0" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {bounds.minX !== Infinity && (
            <rect
              x={bounds.minX - 200}
              y={bounds.minY - 200}
              width={bounds.maxX - bounds.minX + 400}
              height={bounds.maxY - bounds.minY + 400}
              fill="url(#seatPickerGrid)"
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
            const isStage = objType === 'STAGE';
            const displayName = obj.name || obj.type || 'Object';

            return (
              <g key={obj.id} style={{ pointerEvents: 'none' }}>
                {isTribune ? (
                  <>
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill={obj.color || '#92400e'}
                      stroke="#78350f" strokeWidth={1.5} rx={4}
                      opacity={0.85}
                    />
                    {[0.2, 0.4, 0.6, 0.8].map((frac) => (
                      <line key={frac}
                        x1={ox + ow * frac} y1={oy + 4}
                        x2={ox + ow * frac} y2={oy + oh - 4}
                        stroke="rgba(0,0,0,0.25)" strokeWidth={1}
                      />
                    ))}
                    <text
                      x={ox + ow / 2} y={oy + oh / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill={obj.font_color || '#fff'}
                      fontSize={obj.font_size || 14}
                      fontWeight={obj.font_weight || 'bold'}
                    >
                      {displayName.toUpperCase()}
                    </text>
                  </>
                ) : isStage ? (
                  <g filter="url(#stageGlow)">
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill={obj.color || '#1e40af'}
                      stroke="rgba(59,130,246,0.7)"
                      strokeWidth={2.5} rx={8}
                      opacity={0.95}
                    />
                    <line
                      x1={ox + 12} y1={oy + oh - 1}
                      x2={ox + ow - 12} y2={oy + oh - 1}
                      stroke="rgba(59,130,246,0.5)" strokeWidth={3} strokeLinecap="round"
                    />
                    <text
                      x={ox + ow / 2} y={oy + oh / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill={obj.font_color || '#fff'}
                      fontSize={obj.font_size || 20}
                      fontWeight={obj.font_weight || 'bold'}
                      letterSpacing="0.2em"
                    >
                      {displayName.toUpperCase()}
                    </text>
                  </g>
                ) : (
                  <>
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill={obj.color || '#6b7280'}
                      stroke={isDancefloor ? 'rgba(71,85,105,0.3)' : 'rgba(71,85,105,0.5)'}
                      strokeWidth={1} rx={4}
                      opacity={isDancefloor ? 0.3 : 0.85}
                    />
                    <text
                      x={ox + ow / 2} y={oy + oh / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill={obj.font_color || '#fff'}
                      fontSize={obj.font_size || (isDancefloor ? 14 : 16)}
                      fontWeight={obj.font_weight || 'bold'}
                      letterSpacing="0.05em"
                      opacity={isDancefloor ? 0.6 : 0.9}
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
            const isTribune = section.section_type === 'tribune';

            return (
              <g key={section.id} style={getSectionTransform(section.id)}>
                <rect
                  x={section.position_x}
                  y={section.position_y}
                  width={section.width}
                  height={section.height}
                  rx={6}
                  fill={isRestricted ? 'rgba(30,41,59,0.6)' : hexToRgba(color, 0.18)}
                  stroke={isRestricted ? 'rgba(100,116,139,0.2)' : isFocused ? hexToRgba(color, 0.8) : hexToRgba(color, 0.5)}
                  strokeWidth={isFocused ? 2.5 : 1.5}
                  strokeDasharray={isTribune ? 'none' : '8 4'}
                  style={{
                    cursor: isRestricted ? 'not-allowed' : 'pointer',
                    pointerEvents: 'all',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isRestricted) handleSectionClick(section.id);
                  }}
                />

                <rect
                  x={section.position_x}
                  y={section.position_y}
                  width={section.width}
                  height={HEADER_H}
                  rx={6}
                  fill={isRestricted ? 'rgba(100,116,139,0.15)' : hexToRgba(color, 0.35)}
                  style={{ pointerEvents: 'none' }}
                />
                <rect
                  x={section.position_x}
                  y={section.position_y + HEADER_H - 6}
                  width={section.width}
                  height={6}
                  fill={isRestricted ? 'rgba(100,116,139,0.15)' : hexToRgba(color, 0.35)}
                  style={{ pointerEvents: 'none' }}
                />

                <text
                  x={section.position_x + 8}
                  y={section.position_y + 16}
                  fill="rgba(255,255,255,0.95)"
                  fontSize="12"
                  fontWeight="bold"
                  style={{ pointerEvents: 'none' }}
                >
                  {section.section_type === 'tribune' ? 'T' : 'P'} {section.name}
                </text>
                <text
                  x={section.position_x + section.width - 8}
                  y={section.position_y + 16}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.65)"
                  fontSize="10"
                  style={{ pointerEvents: 'none' }}
                >
                  {secSeats.length} {secSeats.length === 1 ? 'stoel' : 'stoelen'}
                </text>

                {isRestricted && (
                  <text
                    x={section.position_x + section.width / 2}
                    y={section.position_y + section.height / 2 + 4}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="rgba(255,255,255,0.2)"
                    fontSize={9}
                    fontWeight={500}
                    style={{ pointerEvents: 'none' }}
                  >
                    Niet beschikbaar
                  </text>
                )}

                {isRestricted && (
                  <rect
                    x={section.position_x}
                    y={section.position_y}
                    width={section.width}
                    height={section.height}
                    rx={6}
                    fill="rgba(15,23,42,0.5)"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {!isRestricted && section.price_category && (
                  <>
                    <rect
                      x={section.position_x}
                      y={section.position_y + section.height - 22}
                      width={section.width}
                      height={22}
                      fill={hexToRgba(color, 0.25)}
                      rx={0}
                      style={{ pointerEvents: 'none' }}
                    />
                    <text
                      x={section.position_x + 8}
                      y={section.position_y + section.height - 7}
                      fill="rgba(255,255,255,0.75)"
                      fontSize="10"
                      fontWeight="600"
                      style={{ pointerEvents: 'none' }}
                    >
                      {section.price_category} — EUR {Number(section.price_amount).toFixed(2)}
                    </text>
                  </>
                )}

                {!isRestricted && rowLabels.map(rl => (
                  <text
                    key={rl.label}
                    x={rl.minX - seatSize / 2 - 6}
                    y={rl.y}
                    textAnchor="end"
                    dominantBaseline="central"
                    fill="rgba(255,255,255,0.6)"
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
                  const isHovered = hoveredSeat?.id === seat.id;
                  const isBlocked = seat.status === 'blocked';
                  const isSold = seat.status === 'sold';
                  const isReservedSeat = seat.status === 'reserved' && !isSelected;
                  const isAvailable = seat.status === 'available';

                  let fillColor = '#3b82f6';
                  let fillOpacity = 0.9;
                  let strokeColor = '';
                  let strokeW = 0;

                  if (isRestricted) {
                    fillColor = '#374151';
                    fillOpacity = 0.2;
                  } else if (isSelected) {
                    fillColor = '#22c55e';
                    fillOpacity = 1;
                    strokeColor = '#ffffff';
                    strokeW = 2;
                  } else if (isSold || isReservedSeat) {
                    fillColor = '#ef4444';
                    fillOpacity = 0.5;
                  } else if (isBlocked) {
                    fillColor = '#6b7280';
                    fillOpacity = 0.3;
                  } else if (seat.seat_type === 'vip' && isAvailable) {
                    fillColor = '#eab308';
                    fillOpacity = 0.9;
                    strokeColor = '#fbbf24';
                    strokeW = 1;
                  }

                  const currentSize = isHovered && !isRestricted ? SEAT_CHAIR_SIZE * 1.15 : SEAT_CHAIR_SIZE;
                  const clickable = !isRestricted && (isAvailable || isSelected);

                  return (
                    <g key={seat.id}>
                      {isHighlighted && (
                        <circle
                          cx={seat.cx}
                          cy={seat.cy}
                          r={SEAT_CHAIR_SIZE * 1.2}
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
                        strokeColor={strokeColor || undefined}
                        strokeWidth={strokeW}
                        className={`seat-chair-transition ${isSelected ? 'seat-picker-selected' : ''} ${isFlashing ? 'seat-status-flash' : ''}`}
                        style={{
                          cursor: clickable ? 'pointer' : 'default',
                          filter: isSelected
                            ? 'drop-shadow(0 0 4px rgba(34,197,94,0.6))'
                            : isHovered && clickable
                            ? 'drop-shadow(0 0 4px rgba(255,255,255,0.35))'
                            : undefined,
                          pointerEvents: clickable ? 'all' : 'none',
                        }}
                        onPointerDown={clickable ? (e) => handleSeatPointerDown(e, seat) : undefined}
                        onPointerUp={clickable ? (e) => handleSeatPointerUp(e, seat) : undefined}
                        onPointerEnter={clickable ? (e) => handleSeatHover(seat, e) : undefined}
                        onPointerLeave={clickable ? handleSeatLeave : undefined}
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
          isSelected={selectedIds.has(hoveredSeat.id)}
        />
      )}

      {focusedSectionId && (
        <button
          onClick={handleOverview}
          className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-2 bg-slate-800/90 backdrop-blur border border-slate-600/50 rounded-lg text-white text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Overzicht
        </button>
      )}

      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-10">
        <div className="flex items-center bg-slate-800/90 backdrop-blur border border-slate-600/50 rounded-lg overflow-hidden">
          <button
            onClick={() => setSeatSizeIdx(i => Math.max(0, i - 1))}
            disabled={seatSizeIdx === 0}
            className="w-8 h-8 flex items-center justify-center text-white hover:bg-slate-700 disabled:opacity-30 transition-colors"
            aria-label="Stoelen kleiner"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-bold text-slate-300 w-6 text-center">{sizePreset.label}</span>
          <button
            onClick={() => setSeatSizeIdx(i => Math.min(SEAT_SIZE_PRESETS.length - 1, i + 1))}
            disabled={seatSizeIdx === SEAT_SIZE_PRESETS.length - 1}
            className="w-8 h-8 flex items-center justify-center text-white hover:bg-slate-700 disabled:opacity-30 transition-colors"
            aria-label="Stoelen groter"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={handleZoomIn}
          className="w-10 h-10 flex items-center justify-center bg-slate-800/90 backdrop-blur border border-slate-600/50 rounded-lg text-white hover:bg-slate-700 transition-colors focus-ring"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-4.5 h-4.5" />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-10 h-10 flex items-center justify-center bg-slate-800/90 backdrop-blur border border-slate-600/50 rounded-lg text-white hover:bg-slate-700 transition-colors focus-ring"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-4.5 h-4.5" />
        </button>
        <button
          onClick={handleOverview}
          className="w-10 h-10 flex items-center justify-center bg-slate-800/90 backdrop-blur border border-slate-600/50 rounded-lg text-white hover:bg-slate-700 transition-colors focus-ring"
          aria-label="Overzicht"
        >
          <Maximize className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  );
});

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
  const { language } = useLanguage();
  const price = seat.price_override ?? (section ? Number(section.price_amount) : 0);

  return (
    <div
      className="absolute pointer-events-none seat-tooltip-enter z-50"
      style={{
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -100%)',
      }}
      role="tooltip"
    >
      <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-sm whitespace-nowrap">
        {section && (
          <div className="text-cyan-400 text-xs font-semibold mb-0.5">
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
        <div
          className="absolute left-1/2 -bottom-1.5 w-3 h-3 bg-slate-900/95 border-r border-b border-slate-700 rotate-45"
          style={{ transform: 'translateX(-50%) rotate(45deg)' }}
        />
      </div>
    </div>
  );
}
