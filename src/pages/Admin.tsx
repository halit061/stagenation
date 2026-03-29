import { Shield, ShieldCheck, Calendar, Grid2x2 as Grid, MapPin, Ticket, LogOut, ShoppingCart, Users, AlertCircle, RefreshCw, X, Mail, Plus, CheckCircle, Loader2, ChevronDown, DoorOpen, Euro, TrendingUp, BarChart3, Ban, Armchair, Bell, Volume2, VolumeX } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Database } from '../lib/supabaseClient';
import { FloorPlanEditor } from '../components/FloorPlanEditor';
import { VenueMapEditor } from '../components/VenueMapEditor';
import { ScannerUsersManager } from '../components/ScannerUsersManager';
import { EntrancesTicketTypesManager } from '../components/EntrancesTicketTypesManager';
import { SharedLogin } from '../components/SharedLogin';
import { useAuth } from '../contexts/AuthContext';
import { AdminNotifications, OrderToast } from '../components/AdminNotifications';
import type { OrderNotification } from '../hooks/useAdminSeatRealtime';
import { EDGE_FUNCTION_BASE_URL } from '../config/brand';
import { callEdgeFunction } from '../lib/callEdge';
import { adminFetch } from '../lib/adminApi';
import { useToast } from '../components/Toast';
import { getAllLayouts, saveLayout, getTemplates, copyTemplateForEvent } from '../services/seatService';
import type { VenueLayout } from '../types/seats';

type Event = Database['public']['Tables']['events']['Row'];
type TicketType = Database['public']['Tables']['ticket_types']['Row'];
type FloorplanTable = Database['public']['Tables']['floorplan_tables']['Row'];

interface TicketWithDetails {
  id: string;
  ticket_number: string;
  holder_name: string;
  holder_email: string;
  status: string;
  scan_status?: string;
  created_at: string;
  event_id: string;
  order_id: string;
  ticket_types?: { name: string } | null;
  orders?: { order_number: string; payer_name: string; payer_email: string; status: string } | null;
  events?: { name: string } | null;
}

interface AdminProps {
  onNavigate?: (page: string) => void;
}

const ALLOWED_TABS = ['dashboard', 'events', 'floorplan', 'venue_map', 'tickets', 'guest_tickets', 'table_guests', 'scanners', 'orders', 'entrances', 'refund_protection'] as const;
type AllowedTab = typeof ALLOWED_TABS[number];

