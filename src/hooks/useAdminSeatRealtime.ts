import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Seat, SeatSection } from '../types/seats';

export interface SeatStats {
  total: number;
  available: number;
  blocked: number;
  reserved: number;
  sold: number;
}

export interface SalesStats {
  seatsSold: number;
  seatsTotal: number;
  revenue: number;
  orderCount: number;
  activeHolds: number;
}

export interface OrderNotification {
  id: string;
  order_id: string;
  customer_name: string;
  seat_count: number;
  total_amount: number;
  created_at: string;
  read: boolean;
}

const NOTIF_STORAGE_KEY = 'admin_seat_notifications_read';

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify([...ids]));
}

export function useAdminSeatRealtime(
  layoutId: string | null,
  eventId: string | null,
  sectionIds: string[],
  onSeatUpdate?: (seat: Partial<Seat> & { id: string }) => void,
) {
  const [viewerCount, setViewerCount] = useState(0);
  const [salesStats, setSalesStats] = useState<SalesStats>({
    seatsSold: 0,
    seatsTotal: 0,
    revenue: 0,
    orderCount: 0,
    activeHolds: 0,
  });
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestOrder, setLatestOrder] = useState<OrderNotification | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('admin_notif_sound') !== 'off';
    } catch { return true; }
  });

  const channelRef = useRef<any>(null);
  const orderChannelRef = useRef<any>(null);
  const cleanupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('admin_notif_sound', next ? 'on' : 'off');
      return next;
    });
  }, []);

  const playNotifSound = useCallback(() => {
    if (!soundEnabled || document.hidden) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, [soundEnabled]);

  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      const readIds = getReadIds();
      for (const n of prev) readIds.add(n.id);
      saveReadIds(readIds);
      return prev.map(n => ({ ...n, read: true }));
    });
    setUnreadCount(0);
  }, []);

  const fetchSalesStats = useCallback(async () => {
    if (!eventId) return;
    try {
      const [seatsRes, ordersRes, holdsRes] = await Promise.all([
        supabase
          .from('ticket_seats')
          .select('id, price_paid')
          .eq('event_id', eventId)
          .limit(10000),
        supabase
          .from('orders')
          .select('id')
          .eq('event_id', eventId)
          .eq('product_type', 'seat')
          .limit(10000),
        supabase
          .from('seat_holds')
          .select('id')
          .eq('event_id', eventId)
          .eq('status', 'held')
          .limit(10000),
      ]);

      const ticketSeats = seatsRes.data ?? [];
      const revenue = ticketSeats.reduce((sum, ts) => sum + Number(ts.price_paid), 0);

      let totalSeats = 0;
      if (sectionIds.length > 0) {
        const { count } = await supabase
          .from('seats')
          .select('id', { count: 'exact', head: true })
          .in('section_id', sectionIds)
          .eq('is_active', true);
        totalSeats = count ?? 0;
      }

      setSalesStats({
        seatsSold: ticketSeats.length,
        seatsTotal: totalSeats,
        revenue,
        orderCount: ordersRes.data?.length ?? 0,
        activeHolds: holdsRes.data?.length ?? 0,
      });
    } catch {}
  }, [eventId, sectionIds]);

  const fetchRecentOrders = useCallback(async () => {
    if (!eventId) return;
    try {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, payer_name, total_amount, metadata, created_at')
        .eq('event_id', eventId)
        .eq('product_type', 'seat')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!data) return;
      const readIds = getReadIds();

      const notifs: OrderNotification[] = data.map(o => ({
        id: o.id,
        order_id: o.id,
        customer_name: o.payer_name || 'Onbekend',
        seat_count: o.metadata?.seat_count ?? 0,
        total_amount: o.total_amount / 100,
        created_at: o.created_at,
        read: readIds.has(o.id),
      }));

      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    } catch {}
  }, [eventId]);

  const runCleanup = useCallback(async () => {
    try {
      await supabase.rpc('release_expired_holds');
    } catch {}
  }, []);

  useEffect(() => {
    if (!layoutId || sectionIds.length === 0) return;

    const channel = supabase
      .channel(`admin-seats-${layoutId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'seats' },
        (payload) => {
          const newRow = payload.new as Partial<Seat> & { id: string; section_id?: string };
          if (newRow.id && newRow.section_id && sectionIds.includes(newRow.section_id)) {
            onSeatUpdate?.(newRow);
          }
        },
      );

    if (eventId) {
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        setViewerCount(count);
      });
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [layoutId, sectionIds.join(','), eventId, onSeatUpdate]);

  useEffect(() => {
    if (!eventId) return;

    const orderChannel = supabase
      .channel(`admin-orders-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const order = payload.new as any;
          if (order.product_type !== 'seat') return;

          const notif: OrderNotification = {
            id: order.id,
            order_id: order.id,
            customer_name: order.payer_name || 'Onbekend',
            seat_count: order.metadata?.seat_count ?? 0,
            total_amount: order.total_amount / 100,
            created_at: order.created_at,
            read: false,
          };

          setNotifications(prev => [notif, ...prev].slice(0, 10));
          setUnreadCount(prev => prev + 1);
          setLatestOrder(notif);

          playNotifSound();

          fetchSalesStats();

          setTimeout(() => setLatestOrder(null), 8000);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'seats' },
        () => {
          fetchSalesStats();
        },
      )
      .subscribe();

    orderChannelRef.current = orderChannel;

    return () => {
      supabase.removeChannel(orderChannel);
      orderChannelRef.current = null;
    };
  }, [eventId, playNotifSound, fetchSalesStats]);

  useEffect(() => {
    fetchSalesStats();
    fetchRecentOrders();
  }, [fetchSalesStats, fetchRecentOrders]);

  useEffect(() => {
    runCleanup();
    cleanupIntervalRef.current = setInterval(runCleanup, 60_000);
    return () => {
      if (cleanupIntervalRef.current) clearInterval(cleanupIntervalRef.current);
    };
  }, [runCleanup]);

  return {
    viewerCount,
    salesStats,
    notifications,
    unreadCount,
    latestOrder,
    soundEnabled,
    toggleSound,
    markAllRead,
    fetchSalesStats,
    fetchRecentOrders,
  };
}
