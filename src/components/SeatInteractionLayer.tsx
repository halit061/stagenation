import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { SeatSection, Seat, SeatStatus, SeatType } from '../types/seats';
import { SvgSeatChair } from './SeatIcon';

const HEADER_H = 24;
const PAD = 10;
const SEAT_SIZE = 12;
const SEAT_SIZE_HOVER = 15;
const SEAT_HIT_R = 7;
const TOOLTIP_DELAY = 200;

const STATUS_COLOR: Record<SeatStatus, string> = {
  available: '#22c55e',
  blocked: '#4b5563',
  reserved: '#f59e0b',
  sold: '#ef4444',
};

const STATUS_LABEL: Record<SeatStatus, string> = {
  available: 'Beschikbaar',
  blocked: 'Geblokkeerd',
  reserved: 'Gereserveerd',
  sold: 'Verkocht',
};

const STATUS_TEXT_COLOR: Record<SeatStatus, string> = {
  available: '#4ade80',
  blocked: '#9ca3af',
  reserved: '#fbbf24',
  sold: '#f87171',
};

const TYPE_LABEL: Record<string, string> = {
  vip: 'VIP',
  wheelchair: 'Rolstoel',
  companion: 'Begeleidersplek',
  restricted_view: 'Beperkt zicht',
};

interface ComputedSeat extends Seat {
  cx: number;
  cy: number;
  sectionId: string;
}

export interface SeatSelectionInfo {
  selectedIds: Set<string>;
  seatMap: Map<string, ComputedSeat>;
}

export interface SeatDragRenderState {
  active: boolean;
  dx: number;
  dy: number;
  seatIds: Set<string>;
  outsideSection: boolean;
  collisionFlash: string | null;
}

interface Props {
  sections: SeatSection[];
  sectionSeats: Record<string, Seat[]>;
  selectedSeatIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
  zoom: number;
  isSelectTool: boolean;
  allowContextMenu?: boolean;
  marqueeActive: boolean;
  onSeatContextMenu?: (e: React.MouseEvent, seat: Seat, section: SeatSection) => void;
  dragState?: SeatDragRenderState | null;
  onDragStart?: (seat: ComputedSeat, svgX: number, svgY: number, allSeats: ComputedSeat[]) => boolean;
  onDragMove?: (svgX: number, svgY: number) => void;
  onDragEnd?: (allSeats: ComputedSeat[]) => void;
}

function computeSeatPositions(section: SeatSection, seats: Seat[]): ComputedSeat[] {
  if (seats.length === 0) return [];

  if (section.name === 'Vrije Plaatsing') {
    return seats.map((seat) => ({
      ...seat,
      cx: section.position_x + seat.x_position,
      cy: section.position_y + seat.y_position,
      sectionId: section.id,
    }));
  }

  const sx = section.position_x;
  const sy = section.position_y;
  const sw = section.width;
  const sh = section.height;
  const bodyTop = sy + HEADER_H + PAD;
  const bodyH = sh - HEADER_H - PAD * 2;
  const bodyW = sw - PAD * 2;
  const bodyLeft = sx + PAD;

  const minX = Math.min(...seats.map((s) => s.x_position));
  const maxX = Math.max(...seats.map((s) => s.x_position));
  const minY = Math.min(...seats.map((s) => s.y_position));
  const maxY = Math.max(...seats.map((s) => s.y_position));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const scaleX = bodyW / rangeX;
  const scaleY = bodyH / rangeY;
  const scale = Math.min(scaleX, scaleY);

  const fittedW = rangeX * scale;
  const fittedH = rangeY * scale;
  const offsetX = bodyLeft + (bodyW - fittedW) / 2;
  const offsetY = bodyTop + (bodyH - fittedH) / 2;

  return seats.map((seat) => {
    const cx = offsetX + (seat.x_position - minX) * scale;
    const cy = offsetY + (seat.y_position - minY) * scale;
    return { ...seat, cx, cy, sectionId: section.id };
  });
}