export function Admin({ onNavigate }: AdminProps = {}) {
  const { user, role, loading: authLoading, isAdmin, isSuperAdmin, logout } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<AllowedTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleTabChange = useCallback((tab: AllowedTab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  }, []);
  const [events, setEvents] = useState<Event[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [guestTickets, setGuestTickets] = useState<any[]>([]);
  const [tableGuests, setTableGuests] = useState<any[]>([]);
  const [tableGuestTables, setTableGuestTables] = useState<FloorplanTable[]>([]);
  const [showTableGuestForm, setShowTableGuestForm] = useState(false);
  const [tableGuestForm, setTableGuestForm] = useState({
    event_id: '',
    assigned_table_id: '',
    guest_name: '',
    guest_email: '',
    number_of_persons: 1,
    table_note: ''
  });
  const [allTickets, setAllTickets] = useState<TicketWithDetails[]>([]);
  const [dashboardTicketTypes, setDashboardTicketTypes] = useState<any[]>([]);
  const [paidTickets, setPaidTickets] = useState<any[]>([]);
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<string>('all');
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketWithDetails | null>(null);
  const [showResendModal, setShowResendModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [ticketFilter, setTicketFilter] = useState('');
  const [showGuestTicketForm, setShowGuestTicketForm] = useState(false);
  const [guestTicketForm, setGuestTicketForm] = useState({
    event_id: '',
    ticket_type_id: '',
    recipient_email: '',
    recipient_name: '',
    notes: '',
    assigned_table_id: '',
    table_note: '',
    persons_count: 1,
    send_mode: 'single_email' as 'per_person' | 'single_email'
  });
  const [guestTicketTypes, setGuestTicketTypes] = useState<TicketType[]>([]);
  const [guestTicketTables, setGuestTicketTables] = useState<FloorplanTable[]>([]);
  const [loadingGuestTicketTables, setLoadingGuestTicketTables] = useState(false);
  const [selectedGuestTicket, setSelectedGuestTicket] = useState<any>(null);
  const [resendingGuestTicket, setResendingGuestTicket] = useState(false);
  const [tableAssignmentCounts, setTableAssignmentCounts] = useState<Record<string, number>>({});

  // Refund protection admin state
  const [rpSelectedEventId, setRpSelectedEventId] = useState('');
  const [rpEnabled, setRpEnabled] = useState(false);
  const [rpFeeType, setRpFeeType] = useState('percentage');
  const [rpFeeValue, setRpFeeValue] = useState('5.00');
  const [rpSaving, setRpSaving] = useState(false);
  const [rpClaims, setRpClaims] = useState<any[]>([]);
  const [rpMessage, setRpMessage] = useState('');

  // Cancel order state
  const [showCancelOrderModal, setShowCancelOrderModal] = useState(false);
  const [cancelOrderTarget, setCancelOrderTarget] = useState<any>(null);
  const [cancelOrderLoading, setCancelOrderLoading] = useState(false);

  const [venueLayouts, setVenueLayouts] = useState<VenueLayout[]>([]);
  const [layoutTemplates, setLayoutTemplates] = useState<VenueLayout[]>([]);
  const [copyingTemplate, setCopyingTemplate] = useState<string | null>(null);

  const [seatNotifications, setSeatNotifications] = useState<OrderNotification[]>([]);
  const [seatUnreadCount, setSeatUnreadCount] = useState(0);
  const [seatSoundEnabled, setSeatSoundEnabled] = useState(() => {
    try { return localStorage.getItem('admin_notif_sound') !== 'off'; } catch { return true; }
  });
  const [seatLatestOrder, setSeatLatestOrder] = useState<OrderNotification | null>(null);
  const seatOrderChannelRef = useRef<any>(null);

  const toggleSeatSound = useCallback(() => {
    setSeatSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('admin_notif_sound', next ? 'on' : 'off');
      return next;
    });
  }, []);

  const markAllSeatRead = useCallback(() => {
    const STORAGE_KEY = 'admin_seat_notifications_read';
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const ids = new Set(existing);
      for (const n of seatNotifications) ids.add(n.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {}
    setSeatNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setSeatUnreadCount(0);
  }, [seatNotifications]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select('id, order_number, payer_name, total_amount, metadata, created_at')
          .eq('product_type', 'seat')
          .order('created_at', { ascending: false })
          .limit(10);
        if (!data || !mounted) return;
        const STORAGE_KEY = 'admin_seat_notifications_read';
        let readIds = new Set<string>();
        try { readIds = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch {}
        const notifs: OrderNotification[] = data.map(o => ({
          id: o.id,
          order_id: o.id,
          customer_name: o.payer_name || 'Onbekend',
          seat_count: o.metadata?.seat_count ?? 0,
          total_amount: o.total_amount / 100,
          created_at: o.created_at,
          read: readIds.has(o.id),
        }));
        setSeatNotifications(notifs);
        setSeatUnreadCount(notifs.filter(n => !n.read).length);
      } catch {}
    })();

    const channel = supabase
      .channel('admin-seat-orders-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
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
          setSeatNotifications(prev => [notif, ...prev].slice(0, 10));
          setSeatUnreadCount(prev => prev + 1);
          setSeatLatestOrder(notif);
          setTimeout(() => setSeatLatestOrder(null), 8000);
        },
      )
      .subscribe();
    seatOrderChannelRef.current = channel;

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleCancelOrder(order: any) {
    setCancelOrderLoading(true);
    try {
      const result = await callEdgeFunction({
        functionName: 'cancel-order',
        body: { order_id: order.id },
      });

      if (!result.ok) {
        throw new Error(result.error || 'Order annuleren mislukt');
      }

      showToast(`Order ${order.order_number} is geannuleerd (${result.data.tickets_revoked} tickets geannuleerd)`, 'success');
      setShowCancelOrderModal(false);
      setCancelOrderTarget(null);
      loadData();
    } catch (error: any) {
      showToast(`Fout: ${error.message}`, 'error');
    } finally {
      setCancelOrderLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;

    if (!user || !role) return;

    if (isSuperAdmin()) {
      if (onNavigate) {
        onNavigate('superadmin');
      } else {
        window.location.href = '/superadmin';
      }
      return;
    }

    if (role === 'scanner') {
      if (onNavigate) {
        onNavigate('scanner');
      } else {
        window.location.href = '/scanner';
      }
      return;
    }

    if (!isAdmin()) {
      if (onNavigate) {
        onNavigate('home');
      } else {
        window.location.href = '/home';
      }
      return;
    }

    loadData();
  }, [authLoading, user, role, activeTab]);

  async function loadData() {
    try {
      const result = await adminFetch<{ events: Event[]; orders: any[] }>('dashboard');
      if (result.events) setEvents(result.events);
      if (result.orders) setOrders(result.orders);

      // Fetch ticket types for dashboard stats
      const { data: ttData } = await supabase
        .from('ticket_types')
        .select('id, name, price, quantity_total, quantity_sold, is_active, color')
        .order('name');
      if (ttData) setDashboardTicketTypes(ttData);

      // Fetch ALL sold order IDs (paid + comped/guest tickets)
      const { data: allPaidOrders } = await supabase
        .from('orders')
        .select('id')
        .in('status', ['paid', 'comped']);
      const allPaidOrderIds = (allPaidOrders || []).map((o: any) => o.id);
      if (allPaidOrderIds.length > 0) {
        const { data: ticketsData } = await supabase
          .from('tickets')
          .select('id, ticket_type_id')
          .in('order_id', allPaidOrderIds);
        if (ticketsData) setPaidTickets(ticketsData);
      } else {
        setPaidTickets([]);
      }

      await loadGuestTickets();
      await loadVenueLayouts();

      if (activeTab === 'table_guests') {
        await loadTableGuests();
      }
      if (activeTab === 'tickets') {
        await loadAllTickets();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async function loadVenueLayouts() {
    try {
      const [all, tmpls] = await Promise.all([
        getAllLayouts(),
        getTemplates(),
      ]);
      setVenueLayouts(all);
      setLayoutTemplates(tmpls);
    } catch {
      // silently fail
    }
  }

  async function handleAssignLayout(eventId: string, layoutId: string) {
    try {
      const prevLayout = venueLayouts.find((l) => l.event_id === eventId);
      if (prevLayout) {
        await saveLayout({ id: prevLayout.id, name: prevLayout.name, event_id: null });
      }
      if (layoutId) {
        const layout = venueLayouts.find((l) => l.id === layoutId);
        if (layout) {
          await saveLayout({ id: layout.id, name: layout.name, event_id: eventId });
        }
      }
      await loadVenueLayouts();
      showToast('Zaalindeling bijgewerkt', 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij toewijzen layout', 'error');
    }
  }

  async function handleCopyTemplate(eventId: string, templateId: string) {
    const event = events.find(e => e.id === eventId);
    const template = layoutTemplates.find(t => t.id === templateId);
    if (!event || !template) return;

    setCopyingTemplate(eventId);
    try {
      const prevLayout = venueLayouts.find((l) => l.event_id === eventId);
      if (prevLayout) {
        await saveLayout({ id: prevLayout.id, name: prevLayout.name, event_id: null });
      }

      const newLayoutId = await copyTemplateForEvent(
        templateId,
        eventId,
        `${event.name} - ${template.name}`,
      );
      if (newLayoutId) {
        await loadVenueLayouts();
        showToast('Template gekopieerd naar event!', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Fout bij kopiëren template', 'error');
    } finally {
      setCopyingTemplate(null);
    }
  }

  async function loadAllTickets() {
    setTicketsLoading(true);
    try {
      const result = await adminFetch<{ tickets: TicketWithDetails[] }>('tickets');
      setAllTickets(result.tickets || []);
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setTicketsLoading(false);
    }
  }

  async function handleResendEmail() {
    if (!selectedTicket) return;
    setActionLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Niet ingelogd');

      const response = await fetch(
        `${EDGE_FUNCTION_BASE_URL}/resend-ticket-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ticket_id: selectedTicket.id }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      showToast(`Email verstuurd naar ${result.recipient}`, 'success');
      setShowResendModal(false);
      setSelectedTicket(null);
    } catch (error: any) {
      showToast(`Fout: ${error.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  }


  async function loadGuestTickets() {
    try {
      const result = await adminFetch<{ guest_tickets: any[] }>('guest_tickets');
      setGuestTickets(result.guest_tickets || []);
    } catch (error) {
      console.error('Error loading guest tickets:', error);
    }
  }

  async function loadTableGuests() {
    try {
      const result = await adminFetch<{ table_guests: any[] }>('table_guests');
      setTableGuests(result.table_guests || []);
    } catch (error) {
      console.error('Error loading table guests:', error);
    }
  }

  async function loadTableGuestTables(eventId: string) {
    if (!eventId) {
      setTableGuestTables([]);
      return;
    }
    try {
      const result = await adminFetch<{ tables: FloorplanTable[] }>('floorplan_tables', { event_id: eventId });
      setTableGuestTables(result.tables || []);
    } catch (error) {
      console.error('Error loading tables:', error);
    }
  }

  async function loadTicketTypesForEvent(eventId: string) {
    if (!eventId) {
      setGuestTicketTypes([]);
      return;
    }
    try {
      const result = await adminFetch<{ ticket_types: TicketType[] }>('ticket_types', { event_id: eventId });
      setGuestTicketTypes(result.ticket_types || []);
    } catch (error) {
      console.error('Error loading ticket types:', error);
      setGuestTicketTypes([]);
    }
  }

  async function loadGuestTicketTables(eventId: string) {
    if (!eventId) {
      setGuestTicketTables([]);
      setTableAssignmentCounts({});
      return;
    }
    setLoadingGuestTicketTables(true);
    try {
      const [tablesResult, assignResult] = await Promise.all([
        adminFetch<{ tables: FloorplanTable[] }>('floorplan_tables', { event_id: eventId }),
        adminFetch<{ assignments: { assigned_table_id: string }[] }>('table_assignment_counts', { event_id: eventId }),
      ]);

      setGuestTicketTables(tablesResult.tables || []);

      const counts: Record<string, number> = {};
      (assignResult.assignments || []).forEach(a => {
        if (a.assigned_table_id) {
          counts[a.assigned_table_id] = (counts[a.assigned_table_id] || 0) + 1;
        }
      });
      setTableAssignmentCounts(counts);
    } catch (error) {
      console.error('Error loading tables:', error);
    } finally {
      setLoadingGuestTicketTables(false);
    }
  }

  async function sendGuestTicket() {
    if (!guestTicketForm.event_id || !guestTicketForm.ticket_type_id || !guestTicketForm.recipient_email || !guestTicketForm.recipient_name) {
      showToast('Vul alle verplichte velden in', 'error');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-guest-ticket', {
        body: guestTicketForm,
      });

      if (error) {
        const msg = data?.error || error.message;
        throw new Error(msg);
      }
      if (data && !data.success) throw new Error(data.error || 'Onbekende fout');

      const ticketCount = guestTicketForm.persons_count;
      showToast(`${ticketCount} guest ticket${ticketCount > 1 ? 's' : ''} verstuurd naar ${guestTicketForm.recipient_email}!`, 'success');
      setShowGuestTicketForm(false);
      setGuestTicketForm({
        event_id: '',
        ticket_type_id: '',
        recipient_email: '',
        recipient_name: '',
        notes: '',
        assigned_table_id: '',
        table_note: '',
        persons_count: 1,
        send_mode: 'single_email'
      });
      setGuestTicketTypes([]);
      setGuestTicketTables([]);
      setTableAssignmentCounts({});
      await loadGuestTickets();
    } catch (error: any) {
      console.error('Error sending guest ticket:', error);
      showToast(`Fout bij versturen: ${error.message}`, 'error');
    }
  }

  async function resendGuestTicketEmails(orderId: string) {
    setResendingGuestTicket(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Je bent niet ingelogd', 'error');
        return;
      }

      const { data, error } = await supabase.functions.invoke('resend-guest-ticket-emails', {
        body: { order_id: orderId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Onbekende fout');

      showToast(`Emails opnieuw verstuurd!`, 'success');
      await loadGuestTickets();
    } catch (error: any) {
      console.error('Error resending guest ticket emails:', error);
      showToast(`Fout bij opnieuw versturen: ${error.message}`, 'error');
    } finally {
      setResendingGuestTicket(false);
    }
  }


  async function handleLogout() {
    await logout();
    if (onNavigate) {
      onNavigate('login');
    } else {
      window.location.href = '/login';
    }
  }

  async function handleTableGuestSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-table-guest`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_id: tableGuestForm.event_id,
            assigned_table_id: tableGuestForm.assigned_table_id,
            guest_name: tableGuestForm.guest_name,
            guest_email: tableGuestForm.guest_email,
            number_of_persons: tableGuestForm.number_of_persons,
            table_note: tableGuestForm.table_note,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      showToast('Tafel gast uitnodiging verstuurd!', 'success');
      setShowTableGuestForm(false);
      setTableGuestForm({
        event_id: '',
        assigned_table_id: '',
        guest_name: '',
        guest_email: '',
        number_of_persons: 1,
        table_note: ''
      });
      await loadTableGuests();
    } catch (error: any) {
      showToast(`Fout: ${error.message}`, 'error');
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white">Laden...</p>
        </div>
      </div>
    );
  }

  if (!user || !role) {
    return <SharedLogin />;
  }

  if (!isAdmin()) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-full mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Geen Toegang</h1>
          <p className="text-slate-400 mb-6">Je hebt geen toegang tot het Admin panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 md:flex">
      <aside className="hidden md:flex w-64 bg-slate-800 border-r border-slate-700 flex-col">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-white">Admin</h1>
              <p className="text-xs text-slate-400 truncate max-w-[140px]">{user?.email}</p>
            </div>
            <AdminNotifications
              notifications={seatNotifications}
              unreadCount={seatUnreadCount}
              soundEnabled={seatSoundEnabled}
              onToggleSound={toggleSeatSound}
              onMarkAllRead={markAllSeatRead}
              onViewOrders={() => handleTabChange('orders')}
            />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <button
            onClick={() => handleTabChange('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-red-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <Grid className="w-5 h-5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => handleTabChange('events')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'events'
                ? 'bg-red-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span>Events</span>
          </button>

          <button
            onClick={() => handleTabChange('floorplan')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'floorplan'
                ? 'bg-red-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <MapPin className="w-5 h-5" />
            <span>Floorplan</span>
          </button>

          <button
            onClick={() => handleTabChange('venue_map')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'venue_map'
                ? 'bg-red-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <Grid className="w-5 h-5" />
            <span>Venue Map</span>
          </button>

          <button
            onClick={() => handleTabChange('tickets')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'tickets'
                ? 'bg-red-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <Ticket className="w-5 h-5" />
            <span>Alle Tickets</span>
          </button>

          <button
            onClick={() => handleTabChange('guest_tickets')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'guest_tickets'
                ? 'bg-red-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <Ticket className="w-5 h-5" />
            <span>Guest Tickets</span>
          </button>

          <button
            onClick={() => handleTabChange('table_guests')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'table_guests'
                ? 'bg-red-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <MapPin className="w-5 h-5" />
            <span>Tafel Gasten</span>
          </button>

          <button
            onClick={() => handleTabChange('scanners')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'scanners'
                ? 'bg-red-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Scanners</span>
          </button>

          <button
            onClick={() => handleTabChange('orders')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'orders'
                ? 'bg-red-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <ShoppingCart className="w-5 h-5" />
            <span>Orders</span>
          </button>

          <button
            onClick={() => handleTabChange('entrances')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'entrances'
                ? 'bg-red-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <DoorOpen className="w-5 h-5" />
            <span>Ingangen & Typen</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors text-white"
          >
            <LogOut className="w-5 h-5" />
            <span>Uitloggen</span>
          </button>
        </div>
      </aside>

      <div className="w-full md:flex-1 overflow-auto">
        <div className="sticky top-0 z-30 md:hidden bg-slate-800 border-b border-slate-700">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-400" />
              <span className="font-bold text-white">Admin</span>
            </div>
            <div className="flex items-center gap-2">
              <AdminNotifications
                notifications={seatNotifications}
                unreadCount={seatUnreadCount}
                soundEnabled={seatSoundEnabled}
                onToggleSound={toggleSeatSound}
                onMarkAllRead={markAllSeatRead}
                onViewOrders={() => handleTabChange('orders')}
              />
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm font-medium transition-colors"
            >
              <span className="capitalize">{activeTab === 'guest_tickets' ? 'Guest Tickets' : activeTab === 'table_guests' ? 'Tafel Gasten' : activeTab === 'entrances' ? 'Ingangen & Typen' : activeTab === 'refund_protection' ? 'Refund Protection' : activeTab}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
            </button>
            </div>
          </div>
          {sidebarOpen && (
            <div className="bg-slate-800 border-t border-slate-700 px-2 py-2 space-y-1">
              <button onClick={() => handleTabChange('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'dashboard' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <Grid className="w-4 h-4" /><span>Dashboard</span>
              </button>
              <button onClick={() => handleTabChange('events')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'events' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <Calendar className="w-4 h-4" /><span>Events</span>
              </button>
              <button onClick={() => handleTabChange('floorplan')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'floorplan' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <MapPin className="w-4 h-4" /><span>Floorplan</span>
              </button>
              <button onClick={() => handleTabChange('venue_map')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'venue_map' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <Grid className="w-4 h-4" /><span>Venue Map</span>
              </button>
              <button onClick={() => handleTabChange('tickets')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'tickets' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <Ticket className="w-4 h-4" /><span>Alle Tickets</span>
              </button>
              <button onClick={() => handleTabChange('guest_tickets')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'guest_tickets' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <Ticket className="w-4 h-4" /><span>Guest Tickets</span>
              </button>
              <button onClick={() => handleTabChange('table_guests')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'table_guests' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <MapPin className="w-4 h-4" /><span>Tafel Gasten</span>
              </button>
              <button onClick={() => handleTabChange('scanners')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'scanners' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <Users className="w-4 h-4" /><span>Scanners</span>
              </button>
              <button onClick={() => handleTabChange('orders')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'orders' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <ShoppingCart className="w-4 h-4" /><span>Orders</span>
              </button>
              <button onClick={() => handleTabChange('entrances')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'entrances' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <DoorOpen className="w-4 h-4" /><span>Ingangen &amp; Typen</span>
              </button>
              <button onClick={() => handleTabChange('refund_protection')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'refund_protection' ? 'bg-red-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <ShieldCheck className="w-4 h-4" /><span>Refund Protection</span>
              </button>
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 border-t border-slate-700 mt-2 pt-2">
                <LogOut className="w-4 h-4" /><span>Uitloggen</span>
              </button>
            </div>
          )}
        </div>
        <div className="p-4 md:p-8">
          {activeTab === 'dashboard' && (() => {
            const paidOrders = orders.filter(o => o.status === 'paid');
            const totalRevenueCents = paidOrders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
            const totalTicketsSold = paidTickets.length;
            const totalCapacity = dashboardTicketTypes.reduce((sum: number, tt: any) => sum + (tt.quantity_total || 0), 0);
            const totalRemaining = totalCapacity - totalTicketsSold;

            // Count paid tickets per ticket type
            const paidCountByType: Record<string, number> = {};
            paidTickets.forEach((t: any) => {
              paidCountByType[t.ticket_type_id] = (paidCountByType[t.ticket_type_id] || 0) + 1;
            });

            // Status counts for filter badges
            const statusCounts: Record<string, number> = {};
            orders.forEach((o: any) => {
              statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
            });

            // Filtered orders
            const filteredOrders = dashboardStatusFilter === 'all'
              ? orders
              : orders.filter((o: any) => o.status === dashboardStatusFilter);

            const statusFilters = [
              { key: 'all', label: 'Tümü', color: 'text-white bg-slate-600' },
              { key: 'paid', label: 'Paid', color: 'text-green-400 bg-green-500/20' },
              { key: 'pending', label: 'Pending', color: 'text-yellow-400 bg-yellow-500/20' },
              { key: 'failed', label: 'Failed', color: 'text-red-400 bg-red-500/20' },
              { key: 'refunded', label: 'Refunded', color: 'text-blue-400 bg-blue-500/20' },
              { key: 'cancelled', label: 'Cancelled', color: 'text-slate-400 bg-slate-600/20' },
            ];

            return (
            <div>
              <h2 className="text-3xl font-bold mb-2 text-white">
                Admin<span className="text-red-400"> Dashboard</span>
              </h2>
              <p className="text-slate-400 mb-8">Welkom bij het Admin panel</p>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5">
                  <Calendar className="w-6 h-6 text-cyan-400 mb-3" />
                  <div className="text-2xl font-bold text-white">{events.length}</div>
                  <div className="text-xs text-slate-400 mt-1">Events</div>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5">
                  <Ticket className="w-6 h-6 text-green-400 mb-3" />
                  <div className="text-2xl font-bold text-white">{totalTicketsSold}</div>
                  <div className="text-xs text-slate-400 mt-1">Toplam Bilet</div>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5">
                  <Euro className="w-6 h-6 text-emerald-400 mb-3" />
                  <div className="text-2xl font-bold text-white">{'\u20AC'}{(totalRevenueCents / 100).toFixed(2)}</div>
                  <div className="text-xs text-slate-400 mt-1">Toplam Gelir</div>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5">
                  <TrendingUp className="w-6 h-6 text-amber-400 mb-3" />
                  <div className="text-2xl font-bold text-white">{totalRemaining}</div>
                  <div className="text-xs text-slate-400 mt-1">Kalan Bilet</div>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5">
                  <ShoppingCart className="w-6 h-6 text-purple-400 mb-3" />
                  <div className="text-2xl font-bold text-white">{paidOrders.length}</div>
                  <div className="text-xs text-slate-400 mt-1">Betaalde Orders</div>
                </div>
              </div>

              {/* Ticket Type Breakdown */}
              {dashboardTicketTypes.length > 0 && (
                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6 mb-8">
                  <div className="flex items-center gap-2 mb-5">
                    <BarChart3 className="w-5 h-5 text-red-400" />
                    <h3 className="text-lg font-bold text-white">Bilet Tipi Dağılımı</h3>
                  </div>
                  <div className="space-y-4">
                    {dashboardTicketTypes.map((tt: any) => {
                      const sold = paidCountByType[tt.id] || 0;
                      const total = tt.quantity_total || 0;
                      const pct = total > 0 ? (sold / total) * 100 : 0;
                      const revenue = sold * (tt.price || 0);
                      return (
                        <div key={tt.id} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              {tt.color && <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: tt.color }} />}
                              <span className="font-medium text-white">{tt.name}</span>
                              <span className="text-slate-500">{'\u20AC'}{(tt.price / 100).toFixed(0)}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-slate-400">{sold} / {total}</span>
                              <span className="text-emerald-400 font-medium w-24 text-right">{'\u20AC'}{(revenue / 100).toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                backgroundColor: tt.color || '#06b6d4',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total row */}
                  <div className="mt-5 pt-4 border-t border-slate-700 flex items-center justify-between text-sm font-bold">
                    <span className="text-white">Totaal</span>
                    <div className="flex items-center gap-4">
                      <span className="text-white">{totalTicketsSold} / {totalCapacity}</span>
                      <span className="text-emerald-400 w-24 text-right">{'\u20AC'}{(totalRevenueCents / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Orders with Status Filter */}
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-white mr-2">Orders</span>
                  {statusFilters.map(({ key, label, color }) => {
                    const count = key === 'all' ? orders.length : (statusCounts[key] || 0);
                    if (key !== 'all' && count === 0) return null;
                    const isActive = dashboardStatusFilter === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setDashboardStatusFilter(key)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                          isActive ? color + ' ring-1 ring-white/30' : 'text-slate-400 bg-slate-700/50 hover:bg-slate-700'
                        }`}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>
                <table className="w-full">
                  <thead className="bg-slate-900 border-b border-slate-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400">Order</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400">Klant</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 hidden md:table-cell">Event</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400">Bedrag</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                          Geen orders met deze status
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.slice(0, 50).map((order: any) => (
                        <tr key={order.id} className="hover:bg-slate-700/30">
                          <td className="px-6 py-3 font-mono text-cyan-400 text-xs">{order.order_number}</td>
                          <td className="px-6 py-3">
                            <div className="text-white text-sm">{order.payer_name}</div>
                            <div className="text-xs text-slate-400">{order.payer_email}</div>
                          </td>
                          <td className="px-6 py-3 text-white text-sm hidden md:table-cell">{order.events?.name}</td>
                          <td className="px-6 py-3 text-white text-sm font-semibold">
                            {'\u20AC'}{(order.total_amount / 100).toFixed(2)}
                          </td>
                          <td className="px-6 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              order.status === 'paid'
                                ? 'bg-green-500/20 text-green-400'
                                : order.status === 'pending'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : order.status === 'failed'
                                ? 'bg-red-500/20 text-red-400'
                                : order.status === 'refunded'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-slate-600/20 text-slate-400'
                            }`}>
                              {order.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}

          {activeTab === 'events' && (
            <div>
              <h2 className="text-3xl font-bold mb-2 text-white">
                Event<span className="text-red-400">overzicht</span>
              </h2>
              <p className="text-slate-400 mb-8">Bekijk alle events</p>

              <div className="grid gap-4">
                {events.map((event) => {
                  const assignedLayout = venueLayouts.find((l) => l.event_id === event.id);
                  const availableLayouts = venueLayouts.filter((l) => !l.event_id || l.event_id === event.id);
                  return (
                    <div key={event.id} className="bg-slate-800/80 border border-slate-700 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-xl font-bold text-white">{event.name}</h3>
                          <p className="text-slate-400 text-sm mt-1">
                            {new Date(event.start_date).toLocaleDateString('nl-BE', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              timeZone: 'Europe/Brussels',
                            })}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          event.is_active
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-slate-600/20 text-slate-400'
                        }`}>
                          {event.is_active ? 'Actief' : 'Inactief'}
                        </span>
                      </div>
                      <div className="pt-3 border-t border-slate-700 space-y-3">
                        <div className="flex items-center gap-3">
                          <Armchair className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <label className="text-sm text-slate-400 flex-shrink-0">Zaalindeling:</label>
                          {assignedLayout ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white font-medium">{assignedLayout.name}</span>
                              {assignedLayout.source_template_id && (
                                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">van template</span>
                              )}
                              <button
                                onClick={() => handleAssignLayout(event.id, '')}
                                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                              >
                                Ontkoppelen
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500 italic">Geen layout</span>
                          )}
                        </div>
                        {!assignedLayout && (
                          <div className="ml-7 flex flex-col sm:flex-row gap-3">
                            <div className="flex items-center gap-2 flex-1">
                              <select
                                value=""
                                onChange={(e) => handleAssignLayout(event.id, e.target.value)}
                                className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none max-w-xs"
                              >
                                <option value="">Bestaande layout toewijzen...</option>
                                {availableLayouts.filter(l => !l.is_template).map((l) => (
                                  <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                              </select>
                            </div>
                            {layoutTemplates.length > 0 && (
                              <div className="flex items-center gap-2 flex-1">
                                <select
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value) handleCopyTemplate(event.id, e.target.value);
                                  }}
                                  disabled={copyingTemplate === event.id}
                                  className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none max-w-xs disabled:opacity-50"
                                >
                                  <option value="">
                                    {copyingTemplate === event.id ? 'Kopiëren...' : 'Kopieer van template...'}
                                  </option>
                                  {layoutTemplates.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                                {copyingTemplate === event.id && (
                                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'floorplan' && (
            <div>
              <h2 className="text-3xl font-bold mb-2 text-white">
                Floorplan<span className="text-red-400"> Builder</span>
              </h2>
              <p className="text-slate-400 mb-8">Beheer tafels en hun posities</p>

              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6">
                <FloorPlanEditor />
              </div>
            </div>
          )}

          {activeTab === 'venue_map' && (
            <VenueMapEditor events={events.map(e => ({ id: e.id, name: e.name }))} />
          )}

          {activeTab === 'tickets' && (
            <div>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-white">
                    Alle<span className="text-red-400"> Tickets</span>
                  </h2>
                  <p className="text-slate-400">Beheer alle verkochte tickets</p>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="text"
                    placeholder="Zoek op naam, email of ticket..."
                    value={ticketFilter}
                    onChange={(e) => setTicketFilter(e.target.value)}
                    className="px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white w-64"
                  />
                  <button
                    onClick={loadAllTickets}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors text-white flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Vernieuwen
                  </button>
                </div>
              </div>

              <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-900 border-b border-slate-700">
                      <tr>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-white">Ticket</th>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-white">Houder</th>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-white">Event</th>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-white">Type</th>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-white">Status</th>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-white">Datum</th>
                        <th className="px-4 py-4 text-center text-sm font-semibold text-white">Acties</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {ticketsLoading ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center">
                            <div className="w-8 h-8 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-slate-400">Tickets laden...</p>
                          </td>
                        </tr>
                      ) : allTickets.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center">
                            <Ticket className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                            <p className="text-slate-400">Geen tickets gevonden</p>
                          </td>
                        </tr>
                      ) : (
                        allTickets
                          .filter(ticket => {
                            if (!ticketFilter) return true;
                            const search = ticketFilter.toLowerCase();
                            return (
                              ticket.ticket_number?.toLowerCase().includes(search) ||
                              ticket.holder_name?.toLowerCase().includes(search) ||
                              ticket.holder_email?.toLowerCase().includes(search) ||
                              ticket.events?.name?.toLowerCase().includes(search) ||
                              ticket.orders?.payer_email?.toLowerCase().includes(search)
                            );
                          })
                          .slice(0, 100)
                          .map((ticket) => (
                            <tr key={ticket.id} className="hover:bg-slate-700/30">
                              <td className="px-4 py-3">
                                <span className="font-mono text-cyan-400 text-sm">{ticket.ticket_number}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-white font-medium text-sm">{ticket.holder_name || '-'}</div>
                                <div className="text-xs text-slate-400">{ticket.holder_email || ticket.orders?.payer_email}</div>
                              </td>
                              <td className="px-4 py-3 text-white text-sm">{ticket.events?.name || '-'}</td>
                              <td className="px-4 py-3 text-slate-300 text-sm">{ticket.ticket_types?.name || '-'}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  ticket.status === 'valid'
                                    ? 'bg-green-500/20 text-green-400'
                                    : ticket.status === 'used'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : ticket.status === 'cancelled'
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-slate-600/20 text-slate-400'
                                }`}>
                                  {ticket.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-400 text-sm">
                                {new Date(ticket.created_at).toLocaleDateString('nl-BE')}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => {
                                      setSelectedTicket(ticket);
                                      setShowResendModal(true);
                                    }}
                                    className="p-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-cyan-400 transition-colors"
                                    title="Resend Email"
                                  >
                                    <Mail className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'guest_tickets' && (
            <div>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-white">
                    Guest<span className="text-red-400"> Tickets</span>
                  </h2>
                  <p className="text-slate-400">Verstuur gratis tickets naar gasten</p>
                </div>
                <button
                  onClick={() => setShowGuestTicketForm(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors text-white"
                >
                  <Plus className="w-5 h-5" />
                  Nieuw Guest Ticket
                </button>
              </div>

              {showGuestTicketForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-slate-800 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-600">
                    <h3 className="text-2xl font-bold mb-6 text-white">Verstuur Guest Ticket</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-white">Event *</label>
                        <select
                          value={guestTicketForm.event_id}
                          onChange={(e) => {
                            setGuestTicketForm({ ...guestTicketForm, event_id: e.target.value, ticket_type_id: '', assigned_table_id: '' });
                            loadTicketTypesForEvent(e.target.value);
                            loadGuestTicketTables(e.target.value);
                          }}
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          required
                        >
                          <option value="">Selecteer event</option>
                          {events.map((event) => (
                            <option key={event.id} value={event.id}>{event.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-white">Ticket Type *</label>
                        <select
                          value={guestTicketForm.ticket_type_id}
                          onChange={(e) => setGuestTicketForm({ ...guestTicketForm, ticket_type_id: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          required
                          disabled={!guestTicketForm.event_id}
                        >
                          <option value="">Selecteer ticket type</option>
                          {guestTicketTypes.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.name} - {'\u20AC'}{(type.price / 100).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-white">Aantal tickets *</label>
                        <input
                          type="number"
                          min={1}
                          value={guestTicketForm.persons_count}
                          onChange={(e) => setGuestTicketForm({ ...guestTicketForm, persons_count: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                        <p className="mt-1 text-sm text-slate-400">Alle QR codes worden in 1 email verstuurd</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-white">Naam *</label>
                        <input
                          type="text"
                          value={guestTicketForm.recipient_name}
                          onChange={(e) => setGuestTicketForm({ ...guestTicketForm, recipient_name: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-white">Email *</label>
                        <input
                          type="email"
                          value={guestTicketForm.recipient_email}
                          onChange={(e) => setGuestTicketForm({ ...guestTicketForm, recipient_email: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-white">Notities (optioneel)</label>
                        <textarea
                          value={guestTicketForm.notes}
                          onChange={(e) => setGuestTicketForm({ ...guestTicketForm, notes: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          rows={3}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-white">
                          Tafel toewijzen (optioneel)
                          {loadingGuestTicketTables && <span className="ml-2 text-slate-400 text-xs">Laden...</span>}
                        </label>
                        <select
                          value={guestTicketForm.assigned_table_id}
                          onChange={(e) => setGuestTicketForm({ ...guestTicketForm, assigned_table_id: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          disabled={!guestTicketForm.event_id || loadingGuestTicketTables}
                        >
                          <option value="">Geen tafel toewijzen</option>
                          {guestTicketTables.map((table) => {
                            const assignCount = tableAssignmentCounts[table.id] || 0;
                            return (
                              <option key={table.id} value={table.id}>
                                Tafel {table.table_number} (max {table.capacity}){assignCount > 0 ? ` - ${assignCount} toegewezen` : ''}
                              </option>
                            );
                          })}
                        </select>
                        {guestTicketForm.assigned_table_id && tableAssignmentCounts[guestTicketForm.assigned_table_id] > 0 && (
                          <p className="mt-2 text-amber-400 text-sm flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            Deze tafel is al toegewezen aan {tableAssignmentCounts[guestTicketForm.assigned_table_id]} andere guest ticket(s)
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-white">Tafel notitie (optioneel)</label>
                        <input
                          type="text"
                          value={guestTicketForm.table_note}
                          onChange={(e) => setGuestTicketForm({ ...guestTicketForm, table_note: e.target.value })}
                          placeholder="Bijv: Tafel zonder drank, VIP, enkel frisdrank"
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-slate-400"
                        />
                      </div>

                      <div className="flex gap-3 pt-4">
                        <button
                          type="button"
                          onClick={sendGuestTicket}
                          className="flex-1 bg-red-500 hover:bg-red-400 text-white py-3 rounded-xl font-semibold transition-colors"
                        >
                          Versturen
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowGuestTicketForm(false);
                            setGuestTicketForm({ event_id: '', ticket_type_id: '', recipient_email: '', recipient_name: '', notes: '', assigned_table_id: '', table_note: '', persons_count: 1, send_mode: 'single_email' });
                            setGuestTicketTypes([]);
                            setGuestTicketTables([]);
                            setTableAssignmentCounts({});
                          }}
                          className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-3 rounded-xl font-semibold transition-colors"
                        >
                          Annuleren
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-900 border-b border-slate-700">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Gast</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Event</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Ticket</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Personen</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Verstuurd door</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Datum</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Acties</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {guestTickets.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center">
                          <Ticket className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                          <p className="text-slate-400">Geen guest tickets gevonden</p>
                        </td>
                      </tr>
                    ) : (
                      guestTickets.map((ticket) => {
                        const qrs = ticket.guest_ticket_qrs || [];
                        const totalPersons = ticket.persons_count || 1;
                        const usedCount = qrs.filter((qr: any) => qr.used_at).length;
                        const hasMultiQrs = qrs.length > 0;
                        return (
                          <tr key={ticket.id} className="hover:bg-slate-700/30">
                            <td className="px-6 py-4">
                              <div className="text-white font-medium">{ticket.payer_name}</div>
                              <div className="text-sm text-slate-400">{ticket.payer_email}</div>
                            </td>
                            <td className="px-6 py-4 text-white">{ticket.events?.name}</td>
                            <td className="px-6 py-4 text-white font-mono text-sm">
                              {ticket.tickets?.[0]?.ticket_number || '-'}
                            </td>
                            <td className="px-6 py-4">
                              {hasMultiQrs ? (
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    usedCount === qrs.length
                                      ? 'bg-green-500/20 text-green-400'
                                      : usedCount > 0
                                      ? 'bg-amber-500/20 text-amber-400'
                                      : 'bg-slate-600/20 text-slate-400'
                                  }`}>
                                    {usedCount}/{qrs.length} gescand
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">{totalPersons} pers.</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-cyan-400 text-sm">
                                {ticket.metadata?.sent_by || '-'}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-400 text-sm">
                              {new Date(ticket.created_at).toLocaleDateString('nl-BE')}
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => setSelectedGuestTicket(ticket)}
                                className="text-cyan-400 hover:text-cyan-300 text-sm"
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {selectedGuestTicket && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-slate-800 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-600">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-2xl font-bold text-white">Guest Ticket Details</h3>
                      <button
                        onClick={() => setSelectedGuestTicket(null)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-slate-400">Naam</label>
                          <p className="text-white font-medium">{selectedGuestTicket.payer_name}</p>
                        </div>
                        <div>
                          <label className="text-sm text-slate-400">Email</label>
                          <p className="text-white font-medium">{selectedGuestTicket.payer_email}</p>
                        </div>
                        <div>
                          <label className="text-sm text-slate-400">Event</label>
                          <p className="text-white font-medium">{selectedGuestTicket.events?.name}</p>
                        </div>
                        <div>
                          <label className="text-sm text-slate-400">Verstuurd door</label>
                          <p className="text-cyan-400 font-medium">{selectedGuestTicket.metadata?.sent_by || '-'}</p>
                        </div>
                        <div>
                          <label className="text-sm text-slate-400">Aangemaakt</label>
                          <p className="text-white font-medium">
                            {new Date(selectedGuestTicket.created_at).toLocaleString('nl-BE')}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm text-slate-400">Verzendmodus</label>
                          <p className="text-white font-medium">
                            {selectedGuestTicket.send_mode === 'single_email' ? 'Enkele email' : 'Per persoon'}
                          </p>
                        </div>
                      </div>

                      {selectedGuestTicket.guest_ticket_qrs?.length > 0 && (
                        <div>
                          <h4 className="text-lg font-semibold text-white mb-4">QR Tickets ({selectedGuestTicket.guest_ticket_qrs.length} personen)</h4>
                          <div className="space-y-2">
                            {selectedGuestTicket.guest_ticket_qrs.map((qr: any, _index: number) => (
                              <div
                                key={qr.id}
                                className={`flex items-center justify-between p-3 rounded-lg ${
                                  qr.used_at
                                    ? 'bg-green-500/10 border border-green-500/30'
                                    : 'bg-slate-700/50 border border-slate-600'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-slate-400 font-medium">#{qr.person_index}</span>
                                  <span className="text-white">{qr.name || `Persoon ${qr.person_index}`}</span>
                                </div>
                                <div>
                                  {qr.used_at ? (
                                    <span className="flex items-center gap-2 text-green-400 text-sm">
                                      <CheckCircle className="w-4 h-4" />
                                      Gescand {new Date(qr.used_at).toLocaleString('nl-BE')}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-sm">Niet gescand</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-3 pt-4 border-t border-slate-600">
                        <button
                          onClick={() => resendGuestTicketEmails(selectedGuestTicket.id)}
                          disabled={resendingGuestTicket}
                          className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                          {resendingGuestTicket ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Versturen...
                            </>
                          ) : (
                            <>
                              <Mail className="w-4 h-4" />
                              Emails Opnieuw Versturen
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setSelectedGuestTicket(null)}
                          className="px-6 bg-slate-600 hover:bg-slate-500 text-white py-3 rounded-xl font-semibold transition-colors"
                        >
                          Sluiten
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'table_guests' && (
            <div>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-white">
                    Tafel<span className="text-red-400"> Gasten</span>
                  </h2>
                  <p className="text-slate-400">Wijs tafels toe aan gasten zonder ticket</p>
                </div>
                <button
                  onClick={() => setShowTableGuestForm(true)}
                  className="px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors text-white"
                >
                  + Nieuwe Tafel Gast
                </button>
              </div>

              {showTableGuestForm && (
                <div className="mb-8 bg-slate-800/80 border border-slate-700 rounded-xl p-6">
                  <h3 className="text-xl font-bold text-white mb-4">Nieuwe Tafel Gast</h3>
                  <form onSubmit={handleTableGuestSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Event *</label>
                        <select
                          required
                          value={tableGuestForm.event_id}
                          onChange={(e) => {
                            setTableGuestForm({ ...tableGuestForm, event_id: e.target.value, assigned_table_id: '' });
                            loadTableGuestTables(e.target.value);
                          }}
                          className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                        >
                          <option value="">Selecteer event</option>
                          {events.map((event) => (
                            <option key={event.id} value={event.id}>{event.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Tafel *</label>
                        <select
                          required
                          value={tableGuestForm.assigned_table_id}
                          onChange={(e) => setTableGuestForm({ ...tableGuestForm, assigned_table_id: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                          disabled={!tableGuestForm.event_id}
                        >
                          <option value="">Selecteer tafel</option>
                          {tableGuestTables.map((table) => (
                            <option key={table.id} value={table.id}>
                              Tafel {table.table_number} (max {table.capacity})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Naam *</label>
                        <input
                          type="text"
                          required
                          value={tableGuestForm.guest_name}
                          onChange={(e) => setTableGuestForm({ ...tableGuestForm, guest_name: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Email *</label>
                        <input
                          type="email"
                          required
                          value={tableGuestForm.guest_email}
                          onChange={(e) => setTableGuestForm({ ...tableGuestForm, guest_email: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setShowTableGuestForm(false)}
                        className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-white"
                      >
                        Annuleren
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold text-white"
                      >
                        Versturen
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-900 border-b border-slate-700">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Gast</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Event</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Tafel</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Verstuurd door</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Status</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Acties</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {tableGuests.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <MapPin className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                          <p className="text-slate-400">Geen tafel gasten gevonden</p>
                        </td>
                      </tr>
                    ) : (
                      tableGuests.map((guest) => (
                        <tr key={guest.id} className="hover:bg-slate-700/30">
                          <td className="px-6 py-4">
                            <div className="text-white font-medium">{guest.guest_name}</div>
                            <div className="text-sm text-slate-400">{guest.guest_email}</div>
                          </td>
                          <td className="px-6 py-4 text-white">{guest.events?.name}</td>
                          <td className="px-6 py-4 text-white">
                            Tafel {guest.floorplan_tables?.table_number}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-cyan-400 text-sm">
                              {guest.created_by_email || '-'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              guest.status === 'valid'
                                ? 'bg-green-500/20 text-green-400'
                                : guest.status === 'used'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-slate-600/20 text-slate-400'
                            }`}>
                              {guest.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'scanners' && (
            <div>
              <ScannerUsersManager currentUserRole={role} />
            </div>
          )}

          {activeTab === 'orders' && (
            <div>
              <h2 className="text-3xl font-bold mb-2 text-white">
                Order<span className="text-red-400">overzicht</span>
              </h2>
              <p className="text-slate-400 mb-8">Bekijk alle bestellingen</p>

              <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-900 border-b border-slate-700">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Order</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Klant</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Event</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Bedrag</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Status</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">Acties</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                          <p className="text-slate-400">Geen orders gevonden</p>
                        </td>
                      </tr>
                    ) : (
                      orders.slice(0, 50).map((order) => (
                        <tr key={order.id} className="hover:bg-slate-700/30">
                          <td className="px-6 py-4 font-mono text-cyan-400 text-sm">{order.order_number}</td>
                          <td className="px-6 py-4">
                            <div className="text-white">{order.payer_name}</div>
                            <div className="text-sm text-slate-400">{order.payer_email}</div>
                          </td>
                          <td className="px-6 py-4 text-white">{order.events?.name}</td>
                          <td className="px-6 py-4 text-white font-semibold">
                            {'\u20AC'}{(order.total_amount / 100).toFixed(2)}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              order.status === 'paid'
                                ? 'bg-green-500/20 text-green-400'
                                : order.status === 'pending'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : order.status === 'cancelled'
                                ? 'bg-red-500/20 text-red-400'
                                : order.status === 'refunded'
                                ? 'bg-orange-500/20 text-orange-400'
                                : order.status === 'comped'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-slate-600/20 text-slate-400'
                            }`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {(order.status === 'paid' || order.status === 'pending') && (
                              <button
                                onClick={() => {
                                  setCancelOrderTarget(order);
                                  setShowCancelOrderModal(true);
                                }}
                                className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors"
                                title="Order annuleren"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Cancel Order Modal */}
              {showCancelOrderModal && cancelOrderTarget && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => { setShowCancelOrderModal(false); setCancelOrderTarget(null); }}>
                  <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-white">Order Annuleren</h3>
                      <button
                        onClick={() => { setShowCancelOrderModal(false); setCancelOrderTarget(null); }}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="space-y-3 mb-6">
                      <p className="text-slate-300">
                        Weet je zeker dat je deze order wilt annuleren?
                      </p>
                      <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div className="text-yellow-400 text-sm">
                          <p className="font-medium">Let op:</p>
                          <ul className="list-disc list-inside mt-1 space-y-1">
                            <li>Alle tickets worden geannuleerd (revoked)</li>
                            <li>De ticket voorraad wordt hersteld</li>
                            <li>De betaling moet apart worden teruggestort via Mollie</li>
                          </ul>
                        </div>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-4 space-y-2">
                        <p className="text-sm text-slate-400">
                          <span className="text-slate-500">Order:</span>{' '}
                          <span className="text-cyan-400 font-mono">{cancelOrderTarget.order_number}</span>
                        </p>
                        <p className="text-sm text-slate-400">
                          <span className="text-slate-500">Klant:</span>{' '}
                          <span className="text-white">{cancelOrderTarget.payer_name}</span>
                        </p>
                        <p className="text-sm text-slate-400">
                          <span className="text-slate-500">Email:</span>{' '}
                          <span className="text-white">{cancelOrderTarget.payer_email}</span>
                        </p>
                        <p className="text-sm text-slate-400">
                          <span className="text-slate-500">Bedrag:</span>{' '}
                          <span className="text-white font-semibold">{'\u20AC'}{(cancelOrderTarget.total_amount / 100).toFixed(2)}</span>
                        </p>
                        <p className="text-sm text-slate-400">
                          <span className="text-slate-500">Status:</span>{' '}
                          <span className="text-white">{cancelOrderTarget.status}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setShowCancelOrderModal(false); setCancelOrderTarget(null); }}
                        disabled={cancelOrderLoading}
                        className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
                      >
                        Terug
                      </button>
                      <button
                        onClick={() => handleCancelOrder(cancelOrderTarget)}
                        disabled={cancelOrderLoading}
                        className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {cancelOrderLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Annuleren...
                          </>
                        ) : (
                          <>
                            <Ban className="w-4 h-4" />
                            Annuleer Order
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'entrances' && (
            <EntrancesTicketTypesManager events={events.map(e => ({ id: e.id, name: e.name }))} />
          )}

          {activeTab === 'refund_protection' && (
            <div>
              <h2 className="text-3xl font-bold mb-2 text-white">
                Refund<span className="text-red-400"> Protection</span>
              </h2>
              <p className="text-slate-400 mb-8">Configureer en beheer terugbetalingsbescherming</p>

              <select
                value={rpSelectedEventId}
                onChange={async (e) => {
                  const evId = e.target.value;
                  setRpSelectedEventId(evId);
                  setRpMessage('');
                  if (evId) {
                    const { data: config } = await supabase
                      .from('refund_protection_config')
                      .select('*')
                      .eq('event_id', evId)
                      .maybeSingle();
                    if (config) {
                      setRpEnabled(config.is_enabled);
                      setRpFeeType(config.fee_type);
                      setRpFeeValue(String(config.fee_value));
                    } else {
                      setRpEnabled(false);
                      setRpFeeType('percentage');
                      setRpFeeValue('5.00');
                    }
                    const { data: claims } = await supabase
                      .from('refund_claims')
                      .select('*, orders(order_number, payer_email, payer_name, total_amount)')
                      .eq('event_id', evId)
                      .order('created_at', { ascending: false });
                    setRpClaims(claims || []);
                  }
                }}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white mb-6"
              >
                <option value="">Selecteer een event...</option>
                {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>

              {rpSelectedEventId && (
                <>
                  <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6 mb-6">
                    <h3 className="text-lg font-bold text-white mb-4">Configuratie</h3>
                    {rpMessage && (
                      <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg p-3 text-sm mb-4">
                        {rpMessage}
                      </div>
                    )}
                    <div className="space-y-4">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={rpEnabled}
                          onChange={(e) => setRpEnabled(e.target.checked)}
                          className="w-5 h-5 rounded"
                        />
                        <span className="text-white font-medium">Refund Protection Inschakelen</span>
                      </label>

                      {rpEnabled && (
                        <>
                          <div>
                            <label className="block text-sm text-slate-400 mb-1">Tarieftype</label>
                            <select
                              value={rpFeeType}
                              onChange={(e) => setRpFeeType(e.target.value)}
                              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                            >
                              <option value="percentage">Percentage (%)</option>
                              <option value="fixed">Vast bedrag (EUR)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm text-slate-400 mb-1">
                              {rpFeeType === 'percentage' ? 'Percentage (%)' : 'Bedrag (EUR)'}
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={rpFeeValue}
                              onChange={(e) => setRpFeeValue(e.target.value)}
                              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                            />
                          </div>
                        </>
                      )}

                      <button
                        onClick={async () => {
                          setRpSaving(true);
                          setRpMessage('');
                          try {
                            const result = await callEdgeFunction({
                              functionName: 'admin-manage',
                              body: {
                                action: 'save_refund_config',
                                event_id: rpSelectedEventId,
                                is_enabled: rpEnabled,
                                fee_type: rpFeeType,
                                fee_value: rpFeeValue,
                              },
                            });
                            if (!result.ok) throw new Error(result.error || 'Opslaan mislukt');
                            setRpMessage('Configuratie opgeslagen!');
                          } catch (err: any) {
                            setRpMessage('Fout: ' + (err.message || 'Opslaan mislukt'));
                          } finally {
                            setRpSaving(false);
                          }
                        }}
                        disabled={rpSaving}
                        className="px-6 py-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 rounded-lg font-semibold text-white transition-colors"
                      >
                        {rpSaving ? 'Opslaan...' : 'Opslaan'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden">
                    <h3 className="text-lg font-bold text-white p-6 pb-4">Terugbetalingsverzoeken</h3>
                    {rpClaims.length === 0 ? (
                      <p className="text-slate-400 px-6 pb-6">Geen verzoeken gevonden.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-900 border-b border-slate-700">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Order</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Klant</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Reden</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Acties</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700">
                            {rpClaims.map((claim: any) => (
                              <tr key={claim.id} className="hover:bg-slate-700/30">
                                <td className="px-4 py-3 text-sm text-white">{claim.orders?.order_number || '-'}</td>
                                <td className="px-4 py-3 text-sm text-slate-300">{claim.claimant_name}<br/><span className="text-xs text-slate-500">{claim.claimant_email}</span></td>
                                <td className="px-4 py-3 text-sm text-slate-300 max-w-[200px] truncate">{claim.reason}</td>
                                <td className="px-4 py-3">
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    claim.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                                    claim.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                                    'bg-amber-500/20 text-amber-400'
                                  }`}>{claim.status}</span>
                                </td>
                                <td className="px-4 py-3">
                                  {claim.status === 'pending' && (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={async () => {
                                          const result = await callEdgeFunction({
                                            functionName: 'admin-manage',
                                            body: { action: 'resolve_refund_claim', claim_id: claim.id, resolution: 'approved' },
                                          });
                                          if (result.ok) {
                                            setRpClaims(prev => prev.map(c => c.id === claim.id ? { ...c, status: 'approved' } : c));
                                          }
                                        }}
                                        className="text-xs px-3 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                                      >
                                        Goedkeuren
                                      </button>
                                      <button
                                        onClick={async () => {
                                          const result = await callEdgeFunction({
                                            functionName: 'admin-manage',
                                            body: { action: 'resolve_refund_claim', claim_id: claim.id, resolution: 'rejected' },
                                          });
                                          if (result.ok) {
                                            setRpClaims(prev => prev.map(c => c.id === claim.id ? { ...c, status: 'rejected' } : c));
                                          }
                                        }}
                                        className="text-xs px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                                      >
                                        Afwijzen
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {seatLatestOrder && (
        <OrderToast order={seatLatestOrder} onDismiss={() => setSeatLatestOrder(null)} />
      )}

      {showResendModal && selectedTicket && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Email Opnieuw Versturen</h3>
              <button
                onClick={() => {
                  setShowResendModal(false);
                  setSelectedTicket(null);
                }}
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 mb-6">
              <p className="text-slate-300">
                Weet je zeker dat je de ticket email opnieuw wilt versturen?
              </p>
              <div className="bg-slate-900 rounded-lg p-4 space-y-2">
                <p className="text-sm text-slate-400">
                  <span className="text-slate-500">Ticket:</span>{' '}
                  <span className="text-cyan-400 font-mono">{selectedTicket.ticket_number}</span>
                </p>
                <p className="text-sm text-slate-400">
                  <span className="text-slate-500">Houder:</span>{' '}
                  <span className="text-white">{selectedTicket.holder_name || '-'}</span>
                </p>
                <p className="text-sm text-slate-400">
                  <span className="text-slate-500">Email:</span>{' '}
                  <span className="text-white">{selectedTicket.holder_email || selectedTicket.orders?.payer_email}</span>
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowResendModal(false);
                  setSelectedTicket(null);
                }}
                disabled={actionLoading}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
              >
                Annuleren
              </button>
              <button
                onClick={handleResendEmail}
                disabled={actionLoading}
                className="flex-1 px-4 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Versturen...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Versturen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
