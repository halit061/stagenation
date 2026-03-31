import { useState, useEffect, useCallback, useRef } from 'react';
import type { Seat, SeatSection, VenueLayout, BestAvailableStrategy } from '../types/seats';
import { supabase } from '../lib/supabaseClient';
import {
  fetchLayoutByEvent,
  fetchSections,
  fetchSeats,
  fetchEventInfo,
  fetchLinkedSectionIds,
  fetchFloorplanObjects,
  holdSeatsAtomic,
  extendHolds,
  releaseSessionHolds,
  refreshAllSeats,
  subscribeToSeatUpdates,
  saveHoldToStorage,
  loadHoldFromStorage,
  clearHoldStorage,
  checkRateLimit,
  recordRateAttempt,
  getSessionId,
} from '../services/seatPickerService';
import type { FloorplanObject } from '../services/seatPickerService';
import { findBestAvailable } from '../lib/bestAvailable';

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

export interface SeatNotification {
  id: string;
  type: 'taken' | 'unavailable';
  message: string;
  timestamp: number;
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
  const bodyLeft = sx + PAD;

  const minX = Math.min(...seats.map(s => s.x_position));
  const maxX = Math.max(...seats.map(s => s.x_position));
  const minY = Math.min(...seats.map(s => s.y_position));
  const maxY = Math.max(...seats.map(s => s.y_position));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const scaleX = bodyW / rangeX;
  const scaleY = bodyH / rangeY;
  const scale = Math.min(scaleX, scaleY);

  const fittedW = rangeX * scale;
  const fittedH = rangeY * scale;
  const offsetX = bodyLeft + (bodyW - fittedW) / 2;
  const offsetY = bodyTop + (bodyH - fittedH) / 2;

  return seats.map(seat => {
    const cx = offsetX + (seat.x_position - minX) * scale;
    const cy = offsetY + (seat.y_position - minY) * scale;
    return { ...seat, cx, cy, sectionId: section.id };
  });
}

