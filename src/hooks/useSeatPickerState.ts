import { useState, useEffect, useCallback, useRef } from 'react';
import type { Seat, SeatSection, VenueLayout } from '../types/seats';
import {
  fetchLayoutByEvent,
  fetchSections,
  fetchSeats,
  fetchEventInfo,
  holdSeatsPublic,
  releaseHoldsPublic,
  subscribeToSeatUpdates,
} from '../services/seatPickerService';

export interface PickerSeat extends Seat {
  cx: number;
  cy: number;
  sectionId: string;
}

export interface PriceCategory {
  id: string;
  name: string;
  color: string;
  price: number;
  sectionIds: string[];
}

interface EventInfo {
  id: string;
  name: string;
  slug: string;
  start_date: string;
  end_date: string;
  location: string;
  venue_name?: string;
}

const HEADER_H = 24;
const PAD = 10;
const MAX_SEATS = 10;

function computePickerSeats(section: SeatSection, seats: Seat[]): PickerSeat[] {
  if (seats.length === 0) return [];
  const sx = section.position_x;
  const sy = section.position_y;
  const sw = section.width;
  const sh = section.height;
  const bodyTop = sy + HEADER_H + PAD;
  const bodyH = sh - HEADER_H - PAD * 2;
  const bodyW = sw - PAD * 2;
  const centerX = sx + sw / 2;

  const minX = Math.min(...seats.map(s => s.x_position));
  const maxX = Math.max(...seats.map(s => s.x_position));
  const minY = Math.min(...seats.map(s => s.y_position));
  const maxY = Math.max(...seats.map(s => s.y_position));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const useScaling = rangeX > bodyW || rangeY > bodyH;
  const scaleX = bodyW / rangeX;
  const scaleY = bodyH / rangeY;

  return seats.map(seat => {
    let cx: number;
    let cy: number;
    if (useScaling) {
      cx = sx + PAD + (seat.x_position - minX) * scaleX;
      cy = bodyTop + (seat.y_position - minY) * scaleY;
    } else {
      cx = centerX + seat.x_position;
      cy = bodyTop + seat.y_position - minY;
      if (cy > sy + sh - PAD) cy = sy + sh - PAD;
    }
    return { ...seat, cx, cy, sectionId: section.id };
  });
}