function SeatOverlayIcon({ seat, r }: { seat: ComputedSeat; r: number }) {
  const st = seat.seat_type as SeatType;
  const tiny = r * 0.45;

  if (st === 'vip' && seat.status === 'available') {
    return (
      <>
        <polygon
          points={`${seat.cx},${seat.cy - tiny * 1.1} ${seat.cx + tiny * 0.4},${seat.cy - tiny * 0.2} ${seat.cx + tiny * 1.1},${seat.cy - tiny * 0.2} ${seat.cx + tiny * 0.55},${seat.cy + tiny * 0.35} ${seat.cx + tiny * 0.75},${seat.cy + tiny * 1.1} ${seat.cx},${seat.cy + tiny * 0.6} ${seat.cx - tiny * 0.75},${seat.cy + tiny * 1.1} ${seat.cx - tiny * 0.55},${seat.cy + tiny * 0.35} ${seat.cx - tiny * 1.1},${seat.cy - tiny * 0.2} ${seat.cx - tiny * 0.4},${seat.cy - tiny * 0.2}`}
          fill="white" fillOpacity={0.9}
          className="pointer-events-none"
        />
      </>
    );
  }
  if (st === 'wheelchair' && seat.status === 'available') {
    return (
      <g className="pointer-events-none">
        <circle cx={seat.cx} cy={seat.cy + tiny * 0.2} r={tiny * 0.7} fill="none" stroke="white" strokeWidth={0.8} />
        <line x1={seat.cx} y1={seat.cy - tiny} x2={seat.cx} y2={seat.cy + tiny * 0.2} stroke="white" strokeWidth={0.8} />
        <line x1={seat.cx} y1={seat.cy - tiny * 0.2} x2={seat.cx + tiny * 0.5} y2={seat.cy - tiny * 0.2} stroke="white" strokeWidth={0.8} />
      </g>
    );
  }
  if (st === 'restricted_view' && seat.status === 'available') {
    return (
      <line
        x1={seat.cx - tiny} y1={seat.cy + tiny}
        x2={seat.cx + tiny} y2={seat.cy - tiny}
        stroke="white" strokeWidth={1} strokeOpacity={0.8}
        className="pointer-events-none"
      />
    );
  }
  if (seat.status === 'blocked') {
    return (
      <g className="pointer-events-none">
        <line x1={seat.cx - tiny * 0.6} y1={seat.cy - tiny * 0.6} x2={seat.cx + tiny * 0.6} y2={seat.cy + tiny * 0.6} stroke="white" strokeWidth={0.8} strokeOpacity={0.7} />
        <line x1={seat.cx + tiny * 0.6} y1={seat.cy - tiny * 0.6} x2={seat.cx - tiny * 0.6} y2={seat.cy + tiny * 0.6} stroke="white" strokeWidth={0.8} strokeOpacity={0.7} />
      </g>
    );
  }
  return null;
}