export function useSeatPickerState(eventId: string, ticketTypeId?: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [layout, setLayout] = useState<VenueLayout | null>(null);
  const [sections, setSections] = useState<SeatSection[]>([]);
  const [floorplanObjects, setFloorplanObjects] = useState<FloorplanObject[]>([]);
  const [allSeats, setAllSeats] = useState<PickerSeat[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [holdIds, setHoldIds] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [holdExtended, setHoldExtended] = useState(false);
  const [holdActive, setHoldActive] = useState(false);
  const [holdExpired, setHoldExpired] = useState(false);
  const [activePriceFilters, setActivePriceFilters] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<SeatNotification[]>([]);
  const [flashingSeatIds, setFlashingSeatIds] = useState<Set<string>>(new Set());
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [bestAvailableResult, setBestAvailableResult] = useState<'none' | 'found' | 'empty'>('none');
  const [bestAvailableRetries, setBestAvailableRetries] = useState(0);
  const [highlightedSeatIds, setHighlightedSeatIds] = useState<Set<string>>(new Set());
  const [allowedSectionIds, setAllowedSectionIds] = useState<string[] | null>(null);

  const lastBestAvailableOpts = useRef<{
    count: number;
    strategy: BestAvailableStrategy;
    sectionId?: string;
    priceCategory?: string;
    keepTogether: boolean;
    excludedIds: Set<string>;
  } | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const sectionsRef = useRef<SeatSection[]>([]);

  sectionsRef.current = sections;

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

  const addNotification = useCallback((type: SeatNotification['type'], message: string) => {
    const id = crypto.randomUUID();
    setNotifications(prev => [...prev, { id, type, message, timestamp: Date.now() }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const triggerFlash = useCallback((seatId: string) => {
    setFlashingSeatIds(prev => {
      const next = new Set(prev);
      next.add(seatId);
      return next;
    });
    setTimeout(() => {
      setFlashingSeatIds(prev => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
    }, 500);
  }, []);

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

        const [secs, fpObjects] = await Promise.all([
          fetchSections(layoutData.id),
          fetchFloorplanObjects(eventId),
        ]);
        if (cancelled) return;
        setSections(secs);
        setFloorplanObjects(fpObjects);

        if (ticketTypeId) {
          const linked = await fetchLinkedSectionIds(ticketTypeId);
          if (cancelled) return;
          setAllowedSectionIds(linked.length > 0 ? linked : null);
        }

        const seatData = await fetchSeats(secs.map(s => s.id));
        if (cancelled) return;

        const computed: PickerSeat[] = [];
        for (const sec of secs) {
          const secSeats = seatData.filter(s => s.section_id === sec.id);
          computed.push(...computePickerSeats(sec, secSeats));
        }
        setAllSeats(computed);

        const sectionIds = secs.map(s => s.id);
        unsubRef.current = subscribeToSeatUpdates(
          layoutData.id,
          sectionIds,
          (updatedSeat) => {
            const seatId = updatedSeat.id;
            const newStatus = updatedSeat.status as Seat['status'] | undefined;
            if (!newStatus) return;

            triggerFlash(seatId);

            setAllSeats(prev =>
              prev.map(s => s.id === seatId ? { ...s, status: newStatus } : s)
            );

            if (newStatus !== 'available') {
              setSelectedIds(prev => {
                if (!prev.has(seatId)) return prev;
                const next = new Set(prev);
                next.delete(seatId);

                const seat = computed.find(s => s.id === seatId);
                if (seat) {
                  const msg = newStatus === 'blocked'
                    ? `Stoel Rij ${seat.row_label} - Stoel ${seat.seat_number} is niet meer beschikbaar`
                    : `Stoel Rij ${seat.row_label} - Stoel ${seat.seat_number} is zojuist door iemand anders gereserveerd`;
                  addNotification(newStatus === 'blocked' ? 'unavailable' : 'taken', msg);
                }

                return next;
              });
            }
          },
          (status) => {
            setConnectionStatus(status);
            if (status === 'connected') {
              refreshAllSeats(sectionIds).then(freshSeats => {
                const recomputed: PickerSeat[] = [];
                for (const sec of sectionsRef.current) {
                  const secSeats = freshSeats.filter(s => s.section_id === sec.id);
                  recomputed.push(...computePickerSeats(sec, secSeats));
                }
                setAllSeats(recomputed);
              }).catch(() => {});
            }
          },
        );

        const storedHold = loadHoldFromStorage();
        if (storedHold && storedHold.event_id === eventId && storedHold.session_id === getSessionId()) {
          const remaining = new Date(storedHold.expires_at).getTime() - Date.now();
          if (remaining > 0) {
            setHoldIds(storedHold.hold_ids);
            setExpiresAt(storedHold.expires_at);
            setHoldActive(true);
            setHoldExtended(storedHold.extended);
          } else {
            clearHoldStorage();
            setHoldExpired(true);
          }
        }

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

  useEffect(() => {
    if (!layout?.id || !eventId) return;
    const presenceChannel = supabase
      .channel(`admin-seats-${layout.id}`)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user: getSessionId(),
            online_at: new Date().toISOString(),
          });
        }
      });
    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [layout?.id, eventId]);

  const toggleSeat = useCallback((seatId: string) => {
    if (holdActive) return;
    setHoldError(null);
    const seat = seatMap.get(seatId);
    if (!seat) return;
    if (seat.status === 'blocked' || seat.status === 'sold') return;
    if (seat.status === 'reserved' && !selectedIds.has(seatId)) return;
    if (allowedSectionIds && !allowedSectionIds.includes(seat.sectionId) && !selectedIds.has(seatId)) return;

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
  }, [seatMap, selectedIds, holdActive, allowedSectionIds]);

  const clearSelection = useCallback(() => {
    if (holdActive) return;
    setSelectedIds(new Set());
    setHoldError(null);
  }, [holdActive]);

  const confirmHold = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const rateCheck = checkRateLimit();
    if (!rateCheck.allowed) {
      const waitMins = Math.ceil(rateCheck.retryAfterMs / 60_000);
      setHoldError(`Je hebt te veel pogingen gedaan. Wacht ${waitMins} minuten en probeer het opnieuw.`);
      return;
    }

    setHoldLoading(true);
    setHoldError(null);
    recordRateAttempt();

    try {
      const result = await holdSeatsAtomic([...selectedIds], eventId);

      if (result.success && result.hold_ids && result.expires_at) {
        setHoldIds(result.hold_ids);
        setExpiresAt(result.expires_at);
        setHoldActive(true);
        setHoldExtended(false);
        setHoldExpired(false);
        saveHoldToStorage({
          hold_ids: result.hold_ids,
          expires_at: result.expires_at,
          event_id: eventId,
          session_id: getSessionId(),
          extended: false,
          ticket_type_id: ticketTypeId,
        });
      } else if (result.error === 'seats_unavailable' && result.unavailable_seats) {
        const unavailIds = new Set(result.unavailable_seats);
        const unavailLabels: string[] = [];
        setSelectedIds(prev => {
          const next = new Set(prev);
          for (const uid of unavailIds) {
            next.delete(uid);
            const seat = seatMap.get(uid);
            if (seat) {
              unavailLabels.push(`Rij ${seat.row_label} - Stoel ${seat.seat_number}`);
            }
          }
          return next;
        });
        setAllSeats(prev =>
          prev.map(s => unavailIds.has(s.id) ? { ...s, status: 'reserved' as Seat['status'] } : s)
        );
        setHoldError(
          `De volgende stoelen zijn helaas niet meer beschikbaar: ${unavailLabels.join(', ')}. Pas je selectie aan.`
        );
      } else {
        setHoldError(result.error || 'Er ging iets mis bij het reserveren');
      }
    } catch (err: any) {
      setHoldError(err.message || 'Er ging iets mis bij het reserveren. Probeer het opnieuw.');
    }
    setHoldLoading(false);
  }, [selectedIds, eventId, seatMap]);

  const releaseHold = useCallback(async () => {
    try {
      await releaseSessionHolds(eventId);
    } catch {}
    setHoldIds([]);
    setExpiresAt(null);
    setHoldActive(false);
    setHoldExtended(false);
    setSelectedIds(new Set());
    clearHoldStorage();
  }, [eventId]);

  const handleHoldExpired = useCallback(() => {
    setHoldExpired(true);
    setHoldActive(false);
    clearHoldStorage();
    releaseSessionHolds(eventId).catch(() => {});
  }, [eventId]);

  const dismissExpiredModal = useCallback(() => {
    setHoldExpired(false);
    setHoldIds([]);
    setExpiresAt(null);
    setSelectedIds(new Set());
  }, []);

  const extendHold = useCallback(async () => {
    if (holdExtended) return;
    try {
      const result = await extendHolds(eventId);
      if (result.success && result.expires_at) {
        setExpiresAt(result.expires_at);
        setHoldExtended(true);
        const stored = loadHoldFromStorage();
        if (stored) {
          saveHoldToStorage({ ...stored, expires_at: result.expires_at, extended: true });
        }
      }
    } catch {}
  }, [eventId, holdExtended]);

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

  const findBest = useCallback((opts: {
    count: number;
    strategy: BestAvailableStrategy;
    sectionId?: string;
    priceCategory?: string;
    keepTogether: boolean;
  }) => {
    if (holdActive) return;
    const results = findBestAvailable(allSeats, sections, {
      ...opts,
      excludeSeatIds: new Set(),
      allowedSectionIds: allowedSectionIds ?? undefined,
    });

    if (results.length === 0) {
      setBestAvailableResult('empty');
      return;
    }

    const newIds = new Set(results.map(s => s.id));
    setSelectedIds(newIds);
    setHighlightedSeatIds(newIds);
    setBestAvailableResult('found');
    setBestAvailableRetries(0);
    lastBestAvailableOpts.current = { ...opts, excludedIds: new Set(newIds) };

    setTimeout(() => setHighlightedSeatIds(new Set()), 2000);
  }, [allSeats, sections, holdActive, allowedSectionIds]);

  const retryBest = useCallback(() => {
    if (!lastBestAvailableOpts.current) return;
    if (bestAvailableRetries >= 5) return;
    if (holdActive) return;

    const prev = lastBestAvailableOpts.current;
    const results = findBestAvailable(allSeats, sections, {
      count: prev.count,
      strategy: prev.strategy,
      sectionId: prev.sectionId,
      priceCategory: prev.priceCategory,
      keepTogether: prev.keepTogether,
      excludeSeatIds: prev.excludedIds,
      allowedSectionIds: allowedSectionIds ?? undefined,
    });

    if (results.length === 0) {
      setBestAvailableResult('empty');
      return;
    }

    const newIds = new Set(results.map(s => s.id));
    setSelectedIds(newIds);
    setHighlightedSeatIds(newIds);
    setBestAvailableResult('found');
    setBestAvailableRetries(r => r + 1);

    const merged = new Set(prev.excludedIds);
    for (const id of newIds) merged.add(id);
    lastBestAvailableOpts.current = { ...prev, excludedIds: merged };

    setTimeout(() => setHighlightedSeatIds(new Set()), 2000);
  }, [allSeats, sections, bestAvailableRetries, holdActive, allowedSectionIds]);

  const canvasWidth = layout?.layout_data?.canvasWidth as number || 1600;
  const canvasHeight = layout?.layout_data?.canvasHeight as number || 1000;

  return {
    loading,
    error,
    eventInfo,
    layout,
    sections,
    floorplanObjects,
    allSeats,
    visibleSeats,
    selectedIds,
    holdIds,
    expiresAt,
    holdLoading,
    holdError,
    holdActive,
    holdExpired,
    holdExtended,
    priceCategories,
    activePriceFilters,
    canvasWidth,
    canvasHeight,
    maxSeats: MAX_SEATS,
    notifications,
    flashingSeatIds,
    connectionStatus,
    toggleSeat,
    clearSelection,
    confirmHold,
    releaseHold,
    handleHoldExpired,
    dismissExpiredModal,
    extendHold,
    togglePriceFilter,
    getSelectedSeats,
    getTotalPrice,
    seatMap,
    findBest,
    retryBest,
    bestAvailableResult,
    bestAvailableRetries,
    highlightedSeatIds,
    dismissNotification,
    allowedSectionIds,
  };
}
