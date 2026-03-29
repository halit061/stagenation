import { useCallback, useRef, useState } from 'react';
import type { Seat, SeatSection, SeatStatus, SeatType } from '../types/seats';
import {
  updateSeat,
  deleteSeatsById,
  insertSeats,
  updateSectionCapacity,
} from '../services/seatService';

export type HistoryActionType =
  | 'status_change'
  | 'type_change'
  | 'price_change'
  | 'position_change'
  | 'seats_added'
  | 'seats_deleted'
  | 'section_moved'
  | 'section_resized';

interface PositionValue {
  x_position: number;
  y_position: number;
}

interface SectionGeometry {
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export interface HistoryAction {
  type: HistoryActionType;
  affected_ids: string[];
  previous_values: Record<string, any>;
  new_values: Record<string, any>;
  timestamp: Date;
}

const MAX_HISTORY = 30;

export function useSeatHistory(
  setSectionSeats: React.Dispatch<React.SetStateAction<Record<string, Seat[]>>>,
  setSeatSections: React.Dispatch<React.SetStateAction<SeatSection[]>>,
  setSelectedSeatIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
) {
  const undoStackRef = useRef<HistoryAction[]>([]);
  const redoStackRef = useRef<HistoryAction[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const pushAction = useCallback((action: HistoryAction) => {
    undoStackRef.current.push(action);
    if (undoStackRef.current.length > MAX_HISTORY) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setUndoCount(undoStackRef.current.length);
    setRedoCount(0);
  }, []);

  const applyAction = useCallback(async (action: HistoryAction, reverse: boolean) => {
    const values = reverse ? action.previous_values : action.new_values;

    switch (action.type) {
      case 'status_change': {
        const statusMap = values as Record<string, SeatStatus>;
        const byStat = new Map<SeatStatus, string[]>();
        for (const [id, st] of Object.entries(statusMap)) {
          if (!byStat.has(st)) byStat.set(st, []);
          byStat.get(st)!.push(id);
        }
        for (const [status, ids] of byStat) {
          await updateSeat(ids, { status });
        }
        setSectionSeats(prev => {
          const next = { ...prev };
          for (const [secId, seats] of Object.entries(next)) {
            const changed = seats.some(s => statusMap[s.id] !== undefined);
            if (changed) {
              next[secId] = seats.map(s =>
                statusMap[s.id] !== undefined ? { ...s, status: statusMap[s.id] } : s
              );
            }
          }
          return next;
        });
        break;
      }
      case 'type_change': {
        const typeMap = values as Record<string, SeatType>;
        const byType = new Map<SeatType, string[]>();
        for (const [id, tp] of Object.entries(typeMap)) {
          if (!byType.has(tp)) byType.set(tp, []);
          byType.get(tp)!.push(id);
        }
        for (const [seat_type, ids] of byType) {
          await updateSeat(ids, { seat_type });
        }
        setSectionSeats(prev => {
          const next = { ...prev };
          for (const [secId, seats] of Object.entries(next)) {
            const changed = seats.some(s => typeMap[s.id] !== undefined);
            if (changed) {
              next[secId] = seats.map(s =>
                typeMap[s.id] !== undefined ? { ...s, seat_type: typeMap[s.id] } : s
              );
            }
          }
          return next;
        });
        break;
      }
      case 'price_change': {
        const priceMap = values as Record<string, number | null>;
        const byPrice = new Map<number | null, string[]>();
        for (const [id, p] of Object.entries(priceMap)) {
          if (!byPrice.has(p)) byPrice.set(p, []);
          byPrice.get(p)!.push(id);
        }
        for (const [price, ids] of byPrice) {
          await updateSeat(ids, { price_override: price });
        }
        setSectionSeats(prev => {
          const next = { ...prev };
          for (const [secId, seats] of Object.entries(next)) {
            const changed = seats.some(s => priceMap[s.id] !== undefined);
            if (changed) {
              next[secId] = seats.map(s =>
                priceMap[s.id] !== undefined ? { ...s, price_override: priceMap[s.id] } : s
              );
            }
          }
          return next;
        });
        break;
      }
      case 'position_change': {
        const posMap = values as Record<string, PositionValue>;
        const { supabase } = await import('../lib/supabaseClient');
        for (const [id, pos] of Object.entries(posMap)) {
          await supabase.from('seats').update({
            x_position: pos.x_position,
            y_position: pos.y_position,
          }).eq('id', id);
        }
        setSectionSeats(prev => {
          const next = { ...prev };
          for (const [secId, seats] of Object.entries(next)) {
            const changed = seats.some(s => posMap[s.id] !== undefined);
            if (changed) {
              next[secId] = seats.map(s =>
                posMap[s.id] ? { ...s, ...posMap[s.id] } : s
              );
            }
          }
          return next;
        });
        break;
      }
      case 'seats_added': {
        if (reverse) {
          const ids = action.affected_ids;
          await deleteSeatsById(ids);
          setSectionSeats(prev => {
            const next = { ...prev };
            const idSet = new Set(ids);
            for (const secId of Object.keys(next)) {
              if (next[secId].some(s => idSet.has(s.id))) {
                next[secId] = next[secId].filter(s => !idSet.has(s.id));
              }
            }
            return next;
          });
          const sectionCapacities = values as Record<string, number>;
          for (const [secId, cap] of Object.entries(sectionCapacities)) {
            setSeatSections(prev => prev.map(s => s.id === secId ? { ...s, capacity: cap } : s));
            await updateSectionCapacity(secId, cap);
          }
          setSelectedSeatIds(prev => {
            const next = new Set(prev);
            for (const id of ids) next.delete(id);
            return next;
          });
        } else {
          const seatsData = values as Record<string, Seat>;
          const bySec = new Map<string, Seat[]>();
          for (const seat of Object.values(seatsData)) {
            if (!bySec.has(seat.section_id)) bySec.set(seat.section_id, []);
            bySec.get(seat.section_id)!.push(seat);
          }
          for (const [secId, seats] of bySec) {
            const toInsert = seats.map(s => ({
              section_id: s.section_id,
              row_label: s.row_label,
              seat_number: s.seat_number,
              x_position: s.x_position,
              y_position: s.y_position,
              status: s.status,
              seat_type: s.seat_type,
            }));
            const inserted = await insertSeats(toInsert);
            setSectionSeats(prev => ({
              ...prev,
              [secId]: [...(prev[secId] || []), ...inserted],
            }));
          }
        }
        break;
      }
      case 'seats_deleted': {
        if (reverse) {
          const seatsData = action.previous_values as Record<string, Seat>;
          const bySec = new Map<string, Seat[]>();
          for (const seat of Object.values(seatsData)) {
            if (!bySec.has(seat.section_id)) bySec.set(seat.section_id, []);
            bySec.get(seat.section_id)!.push(seat);
          }
          for (const [secId, seats] of bySec) {
            const toInsert = seats.map(s => ({
              section_id: s.section_id,
              row_label: s.row_label,
              seat_number: s.seat_number,
              x_position: s.x_position,
              y_position: s.y_position,
              status: s.status,
              seat_type: s.seat_type,
            }));
            const inserted = await insertSeats(toInsert);
            setSectionSeats(prev => ({
              ...prev,
              [secId]: [...(prev[secId] || []), ...inserted],
            }));
            const newCap = (inserted.length);
            setSeatSections(prev => prev.map(s => {
              if (s.id === secId) {
                return { ...s, capacity: s.capacity + newCap };
              }
              return s;
            }));
            await updateSectionCapacity(secId, newCap);
          }
        } else {
          await deleteSeatsById(action.affected_ids);
          const idSet = new Set(action.affected_ids);
          setSectionSeats(prev => {
            const next = { ...prev };
            for (const secId of Object.keys(next)) {
              if (next[secId].some(s => idSet.has(s.id))) {
                next[secId] = next[secId].filter(s => !idSet.has(s.id));
              }
            }
            return next;
          });
          setSelectedSeatIds(new Set());
        }
        break;
      }
      case 'section_moved':
      case 'section_resized': {
        const geoMap = values as Record<string, SectionGeometry>;
        const { supabase } = await import('../lib/supabaseClient');
        for (const [id, geo] of Object.entries(geoMap)) {
          await supabase.from('seat_sections').update(geo).eq('id', id);
        }
        setSeatSections(prev => prev.map(s =>
          geoMap[s.id] ? { ...s, ...geoMap[s.id] } : s
        ));
        break;
      }
    }
  }, [setSectionSeats, setSeatSections, setSelectedSeatIds]);

  const undo = useCallback(async () => {
    const action = undoStackRef.current.pop();
    if (!action) return;
    try {
      await applyAction(action, true);
      redoStackRef.current.push(action);
      setUndoCount(undoStackRef.current.length);
      setRedoCount(redoStackRef.current.length);
      showToast('Actie ongedaan gemaakt', 'info');
    } catch (err: any) {
      undoStackRef.current.push(action);
      showToast(err.message || 'Fout bij ongedaan maken', 'error');
    }
  }, [applyAction, showToast]);

  const redo = useCallback(async () => {
    const action = redoStackRef.current.pop();
    if (!action) return;
    try {
      await applyAction(action, false);
      undoStackRef.current.push(action);
      setUndoCount(undoStackRef.current.length);
      setRedoCount(redoStackRef.current.length);
      showToast('Actie opnieuw uitgevoerd', 'info');
    } catch (err: any) {
      redoStackRef.current.push(action);
      showToast(err.message || 'Fout bij opnieuw uitvoeren', 'error');
    }
  }, [applyAction, showToast]);

  return {
    pushAction,
    undo,
    redo,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
  };
}