function getRowGroups(seats: ComputedSeat[]): Map<string, ComputedSeat[]> {
  const groups = new Map<string, ComputedSeat[]>();
  for (const s of seats) {
    const key = `${s.sectionId}:${s.row_label}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return groups;
}

export function SeatInteractionLayer({
  sections,
  sectionSeats,
  selectedSeatIds,
  onSelectionChange,
  svgRef,
  zoom,
  isSelectTool,
  allowContextMenu,
  marqueeActive,
  onSeatContextMenu,
  dragState,
  onDragStart,
  onDragMove,
  onDragEnd,
}: Props) {
  const [hoveredSeat, setHoveredSeat] = useState<ComputedSeat | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingMarquee = useRef(false);
  const seatDragPending = useRef<{ seat: ComputedSeat; x: number; y: number } | null>(null);
  const isSeatDragging = useRef(false);

  const allComputedSeats = useMemo(() => {
    const result: ComputedSeat[] = [];
    for (const section of sections) {
      const seats = sectionSeats[section.id] || [];
      result.push(...computeSeatPositions(section, seats));
    }
    return result;
  }, [sections, sectionSeats]);

  const seatById = useMemo(() => {
    const map = new Map<string, ComputedSeat>();
    for (const s of allComputedSeats) map.set(s.id, s);
    return map;
  }, [allComputedSeats]);

  const rowGroups = useMemo(() => getRowGroups(allComputedSeats), [allComputedSeats]);

  const rowLabels = useMemo(() => {
    const labels: { sectionId: string; label: string; x: number; y: number }[] = [];
    for (const section of sections) {
      const sectionComputedSeats = allComputedSeats.filter(s => s.sectionId === section.id);
      const rows = new Map<string, ComputedSeat[]>();
      for (const s of sectionComputedSeats) {
        if (!rows.has(s.row_label)) rows.set(s.row_label, []);
        rows.get(s.row_label)!.push(s);
      }
      for (const [label, seats] of rows) {
        const minX = Math.min(...seats.map(s => s.cx));
        const avgY = seats.reduce((sum, s) => sum + s.cy, 0) / seats.length;
        labels.push({ sectionId: section.id, label, x: minX - 12, y: avgY });
      }
    }
    return labels;
  }, [sections, allComputedSeats]);

  function getSvgPoint(e: React.MouseEvent | MouseEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgP = pt.matrixTransform(ctm.inverse());
    return { x: svgP.x, y: svgP.y };
  }

  function findSeatAt(svgX: number, svgY: number): ComputedSeat | null {
    const hitR = Math.max(SEAT_HIT_R + 2, (SEAT_HIT_R + 2) / zoom);
    let closest: ComputedSeat | null = null;
    let closestDist = Infinity;
    for (const s of allComputedSeats) {
      const dx = s.cx - svgX;
      const dy = s.cy - svgY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= hitR && dist < closestDist) {
        closest = s;
        closestDist = dist;
      }
    }
    return closest;
  }

  const handleSeatClick = useCallback((e: React.MouseEvent, seat: ComputedSeat) => {
    e.stopPropagation();
    if (!isSelectTool || isSeatDragging.current) return;

    const newSet = new Set(selectedSeatIds);

    if (e.shiftKey) {
      const lastSelected = [...selectedSeatIds].pop();
      if (lastSelected) {
        const lastSeat = seatById.get(lastSelected);
        if (lastSeat && lastSeat.sectionId === seat.sectionId && lastSeat.row_label === seat.row_label) {
          const key = `${seat.sectionId}:${seat.row_label}`;
          const rowSeats = rowGroups.get(key) || [];
          const sorted = [...rowSeats].sort((a, b) => a.seat_number - b.seat_number);
          const idxA = sorted.findIndex(s => s.id === lastSelected);
          const idxB = sorted.findIndex(s => s.id === seat.id);
          const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
          for (let i = lo; i <= hi; i++) newSet.add(sorted[i].id);
          onSelectionChange(newSet);
          return;
        }
      }
      if (newSet.has(seat.id)) newSet.delete(seat.id);
      else newSet.add(seat.id);
    } else {
      if (newSet.has(seat.id)) {
        newSet.delete(seat.id);
      } else {
        newSet.add(seat.id);
      }
    }
    onSelectionChange(newSet);
  }, [isSelectTool, selectedSeatIds, onSelectionChange, seatById, rowGroups]);

  const handleSeatMouseDown = useCallback((e: React.MouseEvent, seat: ComputedSeat) => {
    if (!isSelectTool || !onDragStart || marqueeActive || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const p = getSvgPoint(e);
    seatDragPending.current = { seat, x: p.x, y: p.y };
    isSeatDragging.current = false;
  }, [isSelectTool, onDragStart, marqueeActive]);

  useEffect(() => {
    function handleGlobalMouseMove(e: MouseEvent) {
      if (!seatDragPending.current || isSeatDragging.current) {
        if (isSeatDragging.current && onDragMove) {
          const svg = svgRef.current;
          if (!svg) return;
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          const ctm = svg.getScreenCTM();
          if (!ctm) return;
          const svgP = pt.matrixTransform(ctm.inverse());
          onDragMove(svgP.x, svgP.y);
        }
        return;
      }
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgP = pt.matrixTransform(ctm.inverse());
      const dx = svgP.x - seatDragPending.current.x;
      const dy = svgP.y - seatDragPending.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        const started = onDragStart?.(seatDragPending.current.seat, seatDragPending.current.x, seatDragPending.current.y, allComputedSeats);
        if (started) {
          isSeatDragging.current = true;
        } else {
          seatDragPending.current = null;
        }
      }
    }
    function handleGlobalMouseUp() {
      if (isSeatDragging.current && onDragEnd) {
        onDragEnd(allComputedSeats);
      }
      seatDragPending.current = null;
      isSeatDragging.current = false;
    }
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [svgRef, onDragStart, onDragMove, onDragEnd, allComputedSeats]);

  const handleRowLabelClick = useCallback((e: React.MouseEvent, sectionId: string, label: string) => {
    e.stopPropagation();
    if (!isSelectTool) return;
    const key = `${sectionId}:${label}`;
    const rowSeats = rowGroups.get(key) || [];
    const newSet = new Set(selectedSeatIds);

    if (e.shiftKey) {
      const lastSelected = [...selectedSeatIds].pop();
      if (lastSelected) {
        const lastSeat = seatById.get(lastSelected);
        if (lastSeat && lastSeat.sectionId === sectionId) {
          const sectionRows = [...rowGroups.entries()]
            .filter(([k]) => k.startsWith(sectionId + ':'))
            .map(([k, seats]) => ({ label: k.split(':')[1], seats }))
            .sort((a, b) => a.label.localeCompare(b.label));
          const idxA = sectionRows.findIndex(r => r.seats.some(s => s.id === lastSelected));
          const idxB = sectionRows.findIndex(r => r.label === label);
          if (idxA >= 0 && idxB >= 0) {
            const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
            for (let i = lo; i <= hi; i++) {
              for (const s of sectionRows[i].seats) newSet.add(s.id);
            }
            onSelectionChange(newSet);
            return;
          }
        }
      }
    }

    for (const s of rowSeats) newSet.add(s.id);
    onSelectionChange(newSet);
  }, [isSelectTool, selectedSeatIds, onSelectionChange, rowGroups, seatById]);

  const handleSectionHeaderClick = useCallback((e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    if (!isSelectTool) return;
    const sectionComputedSeats = allComputedSeats.filter(s => s.sectionId === sectionId);
    const newSet = new Set(selectedSeatIds);
    for (const s of sectionComputedSeats) newSet.add(s.id);
    onSelectionChange(newSet);
  }, [isSelectTool, selectedSeatIds, onSelectionChange, allComputedSeats]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (marqueeActive && isDraggingMarquee.current && marqueeStartRef.current) {
      const p = getSvgPoint(e);
      setMarqueeRect({
        x1: marqueeStartRef.current.x,
        y1: marqueeStartRef.current.y,
        x2: p.x,
        y2: p.y,
      });
      return;
    }

    if (!isSelectTool) return;
    const p = getSvgPoint(e);
    const seat = findSeatAt(p.x, p.y);

    if (seat && seat.id !== hoveredSeat?.id) {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => {
        setHoveredSeat(seat);
        const svg = svgRef.current;
        if (svg) {
          const ctm = svg.getScreenCTM();
          if (ctm) {
            const screenX = seat.cx * ctm.a + ctm.e;
            const screenY = seat.cy * ctm.d + ctm.f;
            setTooltipPos({ x: screenX, y: screenY });
          }
        }
      }, TOOLTIP_DELAY);
    } else if (!seat && hoveredSeat) {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
      setHoveredSeat(null);
      setTooltipPos(null);
    }
  }, [isSelectTool, hoveredSeat, marqueeActive, svgRef, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!marqueeActive || !isSelectTool) return;
    const p = getSvgPoint(e);
    marqueeStartRef.current = p;
    isDraggingMarquee.current = true;
    setMarqueeRect({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  }, [marqueeActive, isSelectTool]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isDraggingMarquee.current || !marqueeRect) {
      isDraggingMarquee.current = false;
      return;
    }
    isDraggingMarquee.current = false;

    const x = Math.min(marqueeRect.x1, marqueeRect.x2);
    const y = Math.min(marqueeRect.y1, marqueeRect.y2);
    const w = Math.abs(marqueeRect.x2 - marqueeRect.x1);
    const h = Math.abs(marqueeRect.y2 - marqueeRect.y1);

    if (w < 3 && h < 3) {
      setMarqueeRect(null);
      return;
    }

    const newSet = e.shiftKey ? new Set(selectedSeatIds) : new Set<string>();
    for (const seat of allComputedSeats) {
      if (seat.cx >= x && seat.cx <= x + w && seat.cy >= y && seat.cy <= y + h) {
        newSet.add(seat.id);
      }
    }
    onSelectionChange(newSet);
    setMarqueeRect(null);
  }, [marqueeRect, selectedSeatIds, allComputedSeats, onSelectionChange]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onSelectionChange(new Set());
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        if (selectedSeatIds.size === 0) return;
        e.preventDefault();
        const lastId = [...selectedSeatIds].pop();
        if (!lastId) return;
        const lastSeat = seatById.get(lastId);
        if (!lastSeat) return;
        const sectionComputedSeats = allComputedSeats.filter(s => s.sectionId === lastSeat.sectionId);
        const newSet = new Set<string>();
        for (const s of sectionComputedSeats) newSet.add(s.id);
        onSelectionChange(newSet);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSeatIds, onSelectionChange, seatById, allComputedSeats]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const seatSizeComputed = useMemo(() => {
    if (allComputedSeats.length === 0) return SEAT_SIZE;
    let minSize = SEAT_SIZE;
    for (const section of sections) {
      const spacingX = section.width / (section.seats_per_row || 1);
      const spacingY = (section.height - HEADER_H - PAD * 2) / (section.rows_count || 1);
      const minSpacing = Math.min(spacingX, spacingY);
      const s = Math.max(6, Math.min(SEAT_SIZE, minSpacing * 0.7));
      if (s < minSize || minSize === SEAT_SIZE) minSize = s;
    }
    return minSize;
  }, [allComputedSeats.length, sections]);

  const hoverSize = seatSizeComputed * (SEAT_SIZE_HOVER / SEAT_SIZE);

  const marqueePreviewIds = useMemo(() => {
    if (!marqueeRect) return new Set<string>();
    const x = Math.min(marqueeRect.x1, marqueeRect.x2);
    const y = Math.min(marqueeRect.y1, marqueeRect.y2);
    const w = Math.abs(marqueeRect.x2 - marqueeRect.x1);
    const h = Math.abs(marqueeRect.y2 - marqueeRect.y1);
    const ids = new Set<string>();
    for (const seat of allComputedSeats) {
      if (seat.cx >= x && seat.cx <= x + w && seat.cy >= y && seat.cy <= y + h) {
        ids.add(seat.id);
      }
    }
    return ids;
  }, [marqueeRect, allComputedSeats]);

  const findSectionForSeat = useCallback((seatId: string) => {
    const seat = seatById.get(seatId);
    if (!seat) return null;
    return sections.find(s => s.id === seat.sectionId) || null;
  }, [seatById, sections]);

  const sectionMap = useMemo(() => {
    const map = new Map<string, typeof sections[0]>();
    for (const s of sections) map.set(s.id, s);
    return map;
  }, [sections]);

  function getSectionTransform(sectionId: string) {
    const sec = sectionMap.get(sectionId);
    if (!sec || !sec.rotation) return undefined;
    const cx = sec.position_x + sec.width / 2;
    const cy = sec.position_y + sec.height / 2;
    return { transform: `rotate(${sec.rotation}deg)`, transformOrigin: `${cx}px ${cy}px` } as React.CSSProperties;
  }

  return (
    <>
      <g
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={{ pointerEvents: marqueeActive ? 'all' : 'none' }}
      >
        {marqueeActive && (
          <rect x={0} y={0} width={9999} height={9999} fill="transparent" style={{ pointerEvents: 'all', cursor: 'crosshair' }} />
        )}
      </g>

      {sections.filter(s => s.name !== 'Vrije Plaatsing').map((section) => (
        <g key={`labels-${section.id}`} style={getSectionTransform(section.id)}>
          {rowLabels
            .filter(rl => rl.sectionId === section.id)
            .map((rl) => (
              <text
                key={`rl-${rl.sectionId}-${rl.label}`}
                x={rl.x}
                y={rl.y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="rgba(255,255,255,0.35)"
                fontSize="9"
                fontWeight="500"
                style={{ cursor: isSelectTool ? 'pointer' : 'default', pointerEvents: isSelectTool ? 'all' : 'none' }}
                onClick={(e) => handleRowLabelClick(e, rl.sectionId, rl.label)}
              >
                {rl.label}
              </text>
            ))}
          <rect
            x={section.position_x}
            y={section.position_y}
            width={section.width}
            height={HEADER_H}
            fill="transparent"
            style={{ cursor: isSelectTool ? 'pointer' : 'default', pointerEvents: isSelectTool ? 'all' : 'none' }}
            onClick={(e) => handleSectionHeaderClick(e, section.id)}
          />
        </g>
      ))}

      {dragState?.active && dragState.outsideSection && sections.map(sec => {
        const hasDraggedSeats = [...(dragState.seatIds)].some(id => {
          const s = seatById.get(id);
          return s && s.sectionId === sec.id;
        });
        if (!hasDraggedSeats) return null;
        return (
          <rect
            key={`warn-${sec.id}`}
            x={sec.position_x}
            y={sec.position_y}
            width={sec.width}
            height={sec.height}
            fill="none"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="6 3"
            rx="4"
            className="pointer-events-none"
            style={{ opacity: 0.8 }}
          />
        );
      })}

      {sections.map((section) => {
        const sectionSeatsComputed = allComputedSeats.filter(s => s.sectionId === section.id);
        if (sectionSeatsComputed.length === 0) return null;
        return (
          <g key={`seats-${section.id}`} style={getSectionTransform(section.id)}>
            {sectionSeatsComputed.map((seat) => {
              const isDragTarget = dragState?.active && dragState.seatIds.has(seat.id);
              const isCollisionFlash = dragState?.collisionFlash === seat.id;
              const isSelected = selectedSeatIds.has(seat.id);
              const isHovered = hoveredSeat?.id === seat.id && !dragState?.active;
              const isMarqueePreview = marqueePreviewIds.has(seat.id);
              const isReserved = seat.status === 'reserved';
              const isVip = seat.seat_type === 'vip' && seat.status === 'available';
              const baseColor = isCollisionFlash ? '#ef4444' : isVip ? '#fbbf24' : STATUS_COLOR[seat.status as SeatStatus] || '#22c55e';
              const borderColor = isCollisionFlash ? '#dc2626' : isVip ? '#d97706' : (seat.status === 'sold' ? '#dc2626' : seat.status === 'blocked' ? '#6b7280' : seat.status === 'reserved' ? '#d97706' : '#15803d');
              const currentSize = isHovered ? hoverSize : seatSizeComputed;

              const manyDragging = dragState?.active && dragState.seatIds.size > 50;
              const renderCx = isDragTarget ? seat.cx + (dragState?.dx ?? 0) : seat.cx;
              const renderCy = isDragTarget ? seat.cy + (dragState?.dy ?? 0) : seat.cy;

              return (
                <g key={seat.id} style={{ pointerEvents: ((isSelectTool || allowContextMenu) && !dragState?.active) ? 'all' : 'none' }}>
                  {isDragTarget && (
                    <SvgSeatChair
                      cx={seat.cx}
                      cy={seat.cy}
                      size={seatSizeComputed}
                      color={baseColor}
                      opacity={0.25}
                      strokeColor="rgba(255,255,255,0.15)"
                      strokeWidth={1}
                      className="pointer-events-none"
                    />
                  )}
                  <SvgSeatChair
                    cx={renderCx}
                    cy={renderCy}
                    size={currentSize}
                    color={baseColor}
                    opacity={isReserved ? 0.7 : isDragTarget ? 0.95 : 0.9}
                    selected={isSelected || isMarqueePreview}
                    strokeColor={isSelected ? '#ffffff' : isMarqueePreview ? '#93c5fd' : borderColor}
                    strokeWidth={isSelected ? 2.5 : isMarqueePreview ? 2 : 1.5}
                    className={`seat-round-transition ${isReserved && !isDragTarget ? 'seat-reserved-pulse' : ''} ${isCollisionFlash ? 'seat-collision-flash' : ''}`}
                    style={{
                      cursor: isDragTarget ? 'grabbing' : (isSelectTool || allowContextMenu) ? 'pointer' : 'default',
                      filter: isDragTarget
                        ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))'
                        : isSelected ? 'drop-shadow(0 0 3px rgba(255,255,255,0.6))'
                        : isHovered ? 'drop-shadow(0 0 2px rgba(255,255,255,0.3))' : undefined,
                      transition: isCollisionFlash ? 'fill 150ms' : undefined,
                    }}
                    onClick={(e) => handleSeatClick(e, seat)}
                    onMouseDown={(e) => handleSeatMouseDown(e, seat)}
                    onMouseMove={handleMouseMove}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (onSeatContextMenu) {
                        const sec = sections.find(s => s.id === seat.sectionId);
                        if (sec) onSeatContextMenu(e, seat, sec);
                      }
                    }}
                  />
                  {(!manyDragging || !isDragTarget) && (
                    <g transform={isDragTarget ? `translate(${dragState?.dx ?? 0}, ${dragState?.dy ?? 0})` : undefined}>
                      <SeatOverlayIcon seat={seat} r={currentSize / 2} />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {marqueeRect && (
        <rect
          x={Math.min(marqueeRect.x1, marqueeRect.x2)}
          y={Math.min(marqueeRect.y1, marqueeRect.y2)}
          width={Math.abs(marqueeRect.x2 - marqueeRect.x1)}
          height={Math.abs(marqueeRect.y2 - marqueeRect.y1)}
          fill="rgba(59,130,246,0.08)"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeDasharray="6 4"
          className="marquee-rect pointer-events-none"
          rx="2"
        />
      )}

      {hoveredSeat && tooltipPos && <SeatTooltipPortal seat={hoveredSeat} pos={tooltipPos} findSection={findSectionForSeat} />}
    </>
  );
}

function SeatTooltipPortal({ seat, pos, findSection }: {
  seat: ComputedSeat;
  pos: { x: number; y: number };
  findSection: (id: string) => SeatSection | null;
}) {
  const section = findSection(seat.id);
  const price = seat.price_override ?? section?.price_amount ?? 0;
  const aboveSpace = pos.y > 80;
  const top = aboveSpace ? pos.y - 10 : pos.y + 20;
  const transform = aboveSpace ? 'translate(-50%, -100%)' : 'translate(-50%, 0)';

  return (
    <foreignObject x={0} y={0} width={1} height={1} overflow="visible" className="pointer-events-none" style={{ position: 'relative', zIndex: 9999 }}>
      <div
        className="seat-tooltip-enter"
        style={{
          position: 'fixed',
          left: pos.x,
          top,
          transform,
          background: 'rgba(0,0,0,0.92)',
          color: 'white',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: 'nowrap',
          zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          Rij {seat.row_label} - Stoel {seat.seat_number}
        </div>
        <div style={{ color: STATUS_TEXT_COLOR[seat.status as SeatStatus] || '#fff' }}>
          {STATUS_LABEL[seat.status as SeatStatus] || seat.status}
        </div>
        {seat.seat_type !== 'regular' && (
          <div style={{ color: '#a5b4fc' }}>
            {TYPE_LABEL[seat.seat_type] || seat.seat_type}
          </div>
        )}
        <div style={{ color: '#94a3b8' }}>
          EUR {price.toFixed(2)}
        </div>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            ...(aboveSpace ? {
              bottom: -6,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgba(0,0,0,0.92)',
            } : {
              top: -6,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: '6px solid rgba(0,0,0,0.92)',
            }),
          }}
        />
      </div>
    </foreignObject>
  );
}

export { computeSeatPositions };
export type { ComputedSeat };
