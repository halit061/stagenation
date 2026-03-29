import { useCallback, useRef, useState } from 'react';
import type { Seat, SeatSection } from '../types/seats';
import { updateSeatPositions } from '../services/seatService';
import type { HistoryAction } from './useSeatHistory';

interface ComputedSeat extends Seat {
  cx: number;
  cy: number;
  sectionId: string;
}

interface DragState {
  active: boolean;
  startSvgX: number;
  startSvgY: number;
  currentDx: number;
  currentDy: number;
  draggedSeatId: string;
  sectionId: string;
  originalPositions: Map<string, { x: number; y: number }>;
  originalDbPositions: Map<string, { x_position: number; y_position: number }>;
  outsideSection: boolean;
  collisionFlash: string | null;
}

const COLLISION_DIST = 5;
const GRID_SNAP = 25;

export function useSeatDrag(
  sections: SeatSection[],
  sectionSeats: Record<string, Seat[]>,
  selectedSeatIds: Set<string>,
  setSectionSeats: React.Dispatch<React.SetStateAction<Record<string, Seat[]>>>,
  pushAction: (action: HistoryAction) => void,
  showGrid: boolean,
) {
  const dragRef = useRef<DragState | null>(null);
  const [dragState, setDragState] = useState<{
    active: boolean;
    dx: number;
    dy: number;
    seatIds: Set<string>;
    outsideSection: boolean;
    collisionFlash: string | null;
  } | null>(null);
  const animFrameRef = useRef<number>(0);

  const getSectionBounds = useCallback((sectionId: string) => {
    const sec = sections.find(s => s.id === sectionId);
    if (!sec) return null;
    return {
      x: sec.position_x,
      y: sec.position_y,
      w: sec.width,
      h: sec.height,
    };
  }, [sections]);

  const startDrag = useCallback((
    seat: ComputedSeat,
    svgX: number,
    svgY: number,
    allComputedSeats: ComputedSeat[],
  ) => {
    const isSelected = selectedSeatIds.has(seat.id);
    const dragIds = isSelected ? selectedSeatIds : new Set([seat.id]);

    const allSameSection = [...dragIds].every(id => {
      const s = allComputedSeats.find(cs => cs.id === id);
      return s && s.sectionId === seat.sectionId;
    });

    if (!allSameSection) return false;

    const origPositions = new Map<string, { x: number; y: number }>();
    const origDbPositions = new Map<string, { x_position: number; y_position: number }>();
    for (const cs of allComputedSeats) {
      if (dragIds.has(cs.id)) {
        origPositions.set(cs.id, { x: cs.cx, y: cs.cy });
        origDbPositions.set(cs.id, { x_position: cs.x_position, y_position: cs.y_position });
      }
    }

    dragRef.current = {
      active: true,
      startSvgX: svgX,
      startSvgY: svgY,
      currentDx: 0,
      currentDy: 0,
      draggedSeatId: seat.id,
      sectionId: seat.sectionId,
      originalPositions: origPositions,
      originalDbPositions: origDbPositions,
      outsideSection: false,
      collisionFlash: null,
    };

    setDragState({
      active: true,
      dx: 0,
      dy: 0,
      seatIds: dragIds,
      outsideSection: false,
      collisionFlash: null,
    });

    return true;
  }, [selectedSeatIds]);

  const moveDrag = useCallback((svgX: number, svgY: number) => {
    const drag = dragRef.current;
    if (!drag || !drag.active) return;

    let dx = svgX - drag.startSvgX;
    let dy = svgY - drag.startSvgY;

    if (showGrid) {
      dx = Math.round(dx / GRID_SNAP) * GRID_SNAP;
      dy = Math.round(dy / GRID_SNAP) * GRID_SNAP;
    }

    drag.currentDx = dx;
    drag.currentDy = dy;

    const bounds = getSectionBounds(drag.sectionId);
    let outside = false;
    if (bounds) {
      const HEADER_H = 24;
      const PAD = 10;
      for (const [, orig] of drag.originalPositions) {
        const nx = orig.x + dx;
        const ny = orig.y + dy;
        if (
          nx < bounds.x + PAD ||
          nx > bounds.x + bounds.w - PAD ||
          ny < bounds.y + HEADER_H + PAD ||
          ny > bounds.y + bounds.h - PAD
        ) {
          outside = true;
          break;
        }
      }
    }

    drag.outsideSection = outside;

    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(() => {
      setDragState(prev => prev ? {
        ...prev,
        dx,
        dy,
        outsideSection: outside,
        collisionFlash: null,
      } : null);
    });
  }, [showGrid, getSectionBounds]);

  const endDrag = useCallback(async (allComputedSeats: ComputedSeat[]) => {
    const drag = dragRef.current;
    if (!drag || !drag.active) return;

    const dx = drag.currentDx;
    const dy = drag.currentDy;

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      dragRef.current = null;
      setDragState(null);
      return;
    }

    if (drag.outsideSection) {
      dragRef.current = null;
      setDragState(null);
      return;
    }

    const dragSeatIds = new Set(drag.originalPositions.keys());
    const sectionSeatsComputed = allComputedSeats.filter(
      s => s.sectionId === drag.sectionId && !dragSeatIds.has(s.id)
    );

    let collision = false;
    let collisionSeatId: string | null = null;
    for (const [, orig] of drag.originalPositions) {
      const nx = orig.x + dx;
      const ny = orig.y + dy;
      for (const other of sectionSeatsComputed) {
        const dist = Math.sqrt((nx - other.cx) ** 2 + (ny - other.cy) ** 2);
        if (dist < COLLISION_DIST) {
          collision = true;
          collisionSeatId = other.id;
          break;
        }
      }
      if (collision) break;
    }

    if (collision) {
      setDragState(prev => prev ? { ...prev, collisionFlash: collisionSeatId } : null);
      setTimeout(() => {
        dragRef.current = null;
        setDragState(null);
      }, 300);
      return;
    }

    const prevValues: Record<string, { x_position: number; y_position: number }> = {};
    const newValues: Record<string, { x_position: number; y_position: number }> = {};
    const updates: Array<{ id: string; x_position: number; y_position: number }> = [];

    for (const [id, origDb] of drag.originalDbPositions) {
      prevValues[id] = { x_position: origDb.x_position, y_position: origDb.y_position };

      const scaledDx = dx;
      const scaledDy = dy;

      const sec = sections.find(s => s.id === drag.sectionId);
      if (!sec) continue;

      const seats = sectionSeats[sec.id] || [];
      if (seats.length === 0) continue;

      const allX = seats.map(s => s.x_position);
      const allY = seats.map(s => s.y_position);
      const rangeX = Math.max(...allX) - Math.min(...allX) || 1;
      const rangeY = Math.max(...allY) - Math.min(...allY) || 1;
      const HEADER_H = 24;
      const PAD = 10;
      const bodyW = sec.width - PAD * 2;
      const bodyH = sec.height - HEADER_H - PAD * 2;
      const useScaling = rangeX > bodyW || rangeY > bodyH;
      const scaleX = useScaling ? bodyW / rangeX : 1;
      const scaleY = useScaling ? bodyH / rangeY : 1;

      const dbDx = useScaling ? scaledDx / scaleX : scaledDx;
      const dbDy = useScaling ? scaledDy / scaleY : scaledDy;

      const newX = origDb.x_position + dbDx;
      const newY = origDb.y_position + dbDy;

      newValues[id] = { x_position: newX, y_position: newY };
      updates.push({ id, x_position: newX, y_position: newY });
    }

    setSectionSeats(prev => {
      const next = { ...prev };
      const secId = drag.sectionId;
      if (next[secId]) {
        next[secId] = next[secId].map(s => {
          const nv = newValues[s.id];
          return nv ? { ...s, x_position: nv.x_position, y_position: nv.y_position } : s;
        });
      }
      return next;
    });

    pushAction({
      type: 'position_change',
      affected_ids: [...drag.originalPositions.keys()],
      previous_values: prevValues,
      new_values: newValues,
      timestamp: new Date(),
    });

    dragRef.current = null;
    setDragState(null);

    try {
      await updateSeatPositions(updates);
    } catch {
    }
  }, [sections, sectionSeats, setSectionSeats, pushAction]);

  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setDragState(null);
  }, []);

  const isDragging = dragState?.active ?? false;

  return {
    dragState,
    startDrag,
    moveDrag,
    endDrag,
    cancelDrag,
    isDragging,
  };
}
