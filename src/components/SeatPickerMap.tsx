import { useRef, useState, useCallback, useEffect, useMemo, memo } from 'react';
import { ArrowLeft, ZoomIn, ZoomOut, Maximize, Minus, Plus } from 'lucide-react';
import type { SeatSection } from '../types/seats';
import type { PickerSeat } from '../hooks/useSeatPickerState';
import type { FloorplanObject } from '../services/seatPickerService';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';
import { SvgSeatChair } from './SeatIcon';
import { getColorCategory } from '../config/sectionColors';

const HEADER_H = 28;
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

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) || 0,
    parseInt(h.substring(2, 4), 16) || 0,
    parseInt(h.substring(4, 6), 16) || 0,
  ];
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * amount)},${Math.round(g + (255 - g) * amount)},${Math.round(b + (255 - b) * amount)})`;
}

function isGoldColor(hex: string): boolean {
  const cat = getColorCategory(hex);
  if (cat === 'premium') {
    const lower = hex.toLowerCase();
    return lower.includes('d4af') || lower.includes('c0a0') || lower.includes('b886');
  }
  return false;
}

function getSectionTier(color: string): 'vip' | 'premium' | 'regular' {
  const cat = getColorCategory(color);
  if (isGoldColor(color)) return 'vip';
  if (cat === 'premium') return 'premium';
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

  const gradientDefs = useMemo(() => {
    return sections.map(sec => {
      const color = sec.color || '#3b82f6';
      const tier = getSectionTier(color);
      let topColor: string;
      let midColor: string;
      let bottomColor: string;
      let topAlpha: number;
      let midAlpha: number;
      let bottomAlpha: number;
      let borderAlpha: number;

      if (tier === 'vip') {
        topColor = darken(color, 0.15);
        midColor = lighten(color, 0.1);
        bottomColor = lighten(color, 0.25);
        topAlpha = 0.7;
        midAlpha = 0.55;
        bottomAlpha = 0.45;
        borderAlpha = 0.85;
      } else if (tier === 'premium') {
        topColor = darken(color, 0.1);
        midColor = lighten(color, 0.08);
        bottomColor = lighten(color, 0.2);
        topAlpha = 0.6;
        midAlpha = 0.45;
        bottomAlpha = 0.35;
        borderAlpha = 0.75;
      } else {
        topColor = darken(color, 0.05);
        midColor = lighten(color, 0.15);
        bottomColor = lighten(color, 0.25);
        topAlpha = 0.5;
        midAlpha = 0.35;
        bottomAlpha = 0.28;
        borderAlpha = 0.6;
      }

      return { id: sec.id, topColor, midColor, bottomColor, topAlpha, midAlpha, bottomAlpha, borderAlpha, tier, color };
    });
  }, [sections]);

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
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(51,65,85,0.08)" strokeWidth="0.5" />
          </pattern>

          <filter id="sectionShadow" x="-12%" y="-12%" width="135%" height="145%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="rgba(0,0,0,0.55)" floodOpacity="0.55" />
          </filter>

          <filter id="sectionShadowHover" x="-15%" y="-15%" width="140%" height="150%">
            <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(0,0,0,0.65)" floodOpacity="0.65" />
          </filter>

          <filter id="vipGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.85  0 0 0 0 0.7  0 0 0 0 0.15  0 0 0 0.55 0" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="premiumGlow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.4  0 0 0 0 0.92  0 0 0 0.4 0" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="podiumGlow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.15  0 0 0 0 0.30  0 0 0 0 0.85  0 0 0 0.35 0" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="seatShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="rgba(0,0,0,0.25)" floodOpacity="0.25" />
          </filter>

          <linearGradient id="podiumGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="40%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0c1629" />
          </linearGradient>

          {gradientDefs.map(g => (
            <linearGradient key={g.id} id={`secGrad-${g.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={g.topColor} stopOpacity={g.topAlpha} />
              <stop offset="50%" stopColor={g.midColor} stopOpacity={g.midAlpha} />
              <stop offset="100%" stopColor={g.bottomColor} stopOpacity={g.bottomAlpha} />
            </linearGradient>
          ))}

          {gradientDefs.map(g => (
            <linearGradient key={`h-${g.id}`} id={`secHeaderGrad-${g.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lighten(g.color, 0.35)} stopOpacity={0.85} />
              <stop offset="100%" stopColor={g.topColor} stopOpacity={0.55} />
            </linearGradient>
          ))}
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
                  <g filter="url(#podiumGlow)">
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill="url(#podiumGrad)"
                      stroke="rgba(59,130,246,0.5)"
                      strokeWidth={2} rx={10}
                    />
                    <rect
                      x={ox + 1} y={oy + 1} width={ow - 2} height={oh * 0.15}
                      rx={9}
                      fill="rgba(148,163,184,0.08)"
                    />
                    <line
                      x1={ox + 16} y1={oy + oh - 2}
                      x2={ox + ow - 16} y2={oy + oh - 2}
                      stroke="rgba(59,130,246,0.4)" strokeWidth={2.5} strokeLinecap="round"
                    />
                    <text
                      x={ox + ow / 2} y={oy + oh / 2 - 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill={obj.font_color || '#e2e8f0'}
                      fontSize={obj.font_size || 22}
                      fontWeight={obj.font_weight || 'bold'}
                      letterSpacing="0.25em"
                    >
                      {displayName.toUpperCase()}
                    </text>
                    <text
                      x={ox + ow / 2} y={oy + oh / 2 + 16}
                      textAnchor="middle" dominantBaseline="central"
                      fill="rgba(148,163,184,0.5)"
                      fontSize={9}
                      letterSpacing="0.3em"
                    >
                      MAIN STAGE
                    </text>
                  </g>
                ) : (
                  <>
                    <rect
                      x={ox} y={oy} width={ow} height={oh}
                      fill={obj.color || '#6b7280'}
                      stroke={isDancefloor ? 'rgba(71,85,105,0.3)' : 'rgba(71,85,105,0.5)'}
                      strokeWidth={1} rx={6}
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
            const isHovered = hoveredSectionId === section.id;
            const tier = getSectionTier(color);

            const gradDef = gradientDefs.find(g => g.id === section.id);

            const glowFilter = isRestricted ? undefined
              : tier === 'vip' ? 'url(#vipGlow)'
              : tier === 'premium' ? 'url(#premiumGlow)'
              : undefined;

            const shadowFilter = isHovered && !isRestricted ? 'url(#sectionShadowHover)' : 'url(#sectionShadow)';
            const combinedFilter = glowFilter || shadowFilter;

            const borderColor = isRestricted
              ? 'rgba(100,116,139,0.2)'
              : isFocused
                ? lighten(color, 0.5)
                : isHovered
                  ? lighten(color, 0.45)
                  : lighten(color, 0.3);

            const borderOpacity = isRestricted ? 0.2
              : gradDef ? gradDef.borderAlpha : 0.6;

            const borderWidth = isFocused ? 3 : isHovered ? 2.5 : 2;

            return (
              <g
                key={section.id}
                style={{
                  ...getSectionTransform(section.id),
                  transition: 'opacity 200ms ease',
                  opacity: isRestricted ? 0.45 : isHovered ? 1 : 0.95,
                }}
                onPointerEnter={() => !isRestricted && setHoveredSectionId(section.id)}
                onPointerLeave={() => setHoveredSectionId(null)}
              >
                <g filter={combinedFilter}>
                  <rect
                    x={section.position_x}
                    y={section.position_y}
                    width={section.width}
                    height={section.height}
                    rx={12}
                    fill={isRestricted ? 'rgba(30,41,59,0.5)' : `url(#secGrad-${section.id})`}
                    stroke={borderColor}
                    strokeWidth={borderWidth}
                    strokeOpacity={borderOpacity}
                    style={{
                      cursor: isRestricted ? 'not-allowed' : 'pointer',
                      pointerEvents: 'all',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isRestricted) handleSectionClick(section.id);
                    }}
                  />
                </g>

                {!isRestricted && (
                  <rect
                    x={section.position_x + 1}
                    y={section.position_y + 1}
                    width={section.width - 2}
                    height={Math.min(section.height * 0.08, 8)}
                    rx={11}
                    fill="rgba(255,255,255,0.12)"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                <rect
                  x={section.position_x}
                  y={section.position_y}
                  width={section.width}
                  height={HEADER_H}
                  rx={12}
                  fill={isRestricted ? 'rgba(100,116,139,0.12)' : `url(#secHeaderGrad-${section.id})`}
                  style={{ pointerEvents: 'none' }}
                />
                <rect
                  x={section.position_x}
                  y={section.position_y + HEADER_H - 8}
                  width={section.width}
                  height={8}
                  fill={isRestricted ? 'rgba(100,116,139,0.12)' : `url(#secHeaderGrad-${section.id})`}
                  style={{ pointerEvents: 'none' }}
                />
                {!isRestricted && (
                  <line
                    x1={section.position_x + 6}
                    y1={section.position_y + HEADER_H}
                    x2={section.position_x + section.width - 6}
                    y2={section.position_y + HEADER_H}
                    stroke={hexToRgba(color, 0.25)}
                    strokeWidth={0.5}
                  />
                )}

                {tier === 'vip' && !isRestricted && (
                  <text
                    x={section.position_x + section.width - 8}
                    y={section.position_y + 15}
                    textAnchor="end"
                    fill="rgba(212,175,55,0.8)"
                    fontSize="9"
                    fontWeight="bold"
                    letterSpacing="0.1em"
                    style={{ pointerEvents: 'none' }}
                  >
                    VIP
                  </text>
                )}

                <text
                  x={section.position_x + 10}
                  y={section.position_y + 17}
                  fill="rgba(255,255,255,0.95)"
                  fontSize="12"
                  fontWeight="bold"
                  letterSpacing="0.02em"
                  style={{ pointerEvents: 'none' }}
                >
                  {section.name}
                </text>

                {tier !== 'vip' && (
                  <text
                    x={section.position_x + section.width - 8}
                    y={section.position_y + 16}
                    textAnchor="end"
                    fill="rgba(255,255,255,0.5)"
                    fontSize="9"
                    style={{ pointerEvents: 'none' }}
                  >
                    {secSeats.length} {secSeats.length === 1 ? 'stoel' : 'stoelen'}
                  </text>
                )}

                {isRestricted && (
                  <>
                    <rect
                      x={section.position_x}
                      y={section.position_y}
                      width={section.width}
                      height={section.height}
                      rx={12}
                      fill="rgba(15,23,42,0.6)"
                      style={{ pointerEvents: 'none' }}
                    />
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
                  </>
                )}

                {!isRestricted && section.price_category && (
                  <>
                    <rect
                      x={section.position_x}
                      y={section.position_y + section.height - 24}
                      width={section.width}
                      height={24}
                      fill={hexToRgba(color, 0.2)}
                      rx={0}
                      style={{ pointerEvents: 'none' }}
                    />
                    <line
                      x1={section.position_x + 8}
                      y1={section.position_y + section.height - 24}
                      x2={section.position_x + section.width - 8}
                      y2={section.position_y + section.height - 24}
                      stroke={hexToRgba(color, 0.3)}
                      strokeWidth={0.5}
                    />
                    <text
                      x={section.position_x + 10}
                      y={section.position_y + section.height - 8}
                      fill="rgba(255,255,255,0.7)"
                      fontSize="10"
                      fontWeight="600"
                      style={{ pointerEvents: 'none' }}
                    >
                      {section.price_category}
                    </text>
                    <text
                      x={section.position_x + section.width - 10}
                      y={section.position_y + section.height - 8}
                      textAnchor="end"
                      fill="rgba(255,255,255,0.85)"
                      fontSize="10"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none' }}
                    >
                      EUR {Number(section.price_amount).toFixed(2)}
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
                    fill="rgba(148,163,184,0.6)"
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
                  let fillOpacity: number;
                  let strokeColor = '';
                  let strokeW = 0;

                  if (isRestricted) {
                    fillColor = '#374151';
                    fillOpacity = 0.12;
                  } else if (isSelected) {
                    fillColor = '#3b82f6';
                    fillOpacity = 1;
                    strokeColor = '#93c5fd';
                    strokeW = 2;
                  } else if (isSold) {
                    fillColor = '#1e293b';
                    fillOpacity = 0.45;
                  } else if (isReservedSeat) {
                    fillColor = '#f59e0b';
                    fillOpacity = 0.75;
                    strokeColor = '#fbbf24';
                    strokeW = 0.6;
                  } else if (isBlocked) {
                    fillColor = '#475569';
                    fillOpacity = 0.2;
                  } else if (isAvailable) {
                    fillColor = isHoveredSeat ? '#e2e8f0' : '#e2e8f0';
                    fillOpacity = isHoveredSeat ? 0.85 : 0.65;
                    strokeColor = '#94a3b8';
                    strokeW = 0.5;
                  } else {
                    fillColor = '#e2e8f0';
                    fillOpacity = 0.6;
                    strokeColor = '#94a3b8';
                    strokeW = 0.5;
                  }

                  const currentSize = isHoveredSeat && !isRestricted ? SEAT_CHAIR_SIZE * 1.08 : SEAT_CHAIR_SIZE;
                  const clickable = !isRestricted && (isAvailable || isSelected);

                  return (
                    <g key={seat.id} filter={clickable ? 'url(#seatShadow)' : undefined}>
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
                            ? 'drop-shadow(0 0 6px rgba(59,130,246,0.7))'
                            : isHoveredSeat && clickable
                            ? 'drop-shadow(0 0 4px rgba(255,255,255,0.3))'
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
          className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-2 bg-slate-800/90 backdrop-blur-sm border border-slate-600/40 rounded-lg text-white text-sm font-medium hover:bg-slate-700 transition-all shadow-lg"
        >
          <ArrowLeft className="w-4 h-4" />
          Overzicht
        </button>
      )}

      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-10">
        <div className="flex items-center bg-slate-800/90 backdrop-blur-sm border border-slate-600/40 rounded-lg overflow-hidden shadow-lg">
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
          className="w-10 h-10 flex items-center justify-center bg-slate-800/90 backdrop-blur-sm border border-slate-600/40 rounded-lg text-white hover:bg-slate-700 transition-colors shadow-lg focus-ring"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-4.5 h-4.5" />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-10 h-10 flex items-center justify-center bg-slate-800/90 backdrop-blur-sm border border-slate-600/40 rounded-lg text-white hover:bg-slate-700 transition-colors shadow-lg focus-ring"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-4.5 h-4.5" />
        </button>
        <button
          onClick={handleOverview}
          className="w-10 h-10 flex items-center justify-center bg-slate-800/90 backdrop-blur-sm border border-slate-600/40 rounded-lg text-white hover:bg-slate-700 transition-colors shadow-lg focus-ring"
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
      <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700/80 rounded-xl px-3.5 py-2.5 shadow-2xl text-sm whitespace-nowrap">
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
          className="absolute left-1/2 -bottom-1.5 w-3 h-3 bg-slate-900/95 border-r border-b border-slate-700/80 rotate-45"
          style={{ transform: 'translateX(-50%) rotate(45deg)' }}
        />
      </div>
    </div>
  );
}