export function useSeatPickerState(eventId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [layout, setLayout] = useState<VenueLayout | null>(null);
  const [sections, setSections] = useState<SeatSection[]>([]);
  const [allSeats, setAllSeats] = useState<PickerSeat[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [holdIds, setHoldIds] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [activePriceFilters, setActivePriceFilters] = useState<Set<string>>(new Set());

  const unsubRef = useRef<(() => void) | null>(null);

  const priceCategories: PriceCategory[] = sections.reduce<PriceCategory[]>((acc, sec) => {
    const key = sec.price_category || sec.name;
    const existing = acc.find(c => c.id === key);
    if (existing) {
      existing.sectionIds.push(sec.id);
    } else {
      acc.push({
        id: key,
        name: sec.price_category || sec.name,
        color: sec.color,
        price: Number(sec.price_amount),
        sectionIds: [sec.id],
      });
    }
    return acc;
  }, []);

  const visibleSeats = allSeats.filter(seat => {
    if (activePriceFilters.size === 0) return true;
    const section = sections.find(s => s.id === seat.sectionId);
    if (!section) return false;
    const cat = section.price_category || section.name;
    return activePriceFilters.has(cat);
  });

  const seatMap = new Map<string, PickerSeat>();
  for (const s of allSeats) seatMap.set(s.id, s);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [ev, layoutData] = await Promise.all([
          fetchEventInfo(eventId),
          fetchLayoutByEvent(eventId),
        ]);

        if (cancelled) return;
        if (!ev) { setError('Evenement niet gevonden'); setLoading(false); return; }
        if (!layoutData) { setError('Geen zaalplan beschikbaar'); setLoading(false); return; }

        setEventInfo(ev as EventInfo);
        setLayout(layoutData);

        const secs = await fetchSections(layoutData.id);
        if (cancelled) return;
        setSections(secs);

        const seatData = await fetchSeats(secs.map(s => s.id));
        if (cancelled) return;

        const computed: PickerSeat[] = [];
        for (const sec of secs) {
          const secSeats = seatData.filter(s => s.section_id === sec.id);
          computed.push(...computePickerSeats(sec, secSeats));
        }
        setAllSeats(computed);

        const sectionIds = secs.map(s => s.id);
        unsubRef.current = subscribeToSeatUpdates(sectionIds, (seatId, newStatus) => {
          setAllSeats(prev =>
            prev.map(s => s.id === seatId ? { ...s, status: newStatus as Seat['status'] } : s)
          );
          if (newStatus !== 'available') {
            setSelectedIds(prev => {
              if (!prev.has(seatId)) return prev;
              const next = new Set(prev);
              next.delete(seatId);
              return next;
            });
          }
        });

        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || 'Er is een fout opgetreden');
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      unsubRef.current?.();
    };
  }, [eventId]);

  const toggleSeat = useCallback((seatId: string) => {
    setHoldError(null);
    const seat = seatMap.get(seatId);
    if (!seat) return;
    if (seat.status === 'blocked' || seat.status === 'sold') return;
    if (seat.status === 'reserved' && !selectedIds.has(seatId)) return;

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(seatId)) {
        next.delete(seatId);
      } else {
        if (next.size >= MAX_SEATS) return prev;
        next.add(seatId);
      }
      return next;
    });
  }, [seatMap, selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setHoldError(null);
  }, []);

  const confirmHold = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setHoldLoading(true);
    setHoldError(null);
    try {
      const result = await holdSeatsPublic([...selectedIds], eventId);
      setHoldIds(result.hold_ids);
      setExpiresAt(result.expires_at);
    } catch (err: any) {
      setHoldError(err.message || 'Kon stoelen niet reserveren');
      if (err.message?.includes('no longer available')) {
        setSelectedIds(prev => {
          const next = new Set(prev);
          return next;
        });
      }
    }
    setHoldLoading(false);
  }, [selectedIds, eventId]);

  const releaseHold = useCallback(async () => {
    if (holdIds.length === 0) return;
    try {
      await releaseHoldsPublic(holdIds);
    } catch {}
    setHoldIds([]);
    setExpiresAt(null);
    setSelectedIds(new Set());
  }, [holdIds]);

  const togglePriceFilter = useCallback((categoryId: string) => {
    setActivePriceFilters(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  const getSelectedSeats = useCallback(() => {
    return [...selectedIds].map(id => seatMap.get(id)).filter(Boolean) as PickerSeat[];
  }, [selectedIds, seatMap]);

  const getTotalPrice = useCallback(() => {
    const seats = getSelectedSeats();
    return seats.reduce((total, seat) => {
      const section = sections.find(s => s.id === seat.sectionId);
      const price = seat.price_override ?? (section ? Number(section.price_amount) : 0);
      return total + price;
    }, 0);
  }, [getSelectedSeats, sections]);

  const canvasWidth = layout?.layout_data?.canvasWidth as number || 1600;
  const canvasHeight = layout?.layout_data?.canvasHeight as number || 1000;

  return {
    loading,
    error,
    eventInfo,
    layout,
    sections,
    allSeats,
    visibleSeats,
    selectedIds,
    holdIds,
    expiresAt,
    holdLoading,
    holdError,
    priceCategories,
    activePriceFilters,
    canvasWidth,
    canvasHeight,
    maxSeats: MAX_SEATS,
    toggleSeat,
    clearSelection,
    confirmHold,
    releaseHold,
    togglePriceFilter,
    getSelectedSeats,
    getTotalPrice,
    seatMap,
  };
}
