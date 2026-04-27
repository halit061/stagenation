import { Shield, Calendar, Users, Plus, CreditCard as Edit2, Trash2, AlertCircle, CheckCircle, XCircle, Ticket, LogOut, Download, Zap, Image as ImageIcon, Mail, ShoppingCart, Grid2x2 as Grid, MapPin, Package, DollarSign, Bug, BarChart3, Sun, Moon, Menu, X, Crop, ZoomIn, ChevronLeft, ChevronRight, Key, Eye, EyeOff, RefreshCw, FileText, Search, Filter, Loader2, Tag } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { supabase } from '../lib/supabaseClient';
import type { Database } from '../lib/supabaseClient';
import { uploadEventImage } from '../lib/imageUpload';
import { utcToLocalInput, localInputToUtc } from '../lib/timezone';
import { FloorPlanEditor } from '../components/FloorPlanEditor';
import { TablePackagesManager } from '../components/TablePackagesManager';
import { ScannerUsersManager } from '../components/ScannerUsersManager';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { SharedLogin } from '../components/SharedLogin';
import { TicketActions } from '../components/TicketActions';
import { EventAnalytics } from '../components/EventAnalytics';
import { PromoCodesManager } from '../components/PromoCodesManager';
import { GuestTicketSeatSelector } from '../components/GuestTicketSeatSelector';
import type { SeatAssignment } from '../components/GuestTicketSeatSelector';

type Event = Database['public']['Tables']['events']['Row'];
type TicketType = Database['public']['Tables']['ticket_types']['Row'];
type FloorplanTable = Database['public']['Tables']['floorplan_tables']['Row'];

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  brand: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
  display_name: string | null;
  email?: string | null;
}

interface SuperAdminProps {
  onNavigate?: (page: string) => void;
}

export function SuperAdmin({ onNavigate }: SuperAdminProps = {}) {
  const { user, role, loading: authLoading, isSuperAdmin, logout, canManageRoles, getRedirectPath } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'events' | 'tickets' | 'orders' | 'ticketverkopen' | 'table_bookings' | 'floorplan' | 'roles' | 'gebruikers' | 'packages' | 'guest_tickets' | 'table_guests' | 'guest_audit' | 'analytics' | 'media' | 'debug' | 'promo_codes'>('dashboard');
  const canUploadImages = isSuperAdmin || role === 'admin';
  const [events, setEvents] = useState<Event[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [tableBookings, setTableBookings] = useState<any[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<any[]>([]);
  const [bookingFilters, setBookingFilters] = useState({
    event: '',
    status: '',
    search: ''
  });
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [selectedBookingForCancellation, setSelectedBookingForCancellation] = useState<any>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showEventForm, setShowEventForm] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [showBulkTicketForm, setShowBulkTicketForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [editingTicket, setEditingTicket] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [guestTickets, setGuestTickets] = useState<any[]>([]);
  const [guestAuditLog, setGuestAuditLog] = useState<any[]>([]);
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
  const [availableTables, setAvailableTables] = useState<FloorplanTable[]>([]);
  const [tableAssignmentCounts, setTableAssignmentCounts] = useState<Record<string, number>>({});
  const [loadingTables, setLoadingTables] = useState(false);
  const [guestSeatAssignments, setGuestSeatAssignments] = useState<SeatAssignment[]>([]);
  const [tableGuests, setTableGuests] = useState<any[]>([]);
  const [showTableGuestForm, setShowTableGuestForm] = useState(false);
  const [tableGuestForm, setTableGuestForm] = useState({
    event_id: '',
    assigned_table_id: '',
    guest_name: '',
    guest_email: '',
    number_of_persons: 1,
    table_note: ''
  });
  const [tableGuestTables, setTableGuestTables] = useState<FloorplanTable[]>([]);
  const [tableGuestAssignmentCounts, setTableGuestAssignmentCounts] = useState<Record<string, number>>({});
  const [loadingTableGuestTables, setLoadingTableGuestTables] = useState(false);
  const [paidCountByType, setPaidCountByType] = useState<Record<string, number>>({});
  const [selectedEventForSales, setSelectedEventForSales] = useState<string | null>(null);
  const [ticketSales, setTicketSales] = useState<any[]>([]);
  const [salesSummary, setSalesSummary] = useState<any[]>([]);
  const [salesSearch, setSalesSearch] = useState('');

  const [ordersSearch, setOrdersSearch] = useState('');
  const [debouncedOrdersSearch, setDebouncedOrdersSearch] = useState('');
  const [ordersStatusFilter, setOrdersStatusFilter] = useState('');
  const [ordersEventFilter, setOrdersEventFilter] = useState('');
  const [pdfExporting, setPdfExporting] = useState(false);
  const ordersSearchRef = useRef<HTMLInputElement>(null);
  const ordersDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ordersDebounceRef.current) clearTimeout(ordersDebounceRef.current);
    ordersDebounceRef.current = setTimeout(() => {
      setDebouncedOrdersSearch(ordersSearch.trim());
    }, 300);
    return () => { if (ordersDebounceRef.current) clearTimeout(ordersDebounceRef.current); };
  }, [ordersSearch]);

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (ordersStatusFilter) {
      result = result.filter((o: any) => o.status === ordersStatusFilter);
    }
    if (ordersEventFilter) {
      result = result.filter((o: any) => o.event_id === ordersEventFilter);
    }
    if (debouncedOrdersSearch.length >= 2) {
      const q = debouncedOrdersSearch.toLowerCase();
      result = result.filter((o: any) =>
        o.order_number?.toLowerCase().includes(q) ||
        o.payer_name?.toLowerCase().includes(q) ||
        o.payer_email?.toLowerCase().includes(q) ||
        o.events?.name?.toLowerCase().includes(q) ||
        String(o.total_amount)?.includes(q)
      );
    }
    return result;
  }, [orders, ordersStatusFilter, ordersEventFilter, debouncedOrdersSearch]);

  // Gallery/Media state
  const [galleryImages, setGalleryImages] = useState<any[]>([]);
  const [mediaPage, setMediaPage] = useState(0);
  const MEDIA_PER_PAGE = 8;
  const [showMediaForm, setShowMediaForm] = useState(false);
  const [editingMedia, setEditingMedia] = useState<string | null>(null);
  const [mediaForm, setMediaForm] = useState({
    title: '',
    category: '',
    display_order: 0,
    is_active: true,
    show_in_gallery: true,
  });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);


  async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = imageSrc;
    });
    const canvas = document.createElement('canvas');
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), 'image/png');
    });
  }

  const handleCropConfirm = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const croppedBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      const croppedFile = new File([croppedBlob], 'cropped.png', { type: 'image/png' });
      setMediaFile(croppedFile);
      setMediaPreview(URL.createObjectURL(croppedBlob));
      setShowCropper(false);
      setCropImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch {
      showToast('Kırpma hatası', 'error');
    }
  };

  // Auto-set crop aspect based on category
  const getCropAspectForCategory = (category: string): number | undefined => {
    switch (category) {
      case 'footer': return 16 / 3;
      case 'hero': return 16 / 9;
      default: return undefined;
    }
  };

  const [saTheme, setSaTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('sa-theme') as 'dark' | 'light') || 'dark';
    }
    return 'dark';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleTheme = () => {
    const next = saTheme === 'dark' ? 'light' : 'dark';
    setSaTheme(next);
    localStorage.setItem('sa-theme', next);
  };

  const handleMobileNavClick = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const [, _setLoginForm] = useState({
    email: '',
    password: '',
  });

  const [, _setForgotPasswordForm] = useState({
    email: '',
  });

  const [, _setResetEmailSent] = useState(false);

  const [deleteTicketModal, setDeleteTicketModal] = useState<{
    step: 1 | 2 | 3;
    ticketId: string;
    ticketNumber: string;
    orderId: string;
    eventName: string;
    payerName: string;
    payerEmail: string;
    totalAmount: number;
  } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteReasonDetail, setDeleteReasonDetail] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [eventForm, setEventForm] = useState({
    name: '',
    slug: '',
    description: '',
    venue_name: '',
    venue_address: '',
    location: '',
    location_address: '',
    start_date: '',
    end_date: '',
    scan_open_at: '',
    scan_close_at: '',
    is_active: true,
    poster_url: '',
    poster_thumb_url: '',
    floorplan_enabled: false,
    service_fee_enabled: false,
    service_fee_amount: 0,
  });

  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [uploadingPoster, setUploadingPoster] = useState(false);

  const [eventLogos, setEventLogos] = useState<Array<{
    id?: string;
    file?: File;
    preview?: string;
    url?: string;
    label: string;
    display_order: number;
  }>>([]);

  const TICKET_THEME_PRESETS: Record<string, { label: string; theme: any }> = {
    regular: {
      label: 'Standaard',
      theme: {
        header_bg: 'linear-gradient(135deg, #0e7490 0%, #0369a1 100%)',
        header_text: '#ffffff',
        card_bg: '#0f172a',
        card_border: '#06b6d4',
      },
    },
    gold: {
      label: 'Golden',
      theme: {
        header_bg: 'linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #F7E27E 100%)',
        header_text: '#ffffff',
        card_bg: '#fffdf5',
        card_border: '#D4AF37',
        badge_text: 'GOLD PASS',
        badge_bg: 'linear-gradient(135deg, #D4AF37, #F7E27E)',
        badge_text_color: '#5C4200',
      },
    },
    vip: {
      label: 'VIP',
      theme: {
        header_bg: 'linear-gradient(135deg, #111111 0%, #2A2A2A 100%)',
        header_text: '#ffffff',
        card_bg: '#fafafa',
        card_border: '#1a1a1a',
        badge_text: 'VIP ACCESS',
        badge_bg: 'linear-gradient(135deg, #D4AF37, #F7E27E)',
        badge_text_color: '#1a1a1a',
      },
    },
    emerald: {
      label: 'Yeşil',
      theme: {
        header_bg: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
        header_text: '#ffffff',
        card_bg: '#0f172a',
        card_border: '#10b981',
      },
    },
    fire: {
      label: 'Kırmızı',
      theme: {
        header_bg: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
        header_text: '#ffffff',
        card_bg: '#0f172a',
        card_border: '#ef4444',
      },
    },
    royal: {
      label: 'Mavi',
      theme: {
        header_bg: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
        header_text: '#ffffff',
        card_bg: '#0f172a',
        card_border: '#3b82f6',
      },
    },
    purple: {
      label: 'Mor',
      theme: {
        header_bg: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
        header_text: '#ffffff',
        card_bg: '#0f172a',
        card_border: '#8b5cf6',
      },
    },
    sunset: {
      label: 'Turuncu',
      theme: {
        header_bg: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
        header_text: '#ffffff',
        card_bg: '#0f172a',
        card_border: '#f97316',
      },
    },
    pink: {
      label: 'Pembe',
      theme: {
        header_bg: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)',
        header_text: '#ffffff',
        card_bg: '#0f172a',
        card_border: '#ec4899',
      },
    },
  };

  const [ticketForm, setTicketForm] = useState({
    event_id: '',
    name: '',
    description: '',
    price: 0,
    quantity_total: 0,
    sale_start: '',
    sale_end: '',
    is_active: true,
    show_remaining_tickets: false,
    remaining_display_threshold: null as number | null,
    service_fee_mode: 'none' as 'none' | 'fixed' | 'percent',
    service_fee_fixed: 0,
    service_fee_percent: 0,
    theme_preset: 'regular' as string,
    theme: null as any,
    phase_group: '',
    phase_order: 0,
  });

  const [bulkTicketForm, setBulkTicketForm] = useState({
    event_id: '',
    ticket_type_id: '',
    quantity: 1,
  });

  const [roleForm, setRoleForm] = useState({
    email: '',
    role: 'scanner',
    event_id: '',
    display_name: '',
    password: '',
  });
  const [showRolePassword, setShowRolePassword] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPasswordForm, setResetPasswordForm] = useState({ user_id: '', email: '', new_password: '' });
  const [showResetPassword, setShowResetPassword] = useState(false);

  const adminAllowedTabs = ['guest_tickets', 'table_guests'] as const;
  type AdminAllowedTab = typeof adminAllowedTabs[number];

  function isAdminAllowedTab(tab: string): tab is AdminAllowedTab {
    return adminAllowedTabs.includes(tab as AdminAllowedTab);
  }

  useEffect(() => {
    if (authLoading) return;

    if (!user || !role) return;

    if (role === 'scanner') {
      if (onNavigate) {
        onNavigate('scanner');
      } else {
        window.location.href = '/scanner';
      }
      return;
    }

    if (role === 'admin') {
      if (!isAdminAllowedTab(activeTab)) {
        setActiveTab('guest_tickets');
      }
      loadData();
      return;
    }

    if (!isSuperAdmin()) {
      const redirect = getRedirectPath();
      if (onNavigate) {
        onNavigate(redirect);
      } else {
        window.location.href = '/' + redirect.replace(/^\/+/, '');
      }
      return;
    }

    loadData();
  }, [authLoading, user, role]);

  async function loadData() {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      // SECURITY: Do not log user PII to browser console

      // Fetch real ticket counts from paid + comped orders (quantity_sold in DB may be stale)
      const { data: allPaidOrders } = await supabase.from('orders').select('id').in('status', ['paid', 'comped']).limit(10000);
      const allPaidOrderIds = (allPaidOrders || []).map((o: any) => o.id);
      if (allPaidOrderIds.length > 0) {
        const [paidTicketsRes, paidSeatsRes] = await Promise.all([
          supabase
            .from('tickets')
            .select('id, ticket_type_id')
            .in('order_id', allPaidOrderIds)
            .limit(10000),
          supabase
            .from('ticket_seats')
            .select('id, seats(ticket_type_id)')
            .in('order_id', allPaidOrderIds)
            .limit(10000),
        ]);
        const counts: Record<string, number> = {};
        (paidTicketsRes.data || []).forEach((t: any) => {
          if (t.ticket_type_id) counts[t.ticket_type_id] = (counts[t.ticket_type_id] || 0) + 1;
        });
        (paidSeatsRes.data || []).forEach((s: any) => {
          const typeId = s.seats?.ticket_type_id;
          if (typeId) counts[typeId] = (counts[typeId] || 0) + 1;
        });
        setPaidCountByType(counts);
      }

      if (role === 'admin') {
        const eventsRes = await supabase.from('events').select('*').order('start_date', { ascending: false }).limit(10000);
        const ticketTypesRes = await supabase.from('ticket_types').select('*, events(name)').order('created_at', { ascending: false }).limit(10000);
        if (eventsRes.data) setEvents(eventsRes.data);
        if (ticketTypesRes.data) setTicketTypes(ticketTypesRes.data);
        await loadGuestTickets();
        await loadTableGuests();
        return;
      }

      const [eventsRes, ticketTypesRes, ordersRes, bookingsRes] = await Promise.all([
        supabase.from('events').select('*').order('start_date', { ascending: false }).limit(10000),
        supabase.from('ticket_types').select('*, events(name)').order('created_at', { ascending: false }).limit(10000),
        supabase.from('orders').select('*, events(name)').order('created_at', { ascending: false }).limit(10000),
        supabase.from('table_bookings').select('*, events(name), floorplan_tables(table_number, capacity, table_type)').order('created_at', { ascending: false }).limit(10000),
      ]);

      try {
        const { data: rolesWithEmail, error: rpcError } = await supabase.rpc('list_user_roles_with_email');
        if (!rpcError && rolesWithEmail) {
          setUserRoles(rolesWithEmail);
        } else {
          console.error('[SuperAdmin] RPC error:', rpcError);
          const fallback = await supabase.from('user_roles').select('*').order('created_at', { ascending: false }).limit(10000);
          if (fallback.data) setUserRoles(fallback.data);
        }
      } catch (err) {
        console.error('[SuperAdmin] Error fetching roles with emails:', err);
        const fallback = await supabase.from('user_roles').select('*').order('created_at', { ascending: false }).limit(10000);
        if (fallback.data) setUserRoles(fallback.data);
      }

      if (eventsRes.data) setEvents(eventsRes.data);
      if (ticketTypesRes.data) setTicketTypes(ticketTypesRes.data);
      if (ordersRes.data) {
        const orderIds = ordersRes.data.map(o => o.id);
        const [ticketsRes, seatTicketsRes] = await Promise.all([
          supabase
            .from('tickets')
            .select('id, order_id, ticket_type_id, ticket_number, status, qr_data, holder_name, event_id, ticket_types(id, name, price)')
            .in('order_id', orderIds)
            .limit(10000),
          supabase
            .from('ticket_seats')
            .select('id, order_id, price_paid, seats(id, ticket_type_id, row_label, seat_number, ticket_types(id, name, price))')
            .in('order_id', orderIds)
            .limit(10000),
        ]);
        const ticketsData = ticketsRes.data;
        const seatTicketsData = seatTicketsRes.data;

        const enrichedOrders = ordersRes.data.map(order => {
          const orderTickets = (ticketsData || []).filter(t => t.order_id === order.id);
          const ticketsByType = new Map();
          for (const ticket of orderTickets) {
            const typeId = ticket.ticket_type_id;
            const typeName = (ticket as any).ticket_types?.name || 'Ticket';
            const typePrice = (ticket as any).ticket_types?.price || 0;
            if (!ticketsByType.has(typeId)) {
              ticketsByType.set(typeId, { typeId, typeName, typePrice, quantity: 0 });
            }
            ticketsByType.get(typeId).quantity++;
          }
          const orderSeatTickets = (seatTicketsData || []).filter((s: any) => s.order_id === order.id);
          for (const st of orderSeatTickets) {
            const typeId = (st as any).seats?.ticket_type_id || 'seat';
            const typeName = (st as any).seats?.ticket_types?.name || 'Zitplaats';
            const pricePaidEuros = parseFloat((st as any).price_paid);
            const typePrice = !isNaN(pricePaidEuros) && pricePaidEuros > 0
              ? Math.round(pricePaidEuros * 100)
              : ((st as any).seats?.ticket_types?.price || 0);
            if (!ticketsByType.has(typeId)) {
              ticketsByType.set(typeId, { typeId, typeName, typePrice, quantity: 0 });
            }
            ticketsByType.get(typeId).quantity++;
          }
          return {
            ...order,
            ticket_items: Array.from(ticketsByType.values()),
            individual_tickets: orderTickets.map(t => ({
              id: t.id,
              ticket_number: t.ticket_number,
              status: t.status,
              typeName: (t as any).ticket_types?.name || 'Ticket',
              typePrice: (t as any).ticket_types?.price || 0,
              qr_data: t.qr_data,
              holder_name: t.holder_name,
              event_id: t.event_id,
            })),
          };
        });
        setOrders(enrichedOrders);
      }
      if (bookingsRes.data) {
        setTableBookings(bookingsRes.data);
        setFilteredBookings(bookingsRes.data);
      }

      await loadGuestTickets();
      await loadTableGuests();
      if (role === 'super_admin') {
        await loadGuestAuditLog();
        // Load gallery images
        const { data: galleryData } = await supabase.from('gallery_images').select('*').order('display_order', { ascending: true }).limit(10000);
        if (galleryData) setGalleryImages(galleryData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  const [ticketPdfLoading, setTicketPdfLoading] = useState<string | null>(null);

  async function downloadSingleTicketPdf(ticket: any, order: any) {
    setTicketPdfLoading(ticket.id);
    try {
      const { data: eventData } = await supabase
        .from('events')
        .select('name, start_date, location, venue_name')
        .eq('id', ticket.event_id || order.event_id)
        .maybeSingle();

      const { jsPDF } = await import('jspdf');
      const QRCode = (await import('qrcode')).default;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = doc.internal.pageSize.getWidth();
      const m = 20;

      let y = 22;
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('STAGENATION', pw / 2, y, { align: 'center' });
      y += 10;

      doc.setFontSize(13);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text('TOEGANGSTICKET', pw / 2, y, { align: 'center' });
      y += 8;

      doc.setDrawColor(200);
      doc.setLineWidth(0.3);
      doc.line(m, y, pw - m, y);
      y += 12;

      doc.setTextColor(0);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(eventData?.name || order.events?.name || 'Event', pw / 2, y, { align: 'center' });
      y += 10;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80);
      if (eventData?.start_date) {
        const d = new Date(eventData.start_date);
        const dateStr = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        doc.text(dateStr + ' - ' + timeStr, pw / 2, y, { align: 'center' });
        y += 7;
      }
      const venue = [eventData?.venue_name, eventData?.location].filter(Boolean).join(', ');
      if (venue) {
        doc.text(venue, pw / 2, y, { align: 'center' });
        y += 10;
      } else {
        y += 4;
      }

      doc.setDrawColor(0);
      doc.setLineWidth(0.4);
      doc.roundedRect(m + 10, y, pw - m * 2 - 20, 30, 3, 3);

      const boxLeft = m + 18;
      const valLeft = boxLeft + 38;
      let by = y + 10;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('Type:', boxLeft, by);
      doc.setFont('helvetica', 'normal');
      doc.text(ticket.typeName || 'Ticket', valLeft, by);
      by += 8;

      doc.setFont('helvetica', 'bold');
      doc.text('Prijs:', boxLeft, by);
      doc.setFont('helvetica', 'normal');
      doc.text('EUR ' + ((ticket.typePrice || 0) / 100).toFixed(2), valLeft, by);

      y += 38;

      const qrValue = ticket.qr_data || ticket.ticket_number || order.order_number;
      try {
        const qrDataUrl = await QRCode.toDataURL(qrValue, { width: 400, margin: 2 });
        if (qrDataUrl) {
          const qrSize = 55;
          const qrX = (pw - qrSize) / 2;
          doc.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize);
          y += qrSize + 6;
        }
      } catch {
        y += 6;
      }

      if (ticket.ticket_number) {
        doc.setFontSize(14);
        doc.setFont('courier', 'bold');
        doc.setTextColor(0);
        doc.text(ticket.ticket_number, pw / 2, y, { align: 'center' });
        y += 12;
      }

      doc.setDrawColor(200);
      doc.setLineWidth(0.3);
      doc.line(m, y, pw - m, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text('Bestelnummer: ' + order.order_number, pw / 2, y, { align: 'center' });
      y += 5;
      doc.text('Naam: ' + (ticket.holder_name || order.payer_name || '-'), pw / 2, y, { align: 'center' });
      y += 8;
      doc.setFontSize(8);
      doc.text('Dit ticket is uniek en kan slechts een keer gescand worden.', pw / 2, y, { align: 'center' });
      y += 5;
      doc.text('Toon dit ticket bij de ingang op je telefoon of geprint.', pw / 2, y, { align: 'center' });

      doc.save('StageNation-Ticket-' + (ticket.ticket_number || ticket.id) + '.pdf');
      showToast('Ticket PDF gedownload', 'success');
    } catch (error) {
      console.error('Error generating ticket PDF:', error);
      showToast('PDF genereren mislukt', 'error');
    } finally {
      setTicketPdfLoading(null);
    }
  }

  async function resendTicketEmail(orderId: string) {
    if (!confirm('Weet je zeker dat je de ticket email opnieuw wil versturen?')) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-ticket-email', {
        body: { orderId, resend: true, source: 'superadmin' },
      });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw new Error(error.message || 'Edge function error');
      }

      if (data && !data.ok) {
        console.error('❌ Email send failed:', data);
        const detailedMsg = data.code ? `[${data.code}] ${data.message}` : (data.message || 'Onbekende fout');
        throw new Error(detailedMsg);
      }

      showToast('Ticket email is opnieuw verstuurd!', 'success');
      await loadData();
    } catch (error) {
      console.error('💥 Error resending email:', error);
      const errorMessage = (error as Error).message || 'Onbekende fout';
      showToast('Fout bij versturen email:\n\n' + errorMessage, 'error');
    }
  }

  async function exportOrdersToCSV() {
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_number, event_id, payer_email, payer_name, payer_phone, total_amount, status, created_at, paid_at, service_fee_total_cents, platform_fee_total_cents, provider_fee_total_cents, net_revenue_cents, events(name)')
        .in('status', ['paid', 'pending'])
        .order('created_at', { ascending: false })
        .limit(10000);

      if (ordersError) throw ordersError;

      const { data: ticketsData } = await supabase
        .from('tickets')
        .select('id, order_id, ticket_type_id, ticket_types(name, price, service_fee_mode, service_fee_fixed, service_fee_percent)')
        .in('order_id', (ordersData || []).map(o => o.id))
        .in('status', ['valid', 'used'])
        .limit(10000);

      const csvRows = [];
      csvRows.push([
        'Order Number', 'Event', 'Customer Name', 'Email', 'Phone', 'Ticket Count',
        'Subtotal (EUR)', 'Service Fee Mode', 'Service Fee Fixed', 'Service Fee Percent',
        'Service Fee Total (EUR)', 'Total Amount (EUR)',
        'Status', 'Created At', 'Paid At'
      ].join(','));

      for (const order of ordersData || []) {
        const orderTickets = (ticketsData || []).filter((t: any) => t.order_id === order.id);
        const subtotalCents = orderTickets.reduce((sum: number, t: any) => sum + (t.ticket_types?.price || 0), 0);
        const serviceFee = (order as any).service_fee_total_cents || 0;

        const feeMode = orderTickets.length > 0 ? ((orderTickets[0] as any).ticket_types?.service_fee_mode || 'none') : 'none';
        const feeFixed = orderTickets.length > 0 ? ((orderTickets[0] as any).ticket_types?.service_fee_fixed || 0) : 0;
        const feePercent = orderTickets.length > 0 ? ((orderTickets[0] as any).ticket_types?.service_fee_percent || 0) : 0;

        csvRows.push([
          `"${order.order_number}"`,
          `"${(order as any).events?.name || 'Unknown'}"`,
          `"${order.payer_name || ''}"`,
          `"${order.payer_email || ''}"`,
          `"${order.payer_phone || ''}"`,
          orderTickets.length,
          (subtotalCents / 100).toFixed(2),
          feeMode,
          Number(feeFixed).toFixed(2),
          Number(feePercent).toFixed(2),
          (serviceFee / 100).toFixed(2),
          (order.total_amount / 100).toFixed(2),
          order.status,
          new Date(order.created_at).toLocaleString('nl-BE'),
          order.paid_at ? new Date(order.paid_at).toLocaleString('nl-BE') : ''
        ].join(','));
      }

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `orders_export_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (error) {
      console.error('Error exporting CSV:', error);
      showToast('Fout bij exporteren naar CSV', 'error');
    }
  }

  async function exportOrdersToPDF() {
    setPdfExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const margin = 12;
      const rowHeight = 7;

      const dataToExport = filteredOrders.length > 0 ? filteredOrders : orders;
      if (dataToExport.length === 0) {
        showToast('Geen orders om te exporteren', 'error');
        setPdfExporting(false);
        return;
      }

      const cols = [
        { header: 'Order #', width: 32 },
        { header: 'Event', width: 50 },
        { header: 'Klant', width: 45 },
        { header: 'Email', width: 55 },
        { header: 'Bedrag', width: 22 },
        { header: 'Status', width: 20 },
        { header: 'Tickets', width: 16 },
        { header: 'Datum', width: 35 },
      ];

      function drawHeader(d: InstanceType<typeof jsPDF>, pageNum: number, totalPages: number) {
        d.setFontSize(16);
        d.setFont('helvetica', 'bold');
        d.setTextColor(0);
        d.text('STAGENATION - Orders Overzicht', margin, 14);

        d.setFontSize(8);
        d.setFont('helvetica', 'normal');
        d.setTextColor(120);
        const dateStr = new Date().toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        d.text(`Gegenereerd: ${dateStr}`, margin, 20);

        const filterParts: string[] = [];
        if (ordersStatusFilter) filterParts.push(`Status: ${ordersStatusFilter}`);
        if (ordersEventFilter) {
          const evName = events.find(e => e.id === ordersEventFilter)?.name || ordersEventFilter;
          filterParts.push(`Event: ${evName}`);
        }
        if (debouncedOrdersSearch) filterParts.push(`Zoek: "${debouncedOrdersSearch}"`);
        if (filterParts.length > 0) {
          d.text(`Filters: ${filterParts.join(' | ')}`, margin, 24);
        }

        d.text(`${dataToExport.length} orders | Pagina ${pageNum}/${totalPages}`, pw - margin, 14, { align: 'right' });

        let x = margin;
        const headerY = 30;
        d.setFillColor(30, 41, 59);
        d.rect(margin, headerY - 4.5, pw - margin * 2, rowHeight, 'F');
        d.setFontSize(7);
        d.setFont('helvetica', 'bold');
        d.setTextColor(255);
        for (const col of cols) {
          d.text(col.header, x + 1, headerY);
          x += col.width;
        }
        d.setTextColor(0);
        return headerY + rowHeight;
      }

      const rowsPerPage = Math.floor((ph - 42) / rowHeight);
      const totalPages = Math.ceil(dataToExport.length / rowsPerPage);

      let y = drawHeader(doc, 1, totalPages);
      let page = 1;

      for (let i = 0; i < dataToExport.length; i++) {
        if (y + rowHeight > ph - 8) {
          doc.addPage();
          page++;
          y = drawHeader(doc, page, totalPages);
        }

        const order = dataToExport[i];
        if (i % 2 === 0) {
          doc.setFillColor(241, 245, 249);
          doc.rect(margin, y - 4, pw - margin * 2, rowHeight, 'F');
        }

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30);

        let x = margin;
        const truncate = (s: string, maxW: number) => {
          if (!s) return '';
          const maxChars = Math.floor(maxW / 1.6);
          return s.length > maxChars ? s.substring(0, maxChars - 1) + '..' : s;
        };

        doc.setFont('helvetica', 'bold');
        doc.text(truncate(order.order_number || '', cols[0].width), x + 1, y);
        x += cols[0].width;

        doc.setFont('helvetica', 'normal');
        doc.text(truncate(order.events?.name || '-', cols[1].width), x + 1, y);
        x += cols[1].width;

        doc.text(truncate(order.payer_name || '-', cols[2].width), x + 1, y);
        x += cols[2].width;

        doc.text(truncate(order.payer_email || '-', cols[3].width), x + 1, y);
        x += cols[3].width;

        doc.text('\u20AC' + (order.total_amount / 100).toFixed(2), x + 1, y);
        x += cols[4].width;

        const statusLabel: Record<string, string> = { paid: 'Betaald', pending: 'Pending', failed: 'Mislukt', cancelled: 'Geannuleerd', comped: 'Comped', refunded: 'Teruggestort' };
        doc.text(statusLabel[order.status] || order.status, x + 1, y);
        x += cols[5].width;

        const ticketCount = order.ticket_items?.reduce((s: number, t: any) => s + (t.quantity || 0), 0) || 0;
        doc.text(String(ticketCount), x + 1, y);
        x += cols[6].width;

        doc.text(new Date(order.created_at).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }), x + 1, y);

        y += rowHeight;
      }

      const totalRevenue = dataToExport
        .filter((o: any) => o.status === 'paid' || o.status === 'comped')
        .reduce((s: number, o: any) => s + (o.total_amount || 0), 0);
      const paidCount = dataToExport.filter((o: any) => o.status === 'paid').length;

      if (y + 16 > ph - 8) {
        doc.addPage();
        y = 20;
      }
      y += 4;
      doc.setDrawColor(200);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pw - margin, y);
      y += 6;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text(`Totaal: ${dataToExport.length} orders | ${paidCount} betaald | Omzet: \u20AC${(totalRevenue / 100).toFixed(2)}`, margin, y);

      doc.save(`StageNation_Orders_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast('PDF gedownload', 'success');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      showToast('Fout bij exporteren naar PDF', 'error');
    } finally {
      setPdfExporting(false);
    }
  }

  async function exportGuestTicketsToCSV() {
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_number, event_id, payer_email, payer_name, created_at, metadata, events(name)')
        .eq('status', 'comped')
        .order('created_at', { ascending: false })
        .limit(10000);

      if (ordersError) throw ordersError;

      const orderIds = (ordersData || []).map(o => o.id);
      const { data: ticketsData } = await supabase
        .from('tickets')
        .select('id, order_id, ticket_number, ticket_types(name)')
        .in('order_id', orderIds)
        .limit(10000);

      const csvRows = [];
      csvRows.push(['Event ID', 'Event Name', 'Ticket ID', 'Ticket Number', 'Guest Name', 'Guest Email', 'Sent By Admin', 'Sent At', 'Notes'].join(','));

      for (const order of ordersData || []) {
        const ticket = (ticketsData || []).find(t => t.order_id === order.id);
        csvRows.push([
          `"${order.event_id}"`,
          `"${(order.events as any)?.name || 'Unknown'}"`,
          `"${ticket?.id || ''}"`,
          `"${ticket?.ticket_number || ''}"`,
          `"${order.payer_name || ''}"`,
          `"${order.payer_email || ''}"`,
          `"${order.metadata?.sent_by || 'Unknown'}"`,
          `"${new Date(order.created_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })}"`,
          `"${(order.metadata?.notes || '').replace(/"/g, '""')}"`
        ].join(','));
      }

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `guest_tickets_export_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (error) {
      console.error('Error exporting guest tickets CSV:', error);
      showToast('Fout bij exporteren naar CSV', 'error');
    }
  }

  function calculateRefund(booking: any) {
    if (!booking) return { percentage: 0, amount: 0, policy: 'unknown' };

    const event = events.find(e => e.id === booking.event_id);
    if (!event) return { percentage: 0, amount: 0, policy: 'unknown' };

    const now = new Date();
    const eventStart = new Date(event.start_date);
    const daysUntilEvent = Math.ceil((eventStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const totalPrice = parseFloat(booking.total_price) || 0;
    const totalPriceCents = Math.round(totalPrice * 100);

    if (daysUntilEvent >= 10) {
      return {
        percentage: 100,
        amount: totalPriceCents,
        policy: 'free_cancellation',
        daysUntilEvent
      };
    } else {
      return {
        percentage: 70,
        amount: Math.round(totalPriceCents * 0.7),
        policy: '30_percent_retention',
        daysUntilEvent
      };
    }
  }

  async function loadGuestTickets() {
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*, events(name)')
        .eq('status', 'comped')
        .order('created_at', { ascending: false })
        .limit(10000);

      if (ordersError) throw ordersError;

      const orderIds = (ordersData || []).map(o => o.id);
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('tickets')
        .select('*, ticket_types(name), floorplan_tables(id, table_number, table_type, capacity)')
        .in('order_id', orderIds)
        .limit(10000);

      if (ticketsError) throw ticketsError;

      const enrichedOrders = (ordersData || []).map(order => {
        const ticket = (ticketsData || []).find(t => t.order_id === order.id);
        return {
          ...order,
          ticket_id: ticket?.id,
          ticket_number: ticket?.ticket_number,
          ticket_status: ticket?.status,
          ticket_scan_status: ticket?.scan_status,
          ticket_holder_email: ticket?.holder_email,
          ticket_type_name: ticket?.ticket_types?.name,
          recipient_name: order.payer_name,
          recipient_email: order.payer_email,
          sent_by_email: order.metadata?.sent_by || 'Unknown',
          notes: order.metadata?.notes,
          assigned_table: ticket?.floorplan_tables,
          table_note: ticket?.table_note
        };
      });

      setGuestTickets(enrichedOrders);
    } catch (error) {
      console.error('Error loading guest tickets:', error);
    }
  }

  async function loadGuestAuditLog() {
    try {
      const { data, error } = await supabase
        .from('guest_ticket_audit_log')
        .select('*, events(name)')
        .order('created_at', { ascending: false })
        .limit(10000);

      if (error) throw error;
      setGuestAuditLog(data || []);
    } catch (error) {
      console.error('Error loading guest audit log:', error);
    }
  }

  async function loadTicketTypesForEvent(eventId: string) {
    if (!eventId) {
      setGuestTicketTypes([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('ticket_types')
        .select('*')
        .eq('event_id', eventId)
        .order('name')
        .limit(10000);

      if (error) throw error;
      setGuestTicketTypes(data || []);
    } catch (error) {
      console.error('Error loading ticket types:', error);
      setGuestTicketTypes([]);
    }
  }

  async function loadAvailableTablesForEvent(eventId: string) {
    if (!eventId) {
      setAvailableTables([]);
      setTableAssignmentCounts({});
      return;
    }
    setLoadingTables(true);
    try {
      const { data: tables, error: tablesError } = await supabase
        .from('floorplan_tables')
        .select('*')
        .eq('is_active', true)
        .order('table_number')
        .limit(10000);

      if (tablesError) throw tablesError;
      setAvailableTables(tables || []);

      const { data: existingAssignments, error: assignmentsError } = await supabase
        .from('tickets')
        .select('assigned_table_id')
        .eq('event_id', eventId)
        .not('assigned_table_id', 'is', null)
        .limit(10000);

      if (assignmentsError) throw assignmentsError;

      const counts: Record<string, number> = {};
      (existingAssignments || []).forEach((ticket: any) => {
        if (ticket.assigned_table_id) {
          counts[ticket.assigned_table_id] = (counts[ticket.assigned_table_id] || 0) + 1;
        }
      });
      setTableAssignmentCounts(counts);
    } catch (error) {
      console.error('Error loading available tables:', error);
      setAvailableTables([]);
      setTableAssignmentCounts({});
    } finally {
      setLoadingTables(false);
    }
  }

  async function loadTableGuests() {
    try {
      const { data, error } = await supabase
        .from('table_guests')
        .select('*, events(name), table_bookings(id, floorplan_tables(id, table_number, table_type, capacity))')
        .order('created_at', { ascending: false })
        .limit(10000);

      if (error) {
        console.error('LOAD_TABLE_GUESTS: Query error:', error);
        throw error;
      }

      const guestsWithTickets = await Promise.all((data || []).map(async (guest) => {
        let ticketData = null;
        let orderData = null;

        if (guest.ticket_id) {
          const { data: ticket } = await supabase
            .from('tickets')
            .select('id, ticket_number, status, scan_status, holder_email, order_id')
            .eq('id', guest.ticket_id)
            .maybeSingle();
          ticketData = ticket;

          if (ticket?.order_id) {
            const { data: order } = await supabase
              .from('orders')
              .select('id, order_number')
              .eq('id', ticket.order_id)
              .maybeSingle();
            orderData = order;
          }
        }

        return {
          ...guest,
          tickets: ticketData,
          orders: orderData
        };
      }));

      setTableGuests(guestsWithTickets);
    } catch (error) {
      console.error('LOAD_TABLE_GUESTS: Error:', error);
    }
  }

  async function resendTableGuestEmail(tableGuestId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showToast('Niet ingelogd. Log opnieuw in.', 'error');
        return;
      }

      const { data, error } = await supabase.functions.invoke('resend-table-guest-email', {
        body: { table_guest_id: tableGuestId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data && data.email_sent) {
        showToast('Email succesvol opnieuw verstuurd!', 'success');
      } else {
        showToast('Email kon niet worden verstuurd: ' + (data?.email_error || 'Onbekende fout'), 'error');
      }

      await loadTableGuests();
    } catch (error) {
      console.error('Error resending table guest email:', error);
      showToast('Fout bij opnieuw versturen email: ' + (error as Error).message, 'error');
    }
  }

  async function loadTableGuestTablesForEvent(eventId: string) {
    if (!eventId) {
      setTableGuestTables([]);
      setTableGuestAssignmentCounts({});
      return;
    }
    setLoadingTableGuestTables(true);
    try {
      const { data: tables, error: tablesError } = await supabase
        .from('floorplan_tables')
        .select('*')
        .eq('is_active', true)
        .order('table_number')
        .limit(10000);

      if (tablesError) throw tablesError;
      setTableGuestTables(tables || []);

      const { data: existingAssignments, error: assignmentsError } = await supabase
        .from('table_guests')
        .select('assigned_table_id')
        .eq('event_id', eventId)
        .eq('status', 'valid')
        .limit(10000);

      if (assignmentsError) throw assignmentsError;

      const counts: Record<string, number> = {};
      (existingAssignments || []).forEach((guest: any) => {
        if (guest.assigned_table_id) {
          counts[guest.assigned_table_id] = (counts[guest.assigned_table_id] || 0) + 1;
        }
      });
      setTableGuestAssignmentCounts(counts);
    } catch (error) {
      console.error('Error loading tables for table guest:', error);
      setTableGuestTables([]);
      setTableGuestAssignmentCounts({});
    } finally {
      setLoadingTableGuestTables(false);
    }
  }

  async function sendTableGuest() {
    if (!tableGuestForm.event_id || !tableGuestForm.assigned_table_id || !tableGuestForm.guest_name || !tableGuestForm.guest_email) {
      showToast('Vul alle verplichte velden in', 'error');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error(`[${correlationId}] AUTH_FAILED: No session`);
        showToast('Niet ingelogd. Log opnieuw in.', 'error');
        return;
      }

      const { data, error } = await supabase.functions.invoke('send-table-guest', {
        body: tableGuestForm,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (data && !data.ok) {
        console.error('Edge function failed:', data.error);
        throw new Error(data.error || 'Failed to send table guest');
      }

      if (data && data.ok && !data.email_sent) {
        showToast('Tafel gast aangemaakt, maar email kon niet worden verstuurd: ' + (data.email_error || 'Onbekende fout') + '\n\nJe kunt later opnieuw proberen via de "Opnieuw versturen" knop.', 'error');
      } else {
        showToast('Tafel gast succesvol verstuurd!', 'success');
      }

      setShowTableGuestForm(false);
      setTableGuestForm({
        event_id: '',
        assigned_table_id: '',
        guest_name: '',
        guest_email: '',
        number_of_persons: 1,
        table_note: ''
      });
      setTableGuestTables([]);
      setTableGuestAssignmentCounts({});

      await loadTableGuests();

    } catch (error) {
      console.error('Error sending table guest:', error);
      showToast('Fout bij versturen tafel gast: ' + (error as Error).message, 'error');
    }
  }

  async function sendGuestTicket() {
    if (!guestTicketForm.event_id || !guestTicketForm.ticket_type_id || !guestTicketForm.recipient_email || !guestTicketForm.recipient_name) {
      showToast('Vul alle verplichte velden in', 'error');
      return;
    }

    try {
      const hasSeatAssignments = guestSeatAssignments.length > 0;
      const { data, error } = await supabase.functions.invoke('send-guest-ticket', {
        body: {
          ...guestTicketForm,
          assign_seats: hasSeatAssignments,
          seat_assignments: hasSeatAssignments ? guestSeatAssignments : [],
        },
      });

      if (error) {
        const msg = data?.error || error.message;
        throw new Error(msg);
      }

      if (data && !data.success) {
        throw new Error(data.error || 'Failed to send guest ticket');
      }

      const count = guestTicketForm.persons_count;
      showToast(`${count > 1 ? count + ' guest tickets' : 'Guest ticket'} succesvol verstuurd!`, 'success');
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
      setAvailableTables([]);
      setTableAssignmentCounts({});
      setGuestSeatAssignments([]);
      await loadGuestTickets();
      if (role === 'super_admin') {
        await loadGuestAuditLog();
      }
    } catch (error) {
      console.error('Error sending guest ticket:', error);
      showToast('Fout bij versturen guest ticket: ' + (error as Error).message, 'error');
    }
  }

  async function handleCancelBooking() {
    if (!selectedBookingForCancellation) return;

    try {
      const refundInfo = calculateRefund(selectedBookingForCancellation);

      const { error } = await supabase
        .from('table_bookings')
        .update({
          status: 'CANCELLED',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: cancellationReason || 'Geannuleerd door admin',
          refund_percentage: refundInfo.percentage,
          refund_amount: refundInfo.amount,
          refund_policy_applied: refundInfo.policy,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedBookingForCancellation.id);

      if (error) throw error;

      showToast(`Reservatie geannuleerd!\n\nTerugbetaling: ${refundInfo.percentage}% (€${(refundInfo.amount / 100).toFixed(2)})\nDagen tot event: ${refundInfo.daysUntilEvent}`, 'success');

      setShowCancellationModal(false);
      setSelectedBookingForCancellation(null);
      setCancellationReason('');
      await loadData();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      showToast('Fout bij annuleren: ' + (error as Error).message, 'error');
    }
  }

  async function loadTicketSalesSummary() {
    try {
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select('id, event_id, total_amount, created_at, status, events(id, name, start_date)')
        .in('status', ['paid', 'comped'])
        .order('created_at', { ascending: false })
        .limit(10000);

      if (error) throw error;

      const grouped = (ordersData || []).reduce((acc: any, order: any) => {
        const eventId = order.event_id;
        if (!acc[eventId]) {
          acc[eventId] = {
            event_id: eventId,
            event_name: order.events?.name || 'Unknown Event',
            event_date: order.events?.start_date || null,
            total_orders: 0,
            total_tickets: 0,
            total_revenue_cents: 0,
            last_order_at: null
          };
        }
        acc[eventId].total_orders++;
        acc[eventId].total_revenue_cents += order.total_amount || 0;
        if (!acc[eventId].last_order_at || new Date(order.created_at) > new Date(acc[eventId].last_order_at)) {
          acc[eventId].last_order_at = order.created_at;
        }
        return acc;
      }, {});

      const { data: ticketCounts } = await supabase
        .from('tickets')
        .select('order_id, event_id')
        .limit(10000);

      (ticketCounts || []).forEach((ticket: any) => {
        const order = ordersData?.find(o => o.id === ticket.order_id);
        if (order && grouped[ticket.event_id]) {
          grouped[ticket.event_id].total_tickets++;
        }
      });

      const summaryArray = Object.values(grouped).sort((a: any, b: any) => {
        const dateA = a.event_date ? new Date(a.event_date).getTime() : 0;
        const dateB = b.event_date ? new Date(b.event_date).getTime() : 0;
        return dateB - dateA;
      });

      setSalesSummary(summaryArray);
    } catch (error) {
      console.error('Error loading ticket sales summary:', error);
    }
  }

  async function loadTicketSalesForEvent(eventId: string) {
    try {
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select('id, order_number, event_id, payer_email, payer_name, payer_phone, total_amount, status, created_at, paid_at')
        .eq('event_id', eventId)
        .in('status', ['paid', 'comped'])
        .order('created_at', { ascending: false })
        .limit(10000);

      if (error) throw error;

      const { data: ticketsData } = await supabase
        .from('tickets')
        .select('id, order_id, ticket_type_id, ticket_types(id, name, price)')
        .in('order_id', (ordersData || []).map(o => o.id))
        .limit(10000);

      const enrichedOrders = (ordersData || []).map(order => {
        const orderTickets = (ticketsData || []).filter(t => t.order_id === order.id);
        const ticketSubtotal = orderTickets.reduce((sum, t) => sum + ((t.ticket_types as any)?.price || 0), 0);
        const adminFee = Math.max(0, order.total_amount - ticketSubtotal);

        return {
          id: order.id,
          order_id: order.order_number,
          event_id: order.event_id,
          buyer_email: order.payer_email,
          buyer_name: order.payer_name,
          buyer_phone: order.payer_phone,
          quantity: orderTickets.length,
          subtotal_cents: ticketSubtotal,
          fee_cents: adminFee,
          total_cents: order.total_amount,
          currency: 'EUR',
          payment_status: order.status,
          created_at: order.created_at,
          paid_at: order.paid_at,
          organizer_amount: ticketSubtotal,
          platform_amount: adminFee,
          ticket_order_items: orderTickets.map(t => ({
            ticket_type_name: (t.ticket_types as any)?.name || 'Unknown',
            unit_price_cents: (t.ticket_types as any)?.price || 0,
            quantity: 1,
            line_total_cents: (t.ticket_types as any)?.price || 0
          }))
        };
      });

      setTicketSales(enrichedOrders);
    } catch (error) {
      console.error('Error loading ticket sales:', error);
    }
  }

  function exportSalesCSV(eventId: string) {
    const eventName = events.find(e => e.id === eventId)?.name || 'Event';
    const eventSales = ticketSales.filter(s => s.event_id === eventId);

    if (eventSales.length === 0) {
      showToast('Geen verkoopgegevens gevonden voor dit evenement.', 'info');
      return;
    }

    const csvRows = [];
    csvRows.push(['Order ID', 'Aangemaakt', 'Naam', 'Email', 'Telefoon', 'Aantal', 'Organisator Bedrag', 'Totaal', 'Valuta', 'Status'].join(','));

    for (const sale of eventSales) {
      const row = [
        sale.order_id,
        new Date(sale.created_at).toLocaleString('nl-NL'),
        `"${sale.buyer_name || ''}"`,
        sale.buyer_email || '',
        sale.buyer_phone || '',
        sale.quantity,
        `€${(sale.organizer_amount / 100).toFixed(2)}`,
        `€${(sale.total_cents / 100).toFixed(2)}`,
        sale.currency,
        sale.payment_status
      ];
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ticketverkopen_${eventName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportSalesItemsCSV(eventId: string) {
    const eventName = events.find(e => e.id === eventId)?.name || 'Event';
    const eventSales = ticketSales.filter(s => s.event_id === eventId);

    if (eventSales.length === 0) {
      showToast('Geen verkoopgegevens gevonden voor dit evenement.', 'info');
      return;
    }

    const csvRows = [];
    csvRows.push(['Order ID', 'Aangemaakt', 'Ticket Type', 'Eenheidsprijs', 'Aantal', 'Lijn Totaal'].join(','));

    for (const sale of eventSales) {
      for (const item of (sale.ticket_order_items || [])) {
        const row = [
          sale.order_id,
          new Date(sale.created_at).toLocaleString('nl-NL'),
          `"${item.ticket_type_name}"`,
          `€${(item.unit_price_cents / 100).toFixed(2)}`,
          item.quantity,
          `€${(item.line_total_cents / 100).toFixed(2)}`
        ];
        csvRows.push(row.join(','));
      }
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ticketverkopen_items_${eventName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  useEffect(() => {
    let filtered = [...tableBookings];

    if (bookingFilters.event) {
      filtered = filtered.filter(b => b.event_id === bookingFilters.event);
    }

    if (bookingFilters.status) {
      filtered = filtered.filter(b => b.status === bookingFilters.status);
    }

    if (bookingFilters.search) {
      const search = bookingFilters.search.toLowerCase();
      filtered = filtered.filter(b =>
        b.customer_name?.toLowerCase().includes(search) ||
        b.customer_email?.toLowerCase().includes(search) ||
        b.booking_code?.toLowerCase().includes(search)
      );
    }

    setFilteredBookings(filtered);
  }, [bookingFilters, tableBookings]);

  useEffect(() => {
    if (activeTab === 'ticketverkopen') {
      loadTicketSalesSummary();
      if (selectedEventForSales) {
        loadTicketSalesForEvent(selectedEventForSales);
      }
    }
  }, [activeTab, selectedEventForSales]);

  async function handleLogout() {
    await logout();
    if (onNavigate) {
      onNavigate('login');
    } else {
      window.location.href = '/login';
    }
  }

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let eventId = editingEvent;

      // Prepare event data (exclude poster fields as they're managed separately)
      const { poster_url, poster_thumb_url, ...eventData } = eventForm;

      // Convert local times to UTC for storage
      const eventDataUtc = {
        ...eventData,
        start_date: eventData.start_date ? localInputToUtc(eventData.start_date) : null,
        end_date: eventData.end_date ? localInputToUtc(eventData.end_date) : null,
        scan_open_at: eventData.scan_open_at ? localInputToUtc(eventData.scan_open_at) : null,
        scan_close_at: eventData.scan_close_at ? localInputToUtc(eventData.scan_close_at) : null,
      };

      if (editingEvent) {
        const { error } = await supabase
          .from('events')
          .update({
            ...eventDataUtc,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEvent);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('events')
          .insert({
            ...eventDataUtc,
            metadata: {},
          })
          .select()
          .single();

        if (error) throw error;
        eventId = data.id;
      }

      // Upload poster if selected
      if (posterFile && eventId) {
        setUploadingPoster(true);
        try {
          const result = await uploadEventImage({
            eventId,
            file: posterFile,
            imageType: 'poster',
          });

          if (!result.success) {
            const errorDetails = result.error || 'Unknown error';
            console.error('Poster upload failed:', errorDetails);
            showToast(
              `Poster upload gefaald:\n\n${errorDetails}\n\n` +
              `Het event is wel opgeslagen. Je kunt de poster later toevoegen via Edit.`, 'error'
            );
          }
        } catch (posterError: any) {
          console.error('Poster upload error:', posterError);
          const errorMsg = posterError.message || 'Unknown error';
          showToast(
            `Poster upload gefaald:\n\n${errorMsg}\n\n` +
            `Het event is wel opgeslagen. Je kunt de poster later toevoegen via Edit.`, 'error'
          );
        } finally {
          setUploadingPoster(false);
        }
      }

      // Upload event logos if any
      if (eventLogos.length > 0 && eventId) {
        for (const logo of eventLogos) {
          if (logo.file) {
            try {
              const result = await uploadEventImage({
                eventId,
                file: logo.file,
                imageType: 'logo',
              });

              if (result.success && result.fullUrl) {
                // Save logo metadata to database
                await supabase.from('event_logos').insert({
                  event_id: eventId,
                  logo_url: result.fullUrl,
                  logo_thumb_url: result.thumbUrl,
                  label: logo.label || null,
                  display_order: logo.display_order,
                });
              }
            } catch (logoError: any) {
              console.error('Error uploading logo:', logoError);
            }
          }
        }
      }

      showToast(editingEvent ? 'Event bijgewerkt!' : 'Event aangemaakt!', 'success');
      setShowEventForm(false);
      setEditingEvent(null);
      resetEventForm();
      setPosterFile(null);
      setPosterPreview(null);
      setEventLogos([]);
      setUploadingPoster(false);
      loadData();
    } catch (error: any) {
      console.error('Error saving event:', error);
      showToast(`Fout: ${error.message}`, 'error');
      setUploadingPoster(false);
    }
  };

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const priceInCents = Math.round(ticketForm.price * 100);

      // Convert local times to UTC for storage
      const presetObj = TICKET_THEME_PRESETS[ticketForm.theme_preset];
      const resolvedTheme = ticketForm.theme_preset === 'custom'
        ? ticketForm.theme
        : (presetObj?.theme || null);

      const { theme_preset, theme: _theme, ...restForm } = ticketForm;
      const ticketDataUtc = {
        ...restForm,
        price: priceInCents,
        sale_start: ticketForm.sale_start ? localInputToUtc(ticketForm.sale_start) : null,
        sale_end: ticketForm.sale_end ? localInputToUtc(ticketForm.sale_end) : null,
        remaining_display_threshold: ticketForm.remaining_display_threshold !== null && ticketForm.remaining_display_threshold !== undefined ? ticketForm.remaining_display_threshold : null,
        theme: resolvedTheme,
        color: resolvedTheme?.card_border || '#06b6d4',
      };

      if (editingTicket) {
        const { error } = await supabase
          .from('ticket_types')
          .update(ticketDataUtc)
          .eq('id', editingTicket);

        if (error) throw error;
        showToast('Tickettype bijgewerkt!', 'success');
      } else {
        const { error } = await supabase
          .from('ticket_types')
          .insert({
            ...ticketDataUtc,
            quantity_sold: 0,
          });

        if (error) throw error;
        showToast('Tickettype aangemaakt!', 'success');
      }

      setShowTicketForm(false);
      setEditingTicket(null);
      resetTicketForm();
      loadData();
    } catch (error: any) {
      console.error('Error saving ticket type:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  };

  const handleBulkTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!bulkTicketForm.event_id || !bulkTicketForm.ticket_type_id || bulkTicketForm.quantity < 1) {
      showToast('Vul alle velden correct in.', 'error');
      return;
    }

    try {
      // SECURITY: Use session token instead of anon key for privileged operations
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showToast('Niet ingelogd. Log opnieuw in.', 'error');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-validate-ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'bulk-create',
            event_id: bulkTicketForm.event_id,
            ticket_type_id: bulkTicketForm.ticket_type_id,
            quantity: bulkTicketForm.quantity,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Bulk ticket creation failed');
      }

      await response.json();
      showToast(`${bulkTicketForm.quantity} tickets succesvol aangemaakt!`, 'success');
      setShowBulkTicketForm(false);
      resetBulkTicketForm();
      loadData();
    } catch (error: any) {
      console.error('Error creating bulk tickets:', error);
      showToast(`Fout bij aanmaken tickets: ${error.message}`, 'error');
    }
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingRole) {
        const { error } = await supabase
          .from('user_roles')
          .update({
            role: roleForm.role,
            event_id: roleForm.event_id || null,
            display_name: roleForm.display_name || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingRole);

        if (error) throw error;
        showToast('Rol bijgewerkt!', 'success');
      } else {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          throw new Error('Niet ingelogd. Log opnieuw in.');
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user-role`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              email: roleForm.email,
              role: roleForm.role,
              event_id: roleForm.event_id || null,
              password: roleForm.password || null,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[SuperAdmin] HTTP error:', response.status, errorText);
          try {
            const errorJson = JSON.parse(errorText);
            throw new Error(errorJson.error || `Server fout: ${response.status}`);
          } catch {
            throw new Error(`Server fout: ${response.status} - ${errorText.slice(0, 200)}`);
          }
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to create role');
        }

        if (roleForm.display_name && result.user_id) {
          await supabase
            .from('user_roles')
            .update({ display_name: roleForm.display_name })
            .eq('user_id', result.user_id)
            .is('display_name', null);
        }

        if (result.is_new_user && result.temp_password) {
          showToast(`Rol aangemaakt voor ${roleForm.email}!\n\nWachtwoord: ${result.temp_password}`, 'success');
        } else {
          showToast(`Rol aangemaakt voor ${roleForm.email}!`, 'success');
        }
      }

      setShowRoleForm(false);
      setEditingRole(null);
      resetRoleForm();
      loadData();
    } catch (error: any) {
      console.error('[SuperAdmin] Error saving role:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  };

  const handleEditEvent = (event: Event) => {
    setEditingEvent(event.id);
    setEventForm({
      name: event.name,
      slug: event.slug,
      description: event.description || '',
      venue_name: (event as any).venue_name || '',
      venue_address: (event as any).venue_address || '',
      location: event.location,
      location_address: event.location_address,
      start_date: utcToLocalInput((event as any).start_date || ''),
      end_date: utcToLocalInput((event as any).end_date || ''),
      scan_open_at: utcToLocalInput((event as any).scan_open_at || ''),
      scan_close_at: utcToLocalInput((event as any).scan_close_at || ''),
      is_active: event.is_active,
      poster_url: (event as any).poster_url || '',
      poster_thumb_url: (event as any).poster_thumb_url || '',
      floorplan_enabled: (event as any).floorplan_enabled || false,
      service_fee_enabled: (event as any).service_fee_enabled || false,
      service_fee_amount: (event as any).service_fee_amount || 0,
    });
    setPosterPreview((event as any).poster_url || null);
    setPosterFile(null);
    setShowEventForm(true);
  };

  const handleEditTicket = (ticket: TicketType) => {
    setEditingTicket(ticket.id);
    const existingTheme = (ticket as any).theme;
    // Detect which preset matches the existing theme by card_border color
    let detectedPreset = 'regular';
    if (existingTheme) {
      const matchedKey = Object.keys(TICKET_THEME_PRESETS).find(key => {
        const preset = TICKET_THEME_PRESETS[key];
        return preset.theme?.card_border === existingTheme.card_border
          && preset.theme?.badge_text === (existingTheme.badge_text || undefined);
      });
      detectedPreset = matchedKey || 'custom';
    }
    setTicketForm({
      event_id: ticket.event_id,
      name: ticket.name,
      description: ticket.description || '',
      price: ticket.price / 100,
      quantity_total: ticket.quantity_total,
      sale_start: utcToLocalInput(ticket.sale_start || ''),
      sale_end: utcToLocalInput(ticket.sale_end || ''),
      is_active: ticket.is_active || true,
      show_remaining_tickets: ticket.show_remaining_tickets || false,
      remaining_display_threshold: ticket.remaining_display_threshold,
      service_fee_mode: ticket.service_fee_mode || 'none',
      service_fee_fixed: Number(ticket.service_fee_fixed) || 0,
      service_fee_percent: Number(ticket.service_fee_percent) || 0,
      theme_preset: detectedPreset,
      theme: existingTheme || null,
      phase_group: ticket.phase_group || '',
      phase_order: ticket.phase_order || 0,
    });
    setShowTicketForm(true);
  };

  const handleEditRole = (role: UserRole) => {
    setEditingRole(role.id);
    setRoleForm({
      email: role.email || '',
      role: role.role,
      event_id: role.event_id || '',
      display_name: role.display_name || '',
    });
    setShowRoleForm(true);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit event wilt verwijderen?')) return;
    if (!confirm('LET OP: Dit event wordt gedeactiveerd. Tickets en orders blijven bewaard. Doorgaan?')) return;

    try {
      const { error } = await supabase
        .from('events')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      showToast('Event gedeactiveerd! Tickets en orders zijn bewaard gebleven.', 'success');
      loadData();
    } catch (error: any) {
      console.error('Error deactivating event:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  };

  const handleDeleteTicket = async (id: string) => {
    // Check if tickets exist for this type before deleting
    const { data: existingTickets } = await supabase
      .from('tickets')
      .select('id')
      .eq('ticket_type_id', id)
      .limit(1);

    if (existingTickets && existingTickets.length > 0) {
      showToast('Dit tickettype kan niet worden verwijderd omdat er al tickets voor verkocht zijn. Deactiveer het in plaats daarvan.', 'error');
      return;
    }

    if (!confirm('Weet je zeker dat je dit tickettype wilt verwijderen?')) return;

    try {
      const { error } = await supabase.from('ticket_types').delete().eq('id', id);
      if (error) throw error;
      showToast('Tickettype verwijderd!', 'success');
      loadData();
    } catch (error: any) {
      console.error('Error deleting ticket type:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  };

  const handleDeleteIndividualTicket = async () => {
    if (!deleteTicketModal || deleteTicketModal.step !== 3) return;
    if (deleteConfirmText.trim().toLowerCase() !== deleteTicketModal.eventName.trim().toLowerCase()) return;
    setDeleteLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const orderId = deleteTicketModal.orderId;
      const ticketId = deleteTicketModal.ticketId;

      const finalReason = deleteReason === 'other' ? deleteReasonDetail : deleteReason;

      const { data: seatTicketRows } = await supabase
        .from('ticket_seats')
        .select('seat_id')
        .eq('order_id', orderId);

      const seatIds = (seatTicketRows || []).map((r: any) => r.seat_id).filter(Boolean);
      if (seatIds.length > 0) {
        await supabase
          .from('seats')
          .update({ status: 'available', held_by: null, held_until: null })
          .in('id', seatIds);
        await supabase
          .from('ticket_seats')
          .delete()
          .eq('order_id', orderId);
      }

      await supabase
        .from('tickets')
        .update({ status: 'revoked' })
        .eq('id', ticketId);

      const { data: orderTickets } = await supabase
        .from('tickets')
        .select('ticket_type_id')
        .eq('order_id', orderId);

      if (orderTickets && orderTickets.length > 0) {
        const typeCountMap: Record<string, number> = {};
        for (const t of orderTickets) {
          if (t.ticket_type_id) {
            typeCountMap[t.ticket_type_id] = (typeCountMap[t.ticket_type_id] || 0) + 1;
          }
        }
        for (const [typeId, count] of Object.entries(typeCountMap)) {
          const { data: ttData } = await supabase
            .from('ticket_types')
            .select('quantity_sold')
            .eq('id', typeId)
            .maybeSingle();
          if (ttData) {
            await supabase
              .from('ticket_types')
              .update({ quantity_sold: Math.max(0, (ttData.quantity_sold || 0) - count) })
              .eq('id', typeId);
          }
        }
      }

      const { data: orderData } = await supabase
        .from('orders')
        .select('event_id, order_number, payer_name, payer_email, total_amount')
        .eq('id', orderId)
        .maybeSingle();

      await supabase
        .from('orders')
        .update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
          refund_reason: finalReason,
          refund_notes: deleteReason === 'other' ? deleteReasonDetail : null,
        })
        .eq('id', orderId);

      try {
        await supabase
          .from('ticket_deletions')
          .insert({
            order_id: orderId,
            event_id: orderData?.event_id,
            order_number: orderData?.order_number,
            payer_name: orderData?.payer_name,
            payer_email: orderData?.payer_email,
            total_amount: orderData?.total_amount || 0,
            ticket_count: 1,
            seat_count: seatIds.length,
            reason: finalReason,
            notes: deleteReason === 'other' ? deleteReasonDetail : '',
            deleted_by: user?.id || null,
          });
      } catch (logErr) {
        console.error('Audit log error (non-critical):', logErr);
      }

      showToast(`Ticket ${deleteTicketModal.ticketNumber} verwijderd. ${seatIds.length} stoel(en) vrijgegeven.`, 'success');
      setDeleteTicketModal(null);
      setDeleteConfirmText('');
      setDeleteReason('');
      setDeleteReasonDetail('');
      loadData();
    } catch (error: any) {
      console.error('Error deleting ticket:', error);
      showToast(`Fout bij verwijderen: ${error.message}`, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze rol wilt verwijderen?')) return;

    try {
      const { data, error } = await supabase.functions.invoke('delete-user-role', {
        body: { user_role_id: id },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to delete role');

      showToast('Rol verwijderd!', 'success');
      loadData();
    } catch (error: any) {
      console.error('Error deleting role:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  };

  const resetEventForm = () => {
    setEventForm({
      name: '',
      slug: '',
      description: '',
      venue_name: '',
      venue_address: '',
      location: '',
      location_address: '',
      start_date: '',
      end_date: '',
      scan_open_at: '',
      scan_close_at: '',
      is_active: true,
      poster_url: '',
      poster_thumb_url: '',
      floorplan_enabled: false,
      service_fee_enabled: false,
      service_fee_amount: 0,
    });
    setPosterFile(null);
    setPosterPreview(null);
  };

  const resetTicketForm = () => {
    setTicketForm({
      event_id: '',
      name: '',
      description: '',
      price: 0,
      quantity_total: 0,
      sale_start: '',
      sale_end: '',
      is_active: true,
      show_remaining_tickets: false,
      remaining_display_threshold: null,
      service_fee_mode: 'none',
      service_fee_fixed: 0,
      service_fee_percent: 0,
      theme_preset: 'regular',
      theme: null,
      phase_group: '',
      phase_order: 0,
    });
  };

  const resetBulkTicketForm = () => {
    setBulkTicketForm({
      event_id: '',
      ticket_type_id: '',
      quantity: 1,
    });
  };

  const resetRoleForm = () => {
    setRoleForm({
      email: '',
      role: 'scanner',
      event_id: '',
      display_name: '',
      password: '',
    });
    setShowRolePassword(false);
  };

  function generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(randomBytes[i] % chars.length);
    }
    return password + '!';
  }

  async function handleRolePasswordReset(e: React.FormEvent) {
    e.preventDefault();

    if (!resetPasswordForm.new_password || resetPasswordForm.new_password.length < 10) {
      showToast('Wachtwoord moet minimaal 10 tekens bevatten', 'error');
      return;
    }

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Niet ingelogd. Log opnieuw in.');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-user-password`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: resetPasswordForm.user_id,
            new_password: resetPasswordForm.new_password,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Wachtwoord reset mislukt');
      }

      showToast('Wachtwoord succesvol gereset!', 'success');
      setShowResetPasswordModal(false);
      setResetPasswordForm({ user_id: '', email: '', new_password: '' });
      setShowResetPassword(false);
    } catch (error: any) {
      console.error('Error resetting password:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  }


  const exportTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .limit(10000)
        .csv();

      if (error) throw error;

      const blob = new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tickets-${new Date().toISOString()}.csv`;
      a.click();
    } catch (error) {
      console.error('Export error:', error);
      showToast('Export mislukt', 'error');
    }
  };

  if (authLoading) {
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white">Verificatie...</p>
        </div>
      </div>
    );
  }

  if (!user || !role) {
    return <SharedLogin />;
  }

  if (!isSuperAdmin()) {
    const redirectPath = getRedirectPath();
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center max-w-md">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-2 text-white">Geen toegang</h1>
          <p className="text-slate-400 mb-6">Je hebt geen super admin rechten.</p>
          <div className="flex flex-col gap-3">
            {redirectPath !== 'login' && (
              <a
                href={`/#${redirectPath}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors text-white"
              >
                Ga naar je dashboard
              </a>
            )}
            <button
              onClick={logout}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors text-white"
            >
              <LogOut className="w-5 h-5" />
              Uitloggen
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sidebarNavItems: { tab: typeof activeTab; icon: React.ReactNode; label: string; show: boolean }[] = [
    { tab: 'dashboard', icon: <Shield className="w-5 h-5" />, label: 'Dashboard', show: role === 'super_admin' },
    { tab: 'events', icon: <Calendar className="w-5 h-5" />, label: 'Events', show: role === 'super_admin' },
    { tab: 'floorplan', icon: <MapPin className="w-5 h-5" />, label: 'Floorplan', show: role === 'super_admin' },
    { tab: 'tickets', icon: <Ticket className="w-5 h-5" />, label: 'Tickets', show: role === 'super_admin' },
    { tab: 'table_bookings', icon: <Grid className="w-5 h-5" />, label: 'Tables', show: role === 'super_admin' },
    { tab: 'orders', icon: <ShoppingCart className="w-5 h-5" />, label: 'Orders', show: role === 'super_admin' },
    { tab: 'promo_codes', icon: <Tag className="w-5 h-5" />, label: 'Promo Codes', show: role === 'super_admin' },
    { tab: 'packages', icon: <Package className="w-5 h-5" />, label: 'Voorraad', show: role === 'super_admin' },
    { tab: 'guest_tickets', icon: <Ticket className="w-5 h-5" />, label: 'Guest Tickets', show: true },
    { tab: 'table_guests', icon: <MapPin className="w-5 h-5" />, label: 'Tafel Gasten', show: true },
    { tab: 'guest_audit', icon: <Bug className="w-5 h-5" />, label: 'Guest Audit Log', show: role === 'super_admin' && isSuperAdmin() },
    { tab: 'gebruikers', icon: <Shield className="w-5 h-5" />, label: 'Scanners', show: role === 'super_admin' },
    { tab: 'ticketverkopen', icon: <DollarSign className="w-5 h-5" />, label: 'Staff', show: role === 'super_admin' },
    { tab: 'media', icon: <ImageIcon className="w-5 h-5" />, label: 'Media', show: role === 'super_admin' },
    { tab: 'analytics', icon: <BarChart3 className="w-5 h-5" />, label: 'Analytics', show: role === 'super_admin' },
    { tab: 'roles', icon: <Users className="w-5 h-5" />, label: 'Rollen', show: role === 'super_admin' && isSuperAdmin() },
    { tab: 'debug', icon: <Bug className="w-5 h-5" />, label: 'Logs / Activity', show: role === 'super_admin' },
  ];

  const renderNavItems = (onItemClick?: (tab: typeof activeTab) => void) => (
    <div className="space-y-1">
      {sidebarNavItems.filter(item => item.show).map(item => (
        <button
          key={item.tab}
          onClick={() => onItemClick ? onItemClick(item.tab) : setActiveTab(item.tab)}
          className={`sa-nav-item w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
            activeTab === item.tab
              ? 'sa-nav-item-active bg-red-500 text-white shadow-lg'
              : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
          }`}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={saTheme === 'light' ? 'sa-light' : 'sa-dark'}>
      {/* CROP MODAL */}
      {showCropper && cropImageSrc && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col">
          <div className="relative flex-1">
            <Cropper
              image={cropImageSrc}
              crop={crop}
              zoom={zoom}
              aspect={cropAspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="bg-slate-900 border-t border-slate-700 px-6 py-4">
            <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-4">
              <div className="flex items-center gap-2 text-white text-sm">
                <ZoomIn className="w-4 h-4 text-slate-400" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-32 accent-red-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">Oran:</span>
                <button onClick={() => setCropAspect(undefined)} className={`px-2.5 py-1 text-xs rounded ${!cropAspect ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}>Serbest</button>
                <button onClick={() => setCropAspect(16/3)} className={`px-2.5 py-1 text-xs rounded ${cropAspect === 16/3 ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}>Banner</button>
                <button onClick={() => setCropAspect(16/9)} className={`px-2.5 py-1 text-xs rounded ${cropAspect === 16/9 ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}>16:9</button>
                <button onClick={() => setCropAspect(4/3)} className={`px-2.5 py-1 text-xs rounded ${cropAspect === 4/3 ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}>4:3</button>
                <button onClick={() => setCropAspect(1)} className={`px-2.5 py-1 text-xs rounded ${cropAspect === 1 ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}>1:1</button>
              </div>
              <div className="flex gap-3 ml-auto">
                <button
                  onClick={() => { setShowCropper(false); setCropImageSrc(null); }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleCropConfirm}
                  className="px-5 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors"
                >
                  <Crop className="w-4 h-4" />
                  Kırp & Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE OVERLAY */}
      <div
        className={`sa-mobile-overlay ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* MOBILE SIDEBAR */}
      <aside className={`sa-mobile-sidebar bg-slate-800 border-r border-slate-700 flex flex-col ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sa-sidebar-header p-6 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-7 h-7 text-red-400" />
            <h1 className="sa-title text-xl font-bold text-white">
              {role === 'super_admin' ? (
                <>Super<span className="text-red-400">Admin</span></>
              ) : (
                <>Guest<span className="text-red-400">Panel</span></>
              )}
            </h1>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4">
          {renderNavItems(handleMobileNavClick)}
        </nav>
        <div className="sa-sidebar-footer p-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="sa-logout-btn w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors text-white"
          >
            <LogOut className="w-5 h-5" />
            <span>Uitloggen</span>
          </button>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <div className="sa-mobile-header hidden items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 sticky top-0 z-30">
        <button onClick={() => setMobileMenuOpen(true)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-300">
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-400" />
          <span className="sa-title font-bold text-white">
            {role === 'super_admin' ? 'SuperAdmin' : 'GuestPanel'}
          </span>
        </div>
        <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-slate-700 text-slate-300">
          {saTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

    <div className="sa-page min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex">
      {/* LEFT SIDEBAR (DESKTOP) */}
      <aside className="sa-sidebar sa-sidebar-desktop w-64 bg-slate-800/50 backdrop-blur border-r border-slate-700 flex-shrink-0 flex flex-col">
        {/* Sidebar Header */}
        <div className="sa-sidebar-header p-6 border-b border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-red-400" />
            <h1 className="sa-title text-2xl font-bold text-white">
              {role === 'super_admin' ? (
                <>Super<span className="text-red-400">Admin</span></>
              ) : (
                <>Guest<span className="text-red-400">Panel</span></>
              )}
            </h1>
          </div>
          <p className="sa-subtitle text-sm text-slate-400 truncate">{user?.email}</p>
          {role === 'admin' && (
            <p className="text-xs text-amber-400 mt-1">Beperkte toegang</p>
          )}
        </div>

        {/* Sidebar Menu */}
        <nav className="flex-1 overflow-y-auto p-4">
          {renderNavItems()}
        </nav>

        {/* Sidebar Footer */}
        <div className="sa-sidebar-footer p-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="sa-logout-btn w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors text-white"
          >
            <LogOut className="w-5 h-5" />
            <span>Uitloggen</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="sa-content flex-1 overflow-auto">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {/* Theme Toggle (Desktop) */}
          <div className="hidden lg:flex justify-end mb-4">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 text-slate-300 transition-colors text-sm"
            >
              {saTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{saTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
          {import.meta.env.DEV && (
            <div className="mb-4 p-3 bg-cyan-900/30 border border-cyan-500/50 rounded-lg">
              <div className="text-xs font-mono text-cyan-300">
                <strong>DEBUG MODE</strong> - Supabase: {new URL(import.meta.env.VITE_SUPABASE_URL).hostname} |
                Session: {user ? `✓ ${user.email}` : '✗ No session'}
              </div>
            </div>
          )}

        {activeTab === 'guest_tickets' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Guest <span className="text-red-400">Tickets</span>
                </h2>
                <p className="text-white">Verstuur guest tickets naar gasten</p>
              </div>
              <div className="flex items-center gap-3">
                {canManageRoles() && (
                  <button
                    onClick={exportGuestTicketsToCSV}
                    className="flex items-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold transition-colors text-white border border-slate-600"
                  >
                    <Download className="w-5 h-5" />
                    Export CSV
                  </button>
                )}
                <button
                  onClick={() => setShowGuestTicketForm(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-xl font-semibold transition-colors text-white shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  Verstuur Guest Ticket
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {guestTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-bold text-white">
                          {ticket.recipient_name}
                        </h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            ticket.status === 'valid'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : ticket.status === 'used'
                              ? 'bg-slate-500/20 text-white border border-slate-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {ticket.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <div className="text-sm text-white">Event</div>
                          <div className="font-semibold text-white">{ticket.events?.name || 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Email</div>
                          <div className="font-semibold text-white text-sm">{ticket.recipient_email}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Ticket Nummer</div>
                          <div className="font-semibold text-white text-sm">{ticket.ticket_number || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Ticket Type</div>
                          <div className="font-semibold text-white text-sm">{ticket.ticket_type_name || 'N/A'}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <div className="text-sm text-white">Verstuurd door</div>
                          <div className="font-semibold text-white text-sm">{ticket.sent_by_email}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Order Nummer</div>
                          <div className="font-semibold text-white text-sm">{ticket.order_number || 'N/A'}</div>
                        </div>
                      </div>

                      <div className="text-sm text-white">
                        <strong>Verstuurd op:</strong> {new Date(ticket.created_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })}
                      </div>

                      {ticket.notes && (
                        <div className="mt-3 p-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                          <div className="text-sm text-white">
                            <strong>Notities:</strong> {ticket.notes}
                          </div>
                        </div>
                      )}

                      {ticket.assigned_table && (
                        <div className="mt-3 p-3 bg-cyan-900/30 border border-cyan-700/50 rounded-lg">
                          <div className="text-sm text-white">
                            <strong>Toegewezen Tafel:</strong> {ticket.assigned_table.table_number} ({ticket.assigned_table.table_type === 'SEATED' ? 'Zittafel' : 'Sta-tafel'}, {ticket.assigned_table.capacity} pers.)
                          </div>
                          {ticket.table_note && (
                            <div className="text-sm text-cyan-300 mt-1">
                              <strong>Tafel Notitie:</strong> {ticket.table_note}
                            </div>
                          )}
                        </div>
                      )}

                      {ticket.ticket_id && (
                        <TicketActions
                          ticketId={ticket.ticket_id}
                          ticketNumber={ticket.ticket_number || 'N/A'}
                          holderName={ticket.recipient_name}
                          holderEmail={ticket.ticket_holder_email || ticket.recipient_email}
                          status={ticket.ticket_status}
                          scanStatus={ticket.ticket_scan_status}
                          onActionComplete={loadGuestTickets}
                          variant="buttons"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {guestTickets.length === 0 && (
                <div className="text-center py-12 bg-slate-800/50 rounded-2xl border-2 border-slate-700">
                  <Ticket className="w-16 h-16 mx-auto mb-4" style={{ color: 'rgba(255, 255, 255, 0.45)' }} />
                  <p className="text-white text-lg">Geen guest tickets gevonden</p>
                </div>
              )}
            </div>

            {showGuestTicketForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 border-slate-600">
                  <h3 className="text-2xl font-bold mb-6 text-white">Verstuur Guest Ticket</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Event</label>
                      <select
                        value={guestTicketForm.event_id}
                        onChange={(e) => {
                          setGuestTicketForm({ ...guestTicketForm, event_id: e.target.value, ticket_type_id: '', assigned_table_id: '' });
                          loadTicketTypesForEvent(e.target.value);
                          loadAvailableTablesForEvent(e.target.value);
                        }}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        required
                      >
                        <option value="">Selecteer event</option>
                        {events.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Ticket Type</label>
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
                            {type.name} - €{(type.price / 100).toFixed(2)}
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
                      <p className="mt-1 text-sm text-slate-400">
                        Alle QR codes worden in 1 email verstuurd
                      </p>
                    </div>

                    <GuestTicketSeatSelector
                      eventId={guestTicketForm.event_id}
                      ticketTypeId={guestTicketForm.ticket_type_id || undefined}
                      personsCount={guestTicketForm.persons_count}
                      assignments={guestSeatAssignments}
                      onChange={setGuestSeatAssignments}
                    />

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Naam</label>
                      <input
                        type="text"
                        value={guestTicketForm.recipient_name}
                        onChange={(e) => setGuestTicketForm({ ...guestTicketForm, recipient_name: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Email</label>
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
                        {loadingTables && <span className="ml-2 text-slate-400 text-xs">Laden...</span>}
                      </label>
                      <select
                        value={guestTicketForm.assigned_table_id}
                        onChange={(e) => setGuestTicketForm({ ...guestTicketForm, assigned_table_id: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        disabled={!guestTicketForm.event_id || loadingTables}
                      >
                        <option value="">Geen tafel toewijzen</option>
                        {availableTables.map((table) => {
                          const assignCount = tableAssignmentCounts[table.id] || 0;
                          return (
                            <option key={table.id} value={table.id}>
                              {table.table_number} ({table.table_type === 'SEATED' ? 'Zittafel' : 'Sta-tafel'}, {table.capacity} pers.)
                              {assignCount > 0 && ` - ${assignCount} al toegewezen`}
                            </option>
                          );
                        })}
                      </select>
                      {guestTicketForm.assigned_table_id && tableAssignmentCounts[guestTicketForm.assigned_table_id] > 0 && (
                        <p className="mt-2 text-amber-400 text-sm flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          Deze tafel is al toegewezen aan {tableAssignmentCounts[guestTicketForm.assigned_table_id]} andere guest ticket(s) voor dit event
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
                      <p className="mt-1 text-slate-400 text-xs">Deze notitie wordt getoond op het ticket</p>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={sendGuestTicket}
                      className="flex-1 bg-red-500 hover:bg-red-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                      Verstuur {guestTicketForm.persons_count > 1 ? `${guestTicketForm.persons_count} tickets` : ''}
                    </button>
                    <button
                      onClick={() => {
                        setShowGuestTicketForm(false);
                        setGuestTicketForm({ event_id: '', ticket_type_id: '', recipient_email: '', recipient_name: '', notes: '', assigned_table_id: '', table_note: '', persons_count: 1, send_mode: 'single_email' });
                        setGuestTicketTypes([]);
                        setAvailableTables([]);
                        setTableAssignmentCounts({});
                        setGuestSeatAssignments([]);
                      }}
                      className="flex-1 bg-slate-600 hover:bg-slate-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'table_guests' && (
          <div>
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Tafel <span className="text-red-400">Gasten</span>
                </h2>
                <p className="text-white">Wijs tafels toe aan gasten zonder ticket</p>
              </div>
              <button
                onClick={() => setShowTableGuestForm(true)}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-400 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg"
              >
                <Plus className="w-5 h-5" />
                Nieuwe Tafel Gast
              </button>
            </div>

            <div className="space-y-4">
              {tableGuests.map((guest) => (
                <div
                  key={guest.id}
                  className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-bold text-white">
                          {guest.guest_name}
                        </h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            guest.status === 'valid'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : guest.status === 'used'
                              ? 'bg-slate-500/20 text-white border border-slate-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {guest.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <div className="text-sm text-white">Event</div>
                          <div className="font-semibold text-white">{guest.events?.name || 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Email</div>
                          <div className="font-semibold text-white text-sm">{guest.guest_email}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Aantal Personen</div>
                          <div className="font-semibold text-white">{guest.number_of_persons}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Tafel</div>
                          <div className="font-semibold text-cyan-400">
                            {guest.table_bookings?.floorplan_tables?.table_number || 'N/A'}
                            {guest.table_bookings?.floorplan_tables && ` (${guest.table_bookings.floorplan_tables.table_type === 'SEATED' ? 'Zit' : 'Sta'}, ${guest.table_bookings.floorplan_tables.capacity} pers.)`}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <div className="text-sm text-white">Ticket Nummer</div>
                          <div className="font-semibold text-cyan-400 text-sm font-mono">
                            {guest.tickets?.ticket_number || guest.ticket_number || 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Order Nummer</div>
                          <div className="font-semibold text-white text-sm font-mono">
                            {guest.orders?.order_number || 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Ticket Type</div>
                          <div className="font-semibold text-white text-sm">Tafel Gast</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Aangemaakt door</div>
                          <div className="font-semibold text-white text-sm">{guest.created_by_email}</div>
                        </div>
                      </div>

                      <div className="text-sm text-white">
                        <strong>Aangemaakt op:</strong> {new Date(guest.created_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })}
                        {' | '}
                        <strong>Email verstuurd:</strong>{' '}
                        {guest.email_sent ? (
                          <span className="text-green-400">Ja</span>
                        ) : (
                          <span className="text-amber-400">Nee</span>
                        )}
                      </div>

                      {guest.table_note && (
                        <div className="mt-3 p-3 bg-cyan-900/30 border border-cyan-700/50 rounded-lg">
                          <div className="text-sm text-cyan-300">
                            <strong>Tafel Notitie:</strong> {guest.table_note}
                          </div>
                        </div>
                      )}

                      {!guest.email_sent && (
                        <div className="mt-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-amber-300">
                              <strong>Email niet verstuurd</strong>
                              {guest.email_error && (
                                <span className="block text-xs text-amber-400 mt-1">Fout: {guest.email_error}</span>
                              )}
                            </div>
                            <button
                              onClick={() => resendTableGuestEmail(guest.id)}
                              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg transition-colors"
                            >
                              Opnieuw versturen
                            </button>
                          </div>
                        </div>
                      )}

                      {(guest.ticket_id || guest.tickets?.id) ? (
                        <TicketActions
                          ticketId={guest.ticket_id || guest.tickets?.id}
                          ticketNumber={guest.tickets?.ticket_number || guest.ticket_number || 'N/A'}
                          holderName={guest.guest_name}
                          holderEmail={guest.tickets?.holder_email || guest.guest_email}
                          status={guest.tickets?.status || guest.status}
                          scanStatus={guest.tickets?.scan_status}
                          onActionComplete={loadTableGuests}
                          variant="buttons"
                        />
                      ) : (
                        <div className="mt-4 pt-4 border-t border-slate-600">
                          <p className="text-sm text-slate-400">
                            Geen ticket gekoppeld. Acties niet beschikbaar.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {tableGuests.length === 0 && (
                <div className="text-center py-12 bg-slate-800/50 rounded-2xl border-2 border-slate-700">
                  <MapPin className="w-16 h-16 mx-auto mb-4" style={{ color: 'rgba(255, 255, 255, 0.45)' }} />
                  <p className="text-white text-lg">Geen tafel gasten gevonden</p>
                </div>
              )}
            </div>

            {showTableGuestForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 border-slate-600">
                  <h3 className="text-2xl font-bold mb-6 text-white">Nieuwe Tafel Gast</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Event</label>
                      <select
                        value={tableGuestForm.event_id}
                        onChange={(e) => {
                          setTableGuestForm({ ...tableGuestForm, event_id: e.target.value, assigned_table_id: '' });
                          loadTableGuestTablesForEvent(e.target.value);
                        }}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        required
                      >
                        <option value="">Selecteer event</option>
                        {events.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">
                        Tafel
                        {loadingTableGuestTables && <span className="ml-2 text-slate-400 text-xs">Laden...</span>}
                      </label>
                      <select
                        value={tableGuestForm.assigned_table_id}
                        onChange={(e) => setTableGuestForm({ ...tableGuestForm, assigned_table_id: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        required
                        disabled={!tableGuestForm.event_id || loadingTableGuestTables}
                      >
                        <option value="">Selecteer tafel</option>
                        {tableGuestTables.map((table) => {
                          const assignCount = tableGuestAssignmentCounts[table.id] || 0;
                          return (
                            <option key={table.id} value={table.id}>
                              {table.table_number} ({table.table_type === 'SEATED' ? 'Zittafel' : 'Sta-tafel'}, {table.capacity} pers.)
                              {assignCount > 0 && ` - ${assignCount} al toegewezen`}
                            </option>
                          );
                        })}
                      </select>
                      {tableGuestForm.assigned_table_id && tableGuestAssignmentCounts[tableGuestForm.assigned_table_id] > 0 && (
                        <p className="mt-2 text-amber-400 text-sm flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          Deze tafel is al toegewezen aan {tableGuestAssignmentCounts[tableGuestForm.assigned_table_id]} andere gast(en) voor dit event
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Naam</label>
                      <input
                        type="text"
                        value={tableGuestForm.guest_name}
                        onChange={(e) => setTableGuestForm({ ...tableGuestForm, guest_name: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Email</label>
                      <input
                        type="email"
                        value={tableGuestForm.guest_email}
                        onChange={(e) => setTableGuestForm({ ...tableGuestForm, guest_email: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Aantal Personen</label>
                      <input
                        type="number"
                        min="1"
                        value={tableGuestForm.number_of_persons}
                        onChange={(e) => setTableGuestForm({ ...tableGuestForm, number_of_persons: parseInt(e.target.value) || 1 })}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Tafel Notitie (optioneel)</label>
                      <input
                        type="text"
                        value={tableGuestForm.table_note}
                        onChange={(e) => setTableGuestForm({ ...tableGuestForm, table_note: e.target.value })}
                        placeholder="Bijv: VIP, Tafel zonder drank, enkel frisdrank"
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-slate-400"
                      />
                      <p className="mt-1 text-slate-400 text-xs">Deze notitie wordt getoond op de bevestigingsmail</p>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={sendTableGuest}
                      className="flex-1 bg-red-500 hover:bg-red-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                      Verstuur
                    </button>
                    <button
                      onClick={() => {
                        setShowTableGuestForm(false);
                        setTableGuestForm({ event_id: '', assigned_table_id: '', guest_name: '', guest_email: '', number_of_persons: 1, table_note: '' });
                        setTableGuestTables([]);
                        setTableGuestAssignmentCounts({});
                      }}
                      className="flex-1 bg-slate-600 hover:bg-slate-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'guest_audit' && role === 'super_admin' && isSuperAdmin() && (
          <div>
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 text-white">
                Guest Ticket <span className="text-red-400">Audit Log</span>
              </h2>
              <p className="text-white">Volledige audit trail van alle guest ticket acties</p>
            </div>

            <div className="space-y-4">
              {guestAuditLog.map((log) => (
                <div
                  key={log.id}
                  className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-bold text-white">
                          {log.action.toUpperCase()}
                        </h3>
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                          {log.action}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <div className="text-sm text-white">Event</div>
                          <div className="font-semibold text-white">{log.events?.name || 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Ontvanger</div>
                          <div className="font-semibold text-white text-sm">{log.recipient_name}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Ontvanger Email</div>
                          <div className="font-semibold text-white text-sm">{log.recipient_email}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Verstuurd door</div>
                          <div className="font-semibold text-white text-sm">{log.sent_by_email}</div>
                        </div>
                      </div>

                      <div className="text-sm text-white">
                        <strong>Admin User ID:</strong> {log.sent_by_user_id}
                      </div>

                      <div className="text-sm text-white mt-1">
                        <strong>Timestamp:</strong> {new Date(log.created_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })}
                      </div>

                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="mt-3 p-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                          <div className="text-sm text-white">
                            <strong>Metadata:</strong>
                            <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {guestAuditLog.length === 0 && (
                <div className="text-center py-12 bg-slate-800/50 rounded-2xl border-2 border-slate-700">
                  <Bug className="w-16 h-16 mx-auto mb-4" style={{ color: 'rgba(255, 255, 255, 0.45)' }} />
                  <p className="text-white text-lg">Geen audit log entries gevonden</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'debug' && role === 'super_admin' && (
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8">
            <h2 className="text-3xl font-bold mb-6 text-white">
              Debug <span className="text-red-400">Panel</span>
            </h2>
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-2">Current Auth User ID:</p>
                <p className="text-white font-mono text-sm break-all">{user?.id || 'Not authenticated'}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-2">Current Auth Email:</p>
                <p className="text-white font-mono text-sm">{user?.email || 'Not authenticated'}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-2">Role from AuthContext:</p>
                <p className="text-white font-mono text-sm">{role || 'No role'}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-2">isSuperAdmin Check:</p>
                <p className="text-white font-mono text-sm">{isSuperAdmin().toString()}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-2">canManageRoles Check:</p>
                <p className="text-white font-mono text-sm">{canManageRoles().toString()}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && role === 'super_admin' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <Calendar className="w-8 h-8 text-red-400" />
                  <span className="text-xs text-white">TOTAAL</span>
                </div>
                <div className="text-3xl font-bold mb-1 text-white">{events.length}</div>
                <div className="text-sm text-white">Events</div>
              </div>

              <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <Ticket className="w-8 h-8 text-cyan-400" />
                  <span className="text-xs text-white">TYPES</span>
                </div>
                <div className="text-3xl font-bold mb-1 text-white">{ticketTypes.length}</div>
                <div className="text-sm text-white">Ticket Types</div>
              </div>

              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <Users className="w-8 h-8 text-purple-400" />
                  <span className="text-xs text-white">TOTAAL</span>
                </div>
                <div className="text-3xl font-bold mb-1 text-white">{userRoles.length}</div>
                <div className="text-sm text-white">Gebruikersrollen</div>
              </div>

              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <Shield className="w-8 h-8 text-green-400" />
                  <span className="text-xs text-white">ADMINS</span>
                </div>
                <div className="text-3xl font-bold mb-1 text-white">
                  {userRoles.filter(r => r.role === 'super_admin').length}
                </div>
                <div className="text-sm text-white">Super Admins</div>
              </div>
            </div>

            <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-4">Snelle Acties</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => {
                    setActiveTab('events');
                    setShowEventForm(true);
                  }}
                  className="flex items-center gap-3 p-4 bg-slate-900 hover:bg-slate-800 border-2 border-slate-600 rounded-lg transition-colors"
                >
                  <Plus className="w-6 h-6 text-red-400" />
                  <div className="text-left">
                    <div className="font-semibold text-white">Nieuw Event</div>
                    <div className="text-sm text-white">Maak een event aan</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('tickets');
                    setShowTicketForm(true);
                  }}
                  className="flex items-center gap-3 p-4 bg-slate-900 hover:bg-slate-800 border-2 border-slate-600 rounded-lg transition-colors"
                >
                  <Plus className="w-6 h-6 text-cyan-400" />
                  <div className="text-left">
                    <div className="font-semibold text-white">Nieuw Tickettype</div>
                    <div className="text-sm text-white">Maak een tickettype aan</div>
                  </div>
                </button>

                <button
                  onClick={exportTickets}
                  className="flex items-center gap-3 p-4 bg-slate-900 hover:bg-slate-800 border-2 border-slate-600 rounded-lg transition-colors"
                >
                  <Download className="w-6 h-6 text-green-400" />
                  <div className="text-left">
                    <div className="font-semibold text-white">Export Tickets</div>
                    <div className="text-sm text-white">Download alle tickets</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'events' && role === 'super_admin' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Event<span className="text-red-400">beheer</span>
                </h2>
                <p className="text-white">Beheer alle events in het systeem</p>
              </div>
              <button
                onClick={() => {
                  setShowEventForm(true);
                  setEditingEvent(null);
                  resetEventForm();
                }}
                className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors"
              >
                <Plus className="w-5 h-5" />
                Nieuw Event
              </button>
            </div>

            {showEventForm && (
              <div className="mb-8 bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
                <h3 className="text-2xl font-bold text-white mb-6">
                  {editingEvent ? 'Event Bewerken' : 'Nieuw Event'}
                </h3>
                <form onSubmit={handleEventSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Naam *</label>
                      <input
                        type="text"
                        required
                        value={eventForm.name}
                        onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Slug *</label>
                      <input
                        type="text"
                        required
                        value={eventForm.slug}
                        onChange={(e) => setEventForm({ ...eventForm, slug: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Beschrijving</label>
                    <textarea
                      value={eventForm.description}
                      onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Venue Naam *</label>
                      <input
                        type="text"
                        required
                        value={eventForm.venue_name}
                        onChange={(e) => setEventForm({ ...eventForm, venue_name: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Venue Adres *</label>
                    <input
                      type="text"
                      required
                      value={eventForm.venue_address}
                      onChange={(e) => setEventForm({ ...eventForm, venue_address: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Locatie *</label>
                      <input
                        type="text"
                        required
                        value={eventForm.location}
                        onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Locatie Adres *</label>
                      <input
                        type="text"
                        required
                        value={eventForm.location_address}
                        onChange={(e) => setEventForm({ ...eventForm, location_address: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Start Datum *</label>
                      <input
                        type="datetime-local"
                        required
                        value={eventForm.start_date}
                        onChange={(e) => setEventForm({ ...eventForm, start_date: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Eind Datum *</label>
                      <input
                        type="datetime-local"
                        required
                        value={eventForm.end_date}
                        onChange={(e) => setEventForm({ ...eventForm, end_date: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Event Start *</label>
                      <input
                        type="datetime-local"
                        required
                        value={eventForm.start_date}
                        onChange={(e) => setEventForm({ ...eventForm, start_date: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Event Einde *</label>
                      <input
                        type="datetime-local"
                        required
                        value={eventForm.end_date}
                        onChange={(e) => setEventForm({ ...eventForm, end_date: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Scan Open *</label>
                      <input
                        type="datetime-local"
                        required
                        value={eventForm.scan_open_at}
                        onChange={(e) => setEventForm({ ...eventForm, scan_open_at: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Scan Sluit *</label>
                      <input
                        type="datetime-local"
                        required
                        value={eventForm.scan_close_at}
                        onChange={(e) => setEventForm({ ...eventForm, scan_close_at: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                  </div>

                  {/* Event Poster Upload */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-white">
                      Event Poster (Afiche)
                    </label>

                    {!canUploadImages && (
                      <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 mb-3">
                        <p className="text-sm text-red-300 font-medium">
                          Geen rechten om afbeeldingen te uploaden
                        </p>
                        <p className="text-xs text-red-200/70 mt-1">
                          Alleen toegestane admin emails kunnen posters uploaden.
                        </p>
                      </div>
                    )}

                    {canUploadImages && (
                      <p className="text-xs mb-2" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
                        {editingEvent
                          ? 'Upload een nieuwe poster om de huidige te vervangen. JPG, PNG of WEBP, max 5MB'
                          : 'Upload een poster voor het event. JPG, PNG of WEBP, max 5MB'
                        }
                      </p>
                    )}

                    {(posterPreview || eventForm.poster_url) && (
                      <div className="relative group mb-4">
                        <img
                          src={posterPreview || eventForm.poster_url}
                          alt="Event poster"
                          className="w-full max-w-md rounded-lg border-2 border-slate-700"
                        />
                        {uploadingPoster && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                            <div className="text-white text-center">
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                              <p className="text-sm font-semibold">Poster uploaden...</p>
                            </div>
                          </div>
                        )}
                        {!uploadingPoster && (
                          <button
                            type="button"
                            onClick={() => {
                              setPosterFile(null);
                              setPosterPreview(null);
                              setEventForm({ ...eventForm, poster_url: '', poster_thumb_url: '' });
                            }}
                            className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}

                    {canUploadImages && (
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingPoster}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setPosterFile(file);
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setPosterPreview(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-red-500 file:text-white hover:file:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    )}
                  </div>

                  {/* Event Logos Upload */}
                  <div className="space-y-4 border-t border-slate-700 pt-6">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">
                        Event Logos (Organisatoren/Sponsors)
                      </label>
                      <p className="text-xs text-white mb-4">
                        Upload meerdere logos voor partners, sponsors of organisatoren. PNG, SVG of WEBP preferred, max 5MB per logo.
                      </p>
                    </div>

                    {/* Logo List */}
                    {eventLogos.length > 0 && (
                      <div className="space-y-3">
                        {eventLogos.map((logo, index) => (
                          <div key={index} className="flex items-center gap-4 p-4 bg-slate-900/50 border-2 border-slate-600 rounded-lg">
                            {(logo.preview || logo.url) && (
                              <img
                                src={logo.preview || logo.url}
                                alt={logo.label || 'Logo'}
                                className="w-20 h-20 object-contain bg-white rounded-lg p-2"
                              />
                            )}
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                value={logo.label}
                                onChange={(e) => {
                                  const newLogos = [...eventLogos];
                                  newLogos[index].label = e.target.value;
                                  setEventLogos(newLogos);
                                }}
                                placeholder="Label (bijv. Sponsor, Partner)"
                                className="w-full px-3 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50 text-sm"
                              />
                              <div className="flex items-center gap-2 text-xs text-white">
                                <span>Order:</span>
                                <input
                                  type="number"
                                  value={logo.display_order}
                                  onChange={(e) => {
                                    const newLogos = [...eventLogos];
                                    newLogos[index].display_order = parseInt(e.target.value) || 0;
                                    setEventLogos(newLogos);
                                  }}
                                  className="w-20 px-2 py-1 bg-slate-900 border-2 border-slate-600 rounded focus:outline-none focus:border-red-500 text-white"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEventLogos(eventLogos.filter((_, i) => i !== index));
                              }}
                              className="p-2 bg-red-500 hover:bg-red-400 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Logo Button */}
                    <div>
                      <input
                        type="file"
                        accept="image/png,image/svg+xml,image/webp,image/jpeg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setEventLogos([...eventLogos, {
                                file,
                                preview: reader.result as string,
                                label: '',
                                display_order: eventLogos.length,
                              }]);
                            };
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }
                        }}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-red-500 file:text-white hover:file:bg-red-400"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-600 pt-4 mt-4">
                    <h4 className="text-lg font-bold text-white mb-4">Event Instellingen</h4>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
                        <div>
                          <div className="font-medium text-white">Floorplan inschakelen</div>
                          <div className="text-sm text-slate-400">Toon een interactief zaalplan voor dit event</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={eventForm.floorplan_enabled}
                            onChange={(e) => setEventForm({ ...eventForm, floorplan_enabled: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-500/50 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
                        <div>
                          <div className="font-medium text-white">Servicekosten inschakelen</div>
                          <div className="text-sm text-slate-400">Voeg een vast servicebedrag per ticket toe</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={eventForm.service_fee_enabled}
                            onChange={(e) => setEventForm({ ...eventForm, service_fee_enabled: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-500/50 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                        </label>
                      </div>

                      {eventForm.service_fee_enabled && (
                        <div className="ml-4 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
                          <label className="block text-sm font-medium mb-2 text-white">Servicebedrag per ticket (EUR)</label>
                          <input
                            type="number"
                            min="0.01"
                            max="50"
                            step="0.01"
                            value={(eventForm.service_fee_amount / 100).toFixed(2)}
                            onChange={(e) => setEventForm({ ...eventForm, service_fee_amount: Math.round(parseFloat(e.target.value || '0') * 100) })}
                            className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white"
                            placeholder="bijv. 2.50"
                          />
                          <p className="text-xs text-slate-400 mt-1">Dit bedrag wordt per ticket aan de klant doorberekend</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={eventForm.is_active}
                      onChange={(e) => setEventForm({ ...eventForm, is_active: e.target.checked })}
                      className="w-5 h-5 rounded border-slate-600 text-red-500 focus:ring-red-500"
                    />
                    <label htmlFor="is_active" className="text-sm font-medium">
                      Actief
                    </label>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEventForm(false);
                        setEditingEvent(null);
                      }}
                      className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors"
                    >
                      Annuleren
                    </button>
                    <button
                      type="submit"
                      disabled={uploadingPoster}
                      className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploadingPoster ? 'Poster uploaden...' : (editingEvent ? 'Bijwerken' : 'Aanmaken')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid gap-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className={`bg-slate-800/80 backdrop-blur border-2 rounded-2xl p-6 ${event.is_active ? 'border-slate-600' : 'border-red-500/30 opacity-60'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-white">{event.name}</h3>
                        {event.is_active ? (
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        ) : (
                          <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-xs font-medium">Gedeactiveerd</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-white flex-wrap">
                        <span>{new Date(event.start_date).toLocaleDateString('nl-BE')}</span>
                        <span>{event.location}</span>
                        {(event as any).floorplan_enabled && (
                          <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded text-xs font-medium">Floorplan</span>
                        )}
                        {(event as any).service_fee_enabled && (
                          <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded text-xs font-medium">
                            Fee: {'\u20AC'}{((event as any).service_fee_amount / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditEvent(event)}
                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-5 h-5 text-white" />
                      </button>
                      {event.is_active && (
                        <button
                          onClick={() => handleDeleteEvent(event.id)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                          title="Event deactiveren"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'tickets' && role === 'super_admin' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Ticket<span className="text-red-400">beheer</span>
                </h2>
                <p className="text-white">Beheer tickettypes en genereer bulk tickets</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowBulkTicketForm(true);
                    resetBulkTicketForm();
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-lg font-semibold transition-colors"
                >
                  <Zap className="w-5 h-5" />
                  Bulk Tickets
                </button>
                <button
                  onClick={() => {
                    setShowTicketForm(true);
                    setEditingTicket(null);
                    resetTicketForm();
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Nieuw Type
                </button>
              </div>
            </div>

            {showBulkTicketForm && (
              <div className="mb-8 bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
                <h3 className="text-2xl font-bold text-white mb-6">Bulk Tickets Genereren</h3>
                <form onSubmit={handleBulkTicketSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Event *</label>
                    <select
                      required
                      value={bulkTicketForm.event_id}
                      onChange={(e) => setBulkTicketForm({ ...bulkTicketForm, event_id: e.target.value, ticket_type_id: '' })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                    >
                      <option value="">Selecteer event</option>
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Tickettype *</label>
                    <select
                      required
                      value={bulkTicketForm.ticket_type_id}
                      onChange={(e) => setBulkTicketForm({ ...bulkTicketForm, ticket_type_id: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                      disabled={!bulkTicketForm.event_id}
                    >
                      <option value="">Selecteer tickettype</option>
                      {ticketTypes
                        .filter(tt => tt.event_id === bulkTicketForm.event_id)
                        .map((ticket) => (
                          <option key={ticket.id} value={ticket.id}>
                            {ticket.name} - €{(ticket.price / 100).toFixed(2)}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Aantal *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="1000"
                      value={bulkTicketForm.quantity}
                      onChange={(e) => setBulkTicketForm({ ...bulkTicketForm, quantity: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowBulkTicketForm(false)}
                      className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors"
                    >
                      Annuleren
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-lg font-semibold transition-colors"
                    >
                      Genereren
                    </button>
                  </div>
                </form>
              </div>
            )}

            {showTicketForm && (
              <div className="mb-8 bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
                <h3 className="text-2xl font-bold text-white mb-6">
                  {editingTicket ? 'Tickettype Bewerken' : 'Nieuw Tickettype'}
                </h3>
                <form onSubmit={handleTicketSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Event *</label>
                    <select
                      required
                      value={ticketForm.event_id}
                      onChange={(e) => setTicketForm({ ...ticketForm, event_id: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                    >
                      <option value="">Selecteer event</option>
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Naam *</label>
                    <input
                      type="text"
                      required
                      value={ticketForm.name}
                      onChange={(e) => setTicketForm({ ...ticketForm, name: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      placeholder="bijv. Early Bird, VIP"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Beschrijving</label>
                    <textarea
                      value={ticketForm.description}
                      onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Prijs (€) *</label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={ticketForm.price}
                        onChange={(e) => setTicketForm({ ...ticketForm, price: parseFloat(e.target.value) })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Aantal *</label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={ticketForm.quantity_total}
                        onChange={(e) => setTicketForm({ ...ticketForm, quantity_total: parseInt(e.target.value) })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-600 pt-4 mt-4">
                    <label className="block text-sm font-semibold mb-2 text-white">Servicekosten type</label>
                    <select
                      value={ticketForm.service_fee_mode}
                      onChange={(e) => {
                        const mode = e.target.value as 'none' | 'fixed' | 'percent';
                        setTicketForm({
                          ...ticketForm,
                          service_fee_mode: mode,
                          service_fee_fixed: mode === 'fixed' ? (ticketForm.service_fee_fixed || 0.50) : 0,
                          service_fee_percent: mode === 'percent' ? (ticketForm.service_fee_percent || 5) : 0,
                        });
                      }}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white"
                    >
                      <option value="none">Geen servicekosten</option>
                      <option value="fixed">Vast bedrag per ticket</option>
                      <option value="percent">Percentage van ticketprijs</option>
                    </select>

                    {ticketForm.service_fee_mode === 'fixed' && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium mb-2 text-white">Vast bedrag per ticket (EUR)</label>
                        <input
                          type="number"
                          required
                          min="0.01"
                          max="9.99"
                          step="0.01"
                          value={ticketForm.service_fee_fixed}
                          onChange={(e) => setTicketForm({ ...ticketForm, service_fee_fixed: parseFloat(e.target.value) || 0 })}
                          className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white"
                          placeholder="bijv. 2.00"
                        />
                        <p className="text-xs text-slate-400 mt-1">Min. EUR 0,01 - Max. EUR 9,99</p>
                      </div>
                    )}

                    {ticketForm.service_fee_mode === 'percent' && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium mb-2 text-white">Percentage (%)</label>
                        <input
                          type="number"
                          required
                          min="0.1"
                          max="25"
                          step="0.1"
                          value={ticketForm.service_fee_percent}
                          onChange={(e) => setTicketForm({ ...ticketForm, service_fee_percent: parseFloat(e.target.value) || 0 })}
                          className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white"
                          placeholder="bijv. 5.0"
                        />
                        <p className="text-xs text-slate-400 mt-1">Min. 0,1% - Max. 25%</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Verkoop Start</label>
                      <input
                        type="datetime-local"
                        value={ticketForm.sale_start}
                        onChange={(e) => setTicketForm({ ...ticketForm, sale_start: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Verkoop Einde</label>
                      <input
                        type="datetime-local"
                        value={ticketForm.sale_end}
                        onChange={(e) => setTicketForm({ ...ticketForm, sale_end: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Phase Group</label>
                      <select
                        value={ticketForm.phase_group || ''}
                        onChange={(e) => setTicketForm({ ...ticketForm, phase_group: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white"
                      >
                        <option value="">Yok (Gruba dahil etme)</option>
                        <option value="normal">Normal Biletler</option>
                        <option value="golden">Golden Circle Biletler</option>
                      </select>
                      <p className="text-xs text-slate-400 mt-1">Aynı gruptakiler sırayla açılır</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Phase Order</label>
                      <input
                        type="number"
                        min="0"
                        value={ticketForm.phase_order}
                        onChange={(e) => setTicketForm({ ...ticketForm, phase_order: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                        placeholder="bijv. 1"
                      />
                      <p className="text-xs text-slate-400 mt-1">Satış sırası (0 = her zaman açık)</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-600 pt-4 mt-4">
                    <div className="flex items-center gap-3 mb-4">
                      <input
                        type="checkbox"
                        id="show_remaining_tickets"
                        checked={ticketForm.show_remaining_tickets}
                        onChange={(e) => setTicketForm({ ...ticketForm, show_remaining_tickets: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-600 text-red-500 focus:ring-red-500"
                      />
                      <label htmlFor="show_remaining_tickets" className="text-sm font-medium text-white">
                        Toon resterende tickets
                      </label>
                    </div>

                    {ticketForm.show_remaining_tickets && (
                      <div className="ml-8">
                        <label className="block text-sm font-medium mb-2 text-white">
                          Toon pas wanneer resterend ≤
                          <span className="text-slate-400 ml-2">(leeg = altijd tonen)</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={ticketForm.remaining_display_threshold ?? ''}
                          onChange={(e) => setTicketForm({ ...ticketForm, remaining_display_threshold: e.target.value === '' ? null : parseInt(e.target.value) })}
                          className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                          placeholder="bijv. 50"
                        />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-600 pt-4 mt-4">
                    <label className="block text-sm font-semibold mb-2 text-white">Ticket Tema</label>
                    <p className="text-xs text-slate-400 mb-3">Seçilen tema ticket kartının rengini belirler.</p>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(TICKET_THEME_PRESETS).map(([key, preset]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTicketForm({
                            ...ticketForm,
                            theme_preset: key,
                            theme: preset.theme,
                          })}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all ${ticketForm.theme_preset === key ? 'border-white ring-2 ring-white/30 scale-[1.03]' : 'border-slate-600 hover:border-slate-400'}`}
                        >
                          <div className="h-8" style={{ background: preset.theme.header_bg }} />
                          <div className="px-2 py-1.5 bg-slate-800 text-center">
                            <span className="text-[11px] font-semibold text-white">{preset.label}</span>
                          </div>
                          {ticketForm.theme_preset === key && (
                            <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                              <span className="text-[10px]">✓</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    {/* Seçili tema önizleme */}
                    {ticketForm.theme_preset && TICKET_THEME_PRESETS[ticketForm.theme_preset] && (
                      <div className="mt-3 rounded-lg overflow-hidden border border-slate-600">
                        <div className="h-8 flex items-center justify-center" style={{ background: TICKET_THEME_PRESETS[ticketForm.theme_preset].theme.header_bg }}>
                          {TICKET_THEME_PRESETS[ticketForm.theme_preset].theme.badge_text && (
                            <span className="text-[10px] font-bold text-white drop-shadow">{TICKET_THEME_PRESETS[ticketForm.theme_preset].theme.badge_text}</span>
                          )}
                        </div>
                        <div className="px-3 py-2 bg-slate-800/50 flex items-center justify-between">
                          <span className="text-xs text-slate-300">Seçili: <strong>{TICKET_THEME_PRESETS[ticketForm.theme_preset].label}</strong></span>
                          <span className="text-[10px] font-mono text-slate-500">{TICKET_THEME_PRESETS[ticketForm.theme_preset].theme.card_border}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="ticket_active"
                      checked={ticketForm.is_active}
                      onChange={(e) => setTicketForm({ ...ticketForm, is_active: e.target.checked })}
                      className="w-5 h-5 rounded border-slate-600 text-red-500 focus:ring-red-500"
                    />
                    <label htmlFor="ticket_active" className="text-sm font-medium">
                      Actief (beschikbaar voor verkoop)
                    </label>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTicketForm(false);
                        setEditingTicket(null);
                      }}
                      className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors"
                    >
                      Annuleren
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors"
                    >
                      {editingTicket ? 'Bijwerken' : 'Aanmaken'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid gap-4">
              {ticketTypes.map((ticket) => (
                <div
                  key={ticket.id}
                  className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-white">{ticket.name}</h3>
                        {(ticket as any).theme?.badge_text && (
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{
                              background: (ticket as any).theme.badge_bg || '#D4AF37',
                              color: (ticket as any).theme.badge_text_color || '#1a1a1a',
                            }}
                          >
                            {(ticket as any).theme.badge_text}
                          </span>
                        )}
                        {ticket.is_active ? (
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-400" />
                        )}
                      </div>
                      {ticket.description && (
                        <p className="text-white mb-2">{ticket.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-white">
                        <span>{(ticket as any).events?.name}</span>
                        <span className="text-cyan-400 font-semibold">
                          €{(ticket.price / 100).toFixed(2)}
                        </span>
                        <span>
                          {paidCountByType[ticket.id] || 0} / {ticket.quantity_total} verkocht
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditTicket(ticket)}
                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-5 h-5 text-white" />
                      </button>
                      <button
                        onClick={() => handleDeleteTicket(ticket.id)}
                        className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'orders' && role === 'super_admin' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Order<span className="text-red-400">beheer</span>
                </h2>
                <p className="text-white">Beheer alle orders en verstuur ticket emails opnieuw</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={exportOrdersToPDF}
                  disabled={pdfExporting}
                  className="flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-60 rounded-xl font-semibold transition-colors text-white shadow-lg"
                >
                  {pdfExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                  {pdfExporting ? 'PDF genereren...' : 'Export PDF'}
                </button>
                <button
                  onClick={exportOrdersToCSV}
                  className="flex items-center gap-2 px-5 py-3 bg-green-500 hover:bg-green-400 rounded-xl font-semibold transition-colors text-white shadow-lg"
                >
                  <Download className="w-5 h-5" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mb-6 space-y-3">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  ref={ordersSearchRef}
                  type="text"
                  value={ordersSearch}
                  onChange={e => setOrdersSearch(e.target.value)}
                  placeholder="Zoek op bestelnummer, naam, e-mail of event..."
                  className="w-full pl-12 pr-10 py-3.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/30 text-sm"
                />
                {ordersSearch && (
                  <button
                    onClick={() => { setOrdersSearch(''); ordersSearchRef.current?.focus(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <select
                  value={ordersStatusFilter}
                  onChange={e => setOrdersStatusFilter(e.target.value)}
                  className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:border-red-500 focus:outline-none appearance-none min-w-[160px]"
                >
                  <option value="">Alle statussen</option>
                  <option value="paid">Betaald</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Mislukt</option>
                  <option value="cancelled">Geannuleerd</option>
                  <option value="refunded">Teruggestort</option>
                  <option value="comped">Comped</option>
                </select>
                <select
                  value={ordersEventFilter}
                  onChange={e => setOrdersEventFilter(e.target.value)}
                  className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:border-red-500 focus:outline-none appearance-none min-w-[200px]"
                >
                  <option value="">Alle events</option>
                  {events.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                {(ordersStatusFilter || ordersEventFilter || ordersSearch) && (
                  <button
                    onClick={() => { setOrdersSearch(''); setOrdersStatusFilter(''); setOrdersEventFilter(''); }}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-red-400 hover:text-red-300 border border-red-500/30 rounded-xl text-sm transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Filters wissen
                  </button>
                )}
                <div className="ml-auto text-sm text-slate-400 self-center">
                  {filteredOrders.length} van {orders.length} orders
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-bold text-white">
                          Order #{order.order_number}
                        </h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            order.status === 'paid'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : order.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                              : order.status === 'failed'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-slate-500/20 text-white border border-slate-500/30'
                          }`}
                        >
                          {order.status.toUpperCase()}
                        </span>
                        {order.email_sent && (
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Email Verstuurd
                          </span>
                        )}
                        {order.email_error && (
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            Email Error
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <div className="text-sm text-white">Event</div>
                          <div className="font-semibold text-white">{order.events?.name || 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Klant</div>
                          <div className="font-semibold text-white">{order.payer_name}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Email</div>
                          <div className="font-semibold text-white text-sm">{order.payer_email}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Bedrag</div>
                          <div className="font-semibold text-white">€{(order.total_amount / 100).toFixed(2)}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-white">Besteld op</div>
                          <div className="text-white">{new Date(order.created_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })}</div>
                        </div>
                        {order.paid_at && (
                          <div>
                            <div className="text-white">Betaald op</div>
                            <div className="text-white">{new Date(order.paid_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })}</div>
                          </div>
                        )}
                        {order.email_sent_at && (
                          <div>
                            <div className="text-white">Email verstuurd op</div>
                            <div className="text-white">{new Date(order.email_sent_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })}</div>
                          </div>
                        )}
                      </div>

                      {order.email_error && (
                        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                          <div className="text-sm text-red-400">
                            <strong>Email Error:</strong> {order.email_error}
                          </div>
                        </div>
                      )}

                      {order.ticket_items && order.ticket_items.length > 0 ? (
                        <div className="mt-4 pt-4 border-t border-slate-600">
                          <div className="text-sm font-semibold text-white mb-2">Gekocht</div>
                          <div className="space-y-1">
                            {order.ticket_items.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-sm bg-slate-700/50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-white">{item.typeName}</span>
                                  <span className="text-slate-400">x{item.quantity}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-slate-400">@{'\u20AC'}{(item.typePrice / 100).toFixed(2)}</span>
                                  <span className="text-white font-medium">{'\u20AC'}{((item.typePrice * item.quantity) / 100).toFixed(2)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : order.status === 'comped' ? (
                        <div className="mt-4 pt-4 border-t border-slate-600">
                          <div className="text-sm font-semibold text-white mb-2">Gekocht</div>
                          <div className="text-sm text-slate-400 bg-slate-700/50 rounded-lg px-3 py-2">
                            Guest Ticket x1
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 pt-4 border-t border-slate-600">
                          <div className="text-sm font-semibold text-white mb-2">Gekocht</div>
                          <div className="text-sm text-slate-400">Geen ticket items gevonden</div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 ml-4">
                      {order.status === 'paid' && (
                        <button
                          onClick={() => resendTicketEmail(order.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg font-semibold transition-colors text-white"
                          title="Verstuur ticket email opnieuw"
                        >
                          <Mail className="w-4 h-4" />
                          Resend Email
                        </button>
                      )}
                      {order.individual_tickets && order.individual_tickets.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {order.individual_tickets.map((ticket: any) => (
                            <div key={ticket.id} className="flex items-center gap-1">
                              <button
                                onClick={() => downloadSingleTicketPdf(ticket, order)}
                                disabled={ticketPdfLoading === ticket.id}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 transition-colors disabled:opacity-50"
                                title={`Download PDF ${ticket.ticket_number}`}
                              >
                                {ticketPdfLoading === ticket.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                                {ticket.ticket_number}
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteTicketModal({
                                    step: 1,
                                    ticketId: ticket.id,
                                    ticketNumber: ticket.ticket_number,
                                    orderId: order.id,
                                    eventName: order.events?.name || '',
                                    payerName: order.payer_name || '',
                                    payerEmail: order.payer_email || '',
                                    totalAmount: order.total_amount || 0,
                                  });
                                  setDeleteConfirmText('');
                                  setDeleteReason('');
                                  setDeleteReasonDetail('');
                                }}
                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 transition-colors"
                                title={`Verwijder ticket ${ticket.ticket_number}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredOrders.length === 0 && (
                <div className="text-center py-12 bg-slate-800/50 rounded-2xl border-2 border-slate-700">
                  <ShoppingCart className="w-16 h-16 mx-auto mb-4" style={{ color: 'rgba(255, 255, 255, 0.45)' }} />
                  <p className="text-white text-lg">
                    {debouncedOrdersSearch || ordersStatusFilter || ordersEventFilter
                      ? 'Geen bestellingen gevonden'
                      : 'Geen orders gevonden'}
                  </p>
                  {(debouncedOrdersSearch || ordersStatusFilter || ordersEventFilter) && (
                    <button
                      onClick={() => { setOrdersSearch(''); setOrdersStatusFilter(''); setOrdersEventFilter(''); }}
                      className="mt-3 text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      Filters wissen
                    </button>
                  )}
                </div>
              )}
            </div>

            {deleteTicketModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="bg-slate-800 border-2 border-red-500/40 rounded-2xl overflow-hidden max-w-md w-full mx-4 shadow-2xl">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-red-500/10">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-sm">Ticket Verwijderen</h3>
                        <p className="text-red-400/70 text-xs">Stap {deleteTicketModal.step} van 3</p>
                      </div>
                    </div>
                    <button onClick={() => setDeleteTicketModal(null)} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="w-full h-1 bg-slate-700">
                    <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${(deleteTicketModal.step / 3) * 100}%` }} />
                  </div>

                  <div className="p-6">
                    {deleteTicketModal.step === 1 && (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-red-400 text-sm font-medium">Let op: deze actie is onomkeerbaar</p>
                            <p className="text-red-400/70 text-xs mt-1">Stoelen worden vrijgegeven en analytics bijgewerkt.</p>
                          </div>
                        </div>
                        <div className="bg-slate-900/60 rounded-xl p-4 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Ticket</span>
                            <span className="font-mono text-cyan-400">{deleteTicketModal.ticketNumber}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Klant</span>
                            <span className="text-white">{deleteTicketModal.payerName}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Email</span>
                            <span className="text-slate-300 truncate ml-4">{deleteTicketModal.payerEmail}</span>
                          </div>
                          <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
                            <span className="text-slate-400">Event</span>
                            <span className="text-white font-medium">{deleteTicketModal.eventName}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setDeleteTicketModal({ ...deleteTicketModal, step: 2 })}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl transition-colors text-sm"
                        >
                          Doorgaan
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {deleteTicketModal.step === 2 && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">Reden voor verwijdering</label>
                          <select
                            value={deleteReason}
                            onChange={e => { setDeleteReason(e.target.value); setDeleteReasonDetail(''); }}
                            className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none appearance-none"
                          >
                            <option value="">Selecteer een reden...</option>
                            <option value="Klant heeft per ongeluk dubbel gekocht">Klant heeft per ongeluk dubbel gekocht</option>
                            <option value="Terugbetaling wegens geldige reden">Terugbetaling wegens geldige reden</option>
                            <option value="Frauduleuze bestelling">Frauduleuze bestelling</option>
                            <option value="Event geannuleerd">Event geannuleerd</option>
                            <option value="other">Andere reden</option>
                          </select>
                        </div>
                        {deleteReason === 'other' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Toelichting</label>
                            <textarea
                              value={deleteReasonDetail}
                              onChange={e => setDeleteReasonDetail(e.target.value)}
                              placeholder="Beschrijf de reden..."
                              rows={3}
                              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:border-red-500 focus:outline-none resize-none"
                            />
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeleteTicketModal({ ...deleteTicketModal, step: 1 })}
                            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
                          >
                            Terug
                          </button>
                          <button
                            onClick={() => { setDeleteConfirmText(''); setDeleteTicketModal({ ...deleteTicketModal, step: 3 }); }}
                            disabled={!deleteReason || (deleteReason === 'other' && !deleteReasonDetail.trim())}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors text-sm"
                          >
                            Doorgaan
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {deleteTicketModal.step === 3 && (
                      <div className="space-y-4">
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                          <p className="text-red-400 text-sm">Typ de naam van het event om te bevestigen:</p>
                          <p className="text-white font-bold text-base mt-1">{deleteTicketModal.eventName}</p>
                        </div>
                        <input
                          type="text"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="Typ de eventnaam..."
                          autoFocus
                          className={`w-full px-3 py-2.5 bg-slate-700 border rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none ${
                            deleteConfirmText.length > 0
                              ? deleteConfirmText.trim().toLowerCase() === deleteTicketModal.eventName.trim().toLowerCase()
                                ? 'border-green-500 focus:border-green-500'
                                : 'border-red-500 focus:border-red-500'
                              : 'border-slate-600 focus:border-red-500'
                          }`}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeleteTicketModal({ ...deleteTicketModal, step: 2 })}
                            disabled={deleteLoading}
                            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                          >
                            Terug
                          </button>
                          <button
                            onClick={handleDeleteIndividualTicket}
                            disabled={deleteLoading || deleteConfirmText.trim().toLowerCase() !== deleteTicketModal.eventName.trim().toLowerCase()}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors text-sm"
                          >
                            {deleteLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Verwijderen...
                              </>
                            ) : (
                              <>
                                <Trash2 className="w-4 h-4" />
                                Definitief Verwijderen
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'roles' && role === 'super_admin' && isSuperAdmin() && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Rollen<span className="text-red-400">beheer</span>
                </h2>
                <p className="text-white">Beheer gebruikersrollen en toegang voor StageNation</p>
              </div>
              <button
                onClick={() => {
                  setShowRoleForm(true);
                  setEditingRole(null);
                  resetRoleForm();
                }}
                className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors"
              >
                <Plus className="w-5 h-5" />
                Nieuwe Rol
              </button>
            </div>

            <div className="mb-8 bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-cyan-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-bold text-cyan-400 mb-2">Centrale Toegangsbeheer</h3>
                  <p className="text-sm text-white mb-3">
                    Deze rollen worden gebruikt om toegang te bepalen tot events en functionaliteit.
                  </p>
                  <ul className="text-sm text-white space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">•</span>
                      <span><strong>Super Admin:</strong> Volledige toegang tot alle events en beheer</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">•</span>
                      <span><strong>Admin:</strong> Toegang tot beheer per event</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">•</span>
                      <span><strong>Scanner:</strong> Toegang tot EventGate app voor ticket scanning per event</span>
                    </li>
                  </ul>
                  <p className="text-sm text-white mt-3">
                    Nieuwe gebruikers krijgen automatisch een account met een veilig gegenereerd tijdelijk wachtwoord.
                  </p>
                </div>
              </div>
            </div>

            {showRoleForm && (
              <div className="mb-8 bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
                <h3 className="text-2xl font-bold text-white mb-6">
                  {editingRole ? 'Rol Bewerken' : 'Nieuwe Rol'}
                </h3>
                <form onSubmit={handleRoleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">E-mailadres van gebruiker *</label>
                    <input
                      type="email"
                      required
                      disabled={!!editingRole}
                      value={roleForm.email}
                      onChange={(e) => setRoleForm({ ...roleForm, email: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50 disabled:opacity-50"
                      placeholder="gebruiker@voorbeeld.com"
                    />
                    {!editingRole && (
                      <p className="text-sm text-white mt-1">
                        Als deze gebruiker nog niet bestaat, wordt automatisch een account aangemaakt.
                      </p>
                    )}
                  </div>

                  {!editingRole && (
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-white">Wachtwoord (optioneel)</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showRolePassword ? 'text' : 'password'}
                            value={roleForm.password}
                            onChange={(e) => setRoleForm({ ...roleForm, password: e.target.value })}
                            className="w-full px-4 py-2 pr-10 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                            placeholder="Laat leeg voor automatisch wachtwoord"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRolePassword(!showRolePassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                          >
                            {showRolePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const pw = generatePassword();
                            setRoleForm({ ...roleForm, password: pw });
                            setShowRolePassword(true);
                          }}
                          className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg transition-colors flex items-center gap-1"
                          title="Genereer wachtwoord"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Genereer
                        </button>
                      </div>
                      <p className="text-sm text-white/50 mt-1">
                        Leeg laten = automatisch veilig wachtwoord. Eigen wachtwoord: minimaal 12 tekens, hoofdletters, kleine letters, cijfers en speciale tekens.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Naam (optioneel)</label>
                    <input
                      type="text"
                      value={roleForm.display_name}
                      onChange={(e) => setRoleForm({ ...roleForm, display_name: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      placeholder="Bijv. Mehmet, Ali, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Rol *</label>
                    <select
                      required
                      value={roleForm.role}
                      onChange={(e) => setRoleForm({ ...roleForm, role: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                    >
                      <option value="scanner">Scanner</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Event (optioneel)</label>
                    <select
                      value={roleForm.event_id}
                      onChange={(e) => setRoleForm({ ...roleForm, event_id: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                    >
                      <option value="">Alle events</option>
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRoleForm(false);
                        setEditingRole(null);
                      }}
                      className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors"
                    >
                      Annuleren
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors"
                    >
                      {editingRole ? 'Bijwerken' : 'Aanmaken'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {showResetPasswordModal && (
              <div className="mb-8 bg-slate-800/80 backdrop-blur border-2 border-cyan-500/30 rounded-2xl p-6">
                <h3 className="text-2xl font-bold text-white mb-2">
                  Wachtwoord Resetten
                </h3>
                <p className="text-sm text-cyan-400 mb-6 font-mono">{resetPasswordForm.email}</p>
                <form onSubmit={handleRolePasswordReset} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Nieuw Wachtwoord *</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showResetPassword ? 'text' : 'password'}
                          required
                          minLength={10}
                          value={resetPasswordForm.new_password}
                          onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, new_password: e.target.value })}
                          className="w-full px-4 py-2 pr-10 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 text-white placeholder:text-white/50"
                          placeholder="Minimaal 10 tekens"
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetPassword(!showResetPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                        >
                          {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const pw = generatePassword();
                          setResetPasswordForm({ ...resetPasswordForm, new_password: pw });
                          setShowResetPassword(true);
                        }}
                        className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg transition-colors flex items-center gap-1"
                        title="Genereer wachtwoord"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Genereer
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResetPasswordModal(false);
                        setResetPasswordForm({ user_id: '', email: '', new_password: '' });
                        setShowResetPassword(false);
                      }}
                      className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors"
                    >
                      Annuleren
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-lg font-semibold transition-colors text-white"
                    >
                      Wachtwoord Resetten
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid gap-4">
              {userRoles.map((role) => (
                <div
                  key={role.id}
                  className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        {role.display_name ? (
                          <h3 className="text-lg font-bold text-white">{role.display_name}</h3>
                        ) : (
                          <h3 className="text-lg font-bold text-slate-400 italic">Geen naam</h3>
                        )}
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            role.role === 'super_admin'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : role.role === 'admin'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          }`}
                        >
                          {role.role}
                        </span>
                      </div>
                      <p className="text-sm font-mono text-cyan-400 mb-2 truncate">
                        {role.email || `${role.user_id.slice(0, 8)}...`}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-white">
                        <span>
                          Event:{' '}
                          {role.event_id
                            ? events.find((e) => e.id === role.event_id)?.name || 'Onbekend'
                            : 'Alle'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          setResetPasswordForm({
                            user_id: role.user_id,
                            email: role.email || role.user_id.slice(0, 8) + '...',
                            new_password: '',
                          });
                          setShowResetPassword(false);
                          setShowResetPasswordModal(true);
                        }}
                        className="p-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg transition-colors"
                        title="Wachtwoord resetten"
                      >
                        <Key className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleEditRole(role)}
                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-5 h-5 text-white" />
                      </button>
                      <button
                        onClick={() => handleDeleteRole(role.id)}
                        className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'roles' && (role !== 'super_admin' || !isSuperAdmin()) && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-red-400" />
              <h2 className="text-2xl font-bold text-white mb-2">Geen Toegang</h2>
              <p className="text-slate-400">Je hebt geen toegang tot Rollenbeheer.</p>
            </div>
          </div>
        )}

        {activeTab === 'gebruikers' && role === 'super_admin' && (
          <div>
            <ScannerUsersManager currentUserRole={role} />
          </div>
        )}


        {activeTab === 'media' && role === 'super_admin' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Media<span className="text-red-400">beheer</span>
                </h2>
                <p className="text-white">Beheer gallerij afbeeldingen</p>
              </div>
              <button
                onClick={() => {
                  setShowMediaForm(true);
                  setEditingMedia(null);
                  setMediaForm({ title: '', category: '', display_order: galleryImages.length, is_active: true, show_in_gallery: true });
                  setMediaFile(null);
                  setMediaPreview(null);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg font-semibold transition-colors"
              >
                <Plus className="w-5 h-5" />
                Nieuwe Afbeelding
              </button>
            </div>

            {showMediaForm && (
              <div className="bg-slate-800/80 backdrop-blur border-2 border-red-500/50 rounded-2xl p-6 mb-8">
                <h3 className="text-xl font-bold text-white mb-4">
                  {editingMedia ? 'Afbeelding Bewerken' : 'Nieuwe Afbeelding'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Titel (optioneel)</label>
                    <input
                      type="text"
                      value={mediaForm.title}
                      onChange={(e) => setMediaForm({ ...mediaForm, title: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Bijv. Ana Sahne"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Categorie *</label>
                    <select
                      value={mediaForm.category}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setMediaForm({ ...mediaForm, category: cat, show_in_gallery: cat !== 'hero' });
                      }}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    >
                      <option value="">-- Selecteer categorie --</option>
                      <option value="hero">Hero (Ana sayfa banner)</option>
                      <option value="events">Events</option>
                      <option value="venue">Venue</option>
                      <option value="backstage">Backstage</option>
                      <option value="artists">Artists</option>
                      <option value="aftermovie">Aftermovie</option>
                      <option value="footer">Footer (Alt banner)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Volgorde</label>
                    <input
                      type="number"
                      value={mediaForm.display_order}
                      onChange={(e) => setMediaForm({ ...mediaForm, display_order: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="block text-sm font-medium text-slate-300">Actief</label>
                    <input
                      type="checkbox"
                      checked={mediaForm.is_active}
                      onChange={(e) => setMediaForm({ ...mediaForm, is_active: e.target.checked })}
                      className="w-5 h-5 rounded"
                    />
                  </div>
                  {mediaForm.category === 'hero' && (
                    <div className="flex items-center gap-3">
                      <label className="block text-sm font-medium text-slate-300">Galerij'de ook tonen</label>
                      <input
                        type="checkbox"
                        checked={mediaForm.show_in_gallery}
                        onChange={(e) => setMediaForm({ ...mediaForm, show_in_gallery: e.target.checked })}
                        className="w-5 h-5 rounded"
                      />
                      <span className="text-xs text-amber-400/70">Hero görseli aynı zamanda galeride de gösterilsin mi?</span>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1">Afbeelding *</label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = URL.createObjectURL(file);
                          setCropImageSrc(url);
                          setCropAspect(getCropAspectForCategory(mediaForm.category));
                          setCrop({ x: 0, y: 0 });
                          setZoom(1);
                          setShowCropper(true);
                        }
                      }}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-red-500 file:text-white file:font-semibold file:cursor-pointer"
                    />
                    {(mediaPreview) && (
                      <div className="mt-3 flex items-center gap-3">
                        <img src={mediaPreview} alt="Preview" className="w-40 h-28 object-cover rounded-lg border border-slate-600" />
                        <button
                          type="button"
                          onClick={() => {
                            if (mediaPreview) {
                              setCropImageSrc(mediaPreview);
                              setCropAspect(getCropAspectForCategory(mediaForm.category));
                              setCrop({ x: 0, y: 0 });
                              setZoom(1);
                              setShowCropper(true);
                            }
                          }}
                          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <Crop className="w-4 h-4" />
                          Yeniden Kırp
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={async () => {
                      if (!mediaForm.category) {
                        showToast('Categorie is verplicht', 'error');
                        return;
                      }
                      if (!mediaFile && !editingMedia) {
                        showToast('Selecteer een afbeelding', 'error');
                        return;
                      }
                      setUploadingMedia(true);
                      try {
                        let imageUrl = '';
                        if (mediaFile) {
                          const ext = mediaFile.name.split('.').pop()?.toLowerCase() || 'jpg';
                          const path = `gallery/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                          const { error: uploadErr } = await supabase.storage
                            .from('event-images')
                            .upload(path, mediaFile, { upsert: true, contentType: mediaFile.type });
                          if (uploadErr) throw uploadErr;
                          const { data: urlData } = supabase.storage.from('event-images').getPublicUrl(path);
                          imageUrl = urlData.publicUrl;
                        }

                        if (editingMedia) {
                          const updateData: any = {
                            title: mediaForm.title || null,
                            category: mediaForm.category,
                            display_order: mediaForm.display_order,
                            is_active: mediaForm.is_active,
                            show_in_gallery: mediaForm.category === 'hero' ? mediaForm.show_in_gallery : true,
                            updated_at: new Date().toISOString(),
                          };
                          if (imageUrl) updateData.image_url = imageUrl;
                          const { error } = await supabase.from('gallery_images').update(updateData).eq('id', editingMedia);
                          if (error) throw error;
                          showToast('Afbeelding bijgewerkt', 'success');
                        } else {
                          const { error } = await supabase.from('gallery_images').insert({
                            title: mediaForm.title || null,
                            category: mediaForm.category,
                            image_url: imageUrl,
                            display_order: mediaForm.display_order,
                            is_active: mediaForm.is_active,
                            show_in_gallery: mediaForm.category === 'hero' ? mediaForm.show_in_gallery : true,
                          });
                          if (error) throw error;
                          showToast('Afbeelding toegevoegd', 'success');
                        }
                        setShowMediaForm(false);
                        setMediaFile(null);
                        setMediaPreview(null);
                        // Reload gallery images
                        const { data } = await supabase.from('gallery_images').select('*').order('display_order', { ascending: true }).limit(10000);
                        setGalleryImages(data || []);
                      } catch (err: any) {
                        showToast(err.message || 'Fout bij opslaan', 'error');
                      } finally {
                        setUploadingMedia(false);
                      }
                    }}
                    disabled={uploadingMedia}
                    className="px-6 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                  >
                    {uploadingMedia ? 'Uploading...' : editingMedia ? 'Bijwerken' : 'Opslaan'}
                  </button>
                  <button
                    onClick={() => {
                      setShowMediaForm(false);
                      setMediaFile(null);
                      setMediaPreview(null);
                    }}
                    className="px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-semibold transition-colors"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {galleryImages
                .slice(mediaPage * MEDIA_PER_PAGE, (mediaPage + 1) * MEDIA_PER_PAGE)
                .map((img) => (
                <div key={img.id} className="bg-slate-800/80 backdrop-blur border border-slate-600 rounded-xl overflow-hidden">
                  <div className="relative aspect-square">
                    <img src={img.image_url} alt={img.title || ''} className="w-full h-full object-cover" />
                    {!img.is_active && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-red-500/80 text-white text-xs rounded font-bold">Inactief</div>
                    )}
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-cyan-400 text-xs rounded font-medium">{img.category}</div>
                  </div>
                  <div className="p-3">
                    <p className="text-white text-sm font-medium truncate">{img.title || '(Geen titel)'}</p>
                    <p className="text-slate-400 text-xs">Volgorde: {img.display_order}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          setEditingMedia(img.id);
                          setMediaForm({
                            title: img.title || '',
                            category: img.category,
                            display_order: img.display_order,
                            is_active: img.is_active,
                            show_in_gallery: img.show_in_gallery ?? true,
                          });
                          setMediaPreview(img.image_url);
                          setMediaFile(null);
                          setShowMediaForm(true);
                        }}
                        className="flex-1 px-3 py-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded text-xs font-semibold transition-colors"
                      >
                        <Edit2 className="w-3 h-3 inline mr-1" />Bewerk
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('Weet je zeker dat je deze afbeelding wilt verwijderen?')) return;
                          const { error } = await supabase.from('gallery_images').delete().eq('id', img.id);
                          if (error) {
                            showToast('Verwijderen mislukt', 'error');
                          } else {
                            showToast('Afbeelding verwijderd', 'success');
                            setGalleryImages(prev => prev.filter(g => g.id !== img.id));
                          }
                        }}
                        className="flex-1 px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-xs font-semibold transition-colors"
                      >
                        <Trash2 className="w-3 h-3 inline mr-1" />Verwijder
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Media Pagination */}
            {(() => {
              const mediaTotalPages = Math.ceil(galleryImages.length / MEDIA_PER_PAGE);
              const mediaCanPrev = mediaPage > 0;
              const mediaCanNext = mediaPage < mediaTotalPages - 1;
              return mediaTotalPages > 1 ? (
                <div className="flex items-center justify-center gap-3 mt-8">
                  <button
                    onClick={() => setMediaPage(p => Math.max(0, p - 1))}
                    disabled={!mediaCanPrev}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      mediaCanPrev ? 'bg-white/10 hover:bg-red-500 text-white hover:text-white' : 'bg-white/5 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {Array.from({ length: mediaTotalPages }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setMediaPage(i)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        mediaPage === i
                          ? 'bg-red-500 text-white'
                          : 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}

                  <button
                    onClick={() => setMediaPage(p => Math.min(mediaTotalPages - 1, p + 1))}
                    disabled={!mediaCanNext}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      mediaCanNext ? 'bg-white/10 hover:bg-red-500 text-white hover:text-white' : 'bg-white/5 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              ) : null;
            })()}

            {galleryImages.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Nog geen media toegevoegd</p>
                <p className="text-sm">Klik op "Nieuwe Afbeelding" om te beginnen</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && role === 'super_admin' && (
          <EventAnalytics events={events} />
        )}

        {activeTab === 'ticketverkopen' && role === 'super_admin' && !selectedEventForSales && (
          <div>
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 text-white">
                Ticket<span className="text-red-400">verkopen</span>
              </h2>
              <p className="text-white">Bekijk ticketverkopen per evenement en exporteer CSV</p>
            </div>

            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-8">
              <div className="space-y-4">
                {salesSummary.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">Nog geen ticketverkopen gevonden</p>
                  </div>
                ) : (
                  salesSummary.map((summary) => (
                    <div
                      key={summary.event_id}
                      onClick={() => {
                        setSelectedEventForSales(summary.event_id);
                        loadTicketSalesForEvent(summary.event_id);
                      }}
                      className="bg-slate-800/60 border-2 border-slate-700 hover:border-red-500 rounded-xl p-6 cursor-pointer transition-all hover:shadow-lg hover:shadow-red-500/20"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                        <div className="md:col-span-2">
                          <h3 className="font-bold text-white text-lg mb-1">{summary.event_name}</h3>
                          <p className="text-slate-400 text-sm">
                            {summary.event_date ? new Date(summary.event_date).toLocaleDateString('nl-NL', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            }) : 'Geen datum'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-400 text-xs mb-1">Orders</p>
                          <p className="text-white font-bold text-2xl">{summary.total_orders}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-400 text-xs mb-1">Tickets</p>
                          <p className="text-white font-bold text-2xl">{summary.total_tickets}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-400 text-xs mb-1">Omzet</p>
                          <p className="text-green-400 font-bold text-2xl">€{((summary.total_revenue_cents || 0) / 100).toFixed(2)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-400 text-xs mb-1">Laatste verkoop</p>
                          <p className="text-white text-sm">
                            {summary.last_order_at ? new Date(summary.last_order_at).toLocaleDateString('nl-NL') : '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ticketverkopen' && role === 'super_admin' && selectedEventForSales && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <button
                  onClick={() => {
                    setSelectedEventForSales(null);
                    setTicketSales([]);
                    setSalesSearch('');
                  }}
                  className="text-red-400 hover:text-red-300 mb-4 flex items-center gap-2"
                >
                  ← Terug naar overzicht
                </button>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Ticketverkopen: <span className="text-red-400">{events.find(e => e.id === selectedEventForSales)?.name}</span>
                </h2>
                <p className="text-white">Bekijk alle orders en exporteer data</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => exportSalesCSV(selectedEventForSales)}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition-colors"
                >
                  <Download className="w-5 h-5" />
                  Download Orders CSV
                </button>
                <button
                  onClick={() => exportSalesItemsCSV(selectedEventForSales)}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors"
                >
                  <Download className="w-5 h-5" />
                  Download Items CSV
                </button>
              </div>
            </div>

            <div className="mb-6 bg-slate-800/60 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Zoek op order ID, email..."
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border-2 border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                  <p className="text-slate-400 text-sm mb-1">Totaal Orders</p>
                  <p className="text-white font-bold text-3xl">{ticketSales.length}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                  <p className="text-slate-400 text-sm mb-1">Totaal Tickets</p>
                  <p className="text-white font-bold text-3xl">{ticketSales.reduce((sum, s) => sum + s.quantity, 0)}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                  <p className="text-slate-400 text-sm mb-1">Totale Omzet</p>
                  <p className="text-green-400 font-bold text-3xl">€{(ticketSales.reduce((sum, s) => sum + s.total_cents, 0) / 100).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/60 backdrop-blur border-2 border-slate-600 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-900/50 border-b-2 border-slate-700">
                      <th className="text-left px-6 py-4 text-slate-300 font-semibold">Order ID</th>
                      <th className="text-left px-6 py-4 text-slate-300 font-semibold">Datum</th>
                      <th className="text-left px-6 py-4 text-slate-300 font-semibold">Klant</th>
                      <th className="text-left px-6 py-4 text-slate-300 font-semibold">Email</th>
                      <th className="text-center px-6 py-4 text-slate-300 font-semibold">Tickets</th>
                      <th className="text-right px-6 py-4 text-slate-300 font-semibold">Organisator</th>
                      <th className="text-right px-6 py-4 text-slate-300 font-semibold">Totaal</th>
                      <th className="text-center px-6 py-4 text-slate-300 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketSales
                      .filter(sale => {
                        if (!salesSearch) return true;
                        const search = salesSearch.toLowerCase();
                        return sale.order_id?.toLowerCase().includes(search) ||
                               sale.buyer_email?.toLowerCase().includes(search) ||
                               sale.buyer_name?.toLowerCase().includes(search);
                      })
                      .map((sale) => (
                        <tr key={sale.id} className="border-b border-slate-700 hover:bg-slate-700/30 transition-colors">
                          <td className="px-6 py-4 text-white font-mono text-sm">{sale.order_id}</td>
                          <td className="px-6 py-4 text-white text-sm">
                            {new Date(sale.created_at).toLocaleDateString('nl-NL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="px-6 py-4 text-white">{sale.buyer_name || '-'}</td>
                          <td className="px-6 py-4 text-white text-sm">{sale.buyer_email || '-'}</td>
                          <td className="px-6 py-4 text-white text-center font-bold">{sale.quantity}</td>
                          <td className="px-6 py-4 text-blue-400 text-right font-bold">€{(sale.organizer_amount / 100).toFixed(2)}</td>
                          <td className="px-6 py-4 text-green-400 text-right font-bold">€{(sale.total_cents / 100).toFixed(2)}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                              sale.payment_status === 'paid' ? 'bg-green-500/20 text-green-400' :
                              sale.payment_status === 'refunded' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {sale.payment_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    {ticketSales.filter(sale => {
                      if (!salesSearch) return true;
                      const search = salesSearch.toLowerCase();
                      return sale.order_id?.toLowerCase().includes(search) ||
                             sale.buyer_email?.toLowerCase().includes(search) ||
                             sale.buyer_name?.toLowerCase().includes(search);
                    }).length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                          Geen verkopen gevonden
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {(() => {
                  const filtered = ticketSales.filter(sale => {
                    if (!salesSearch) return true;
                    const search = salesSearch.toLowerCase();
                    return sale.order_id?.toLowerCase().includes(search) ||
                           sale.buyer_email?.toLowerCase().includes(search) ||
                           sale.buyer_name?.toLowerCase().includes(search);
                  });
                  const totalTickets = filtered.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
                  const totalOrganizer = filtered.reduce((sum: number, s: any) => sum + (s.organizer_amount || 0), 0);
                  const totalServiceFee = totalOrganizer > 0
                    ? filtered.reduce((sum: number, s: any) => sum + ((s.total_cents || 0) - (s.organizer_amount || 0)), 0)
                    : 0;
                  const grandTotal = filtered.reduce((sum: number, s: any) => sum + (s.total_cents || 0), 0);

                  return filtered.length > 0 ? (
                    <div className="mt-4 bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
                      <h3 className="text-lg font-bold text-white mb-4">Totalen{salesSearch ? ' (gefilterd)' : ''}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                          <div className="text-sm text-slate-400 mb-1">Totaal tickets</div>
                          <div className="text-2xl font-bold text-white">{totalTickets}</div>
                        </div>
                        <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                          <div className="text-sm text-slate-400 mb-1">Ticket prijs</div>
                          <div className="text-2xl font-bold text-blue-400">{'\u20AC'}{(totalOrganizer / 100).toFixed(2)}</div>
                        </div>
                        <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                          <div className="text-sm text-slate-400 mb-1">Service fee</div>
                          <div className="text-2xl font-bold text-amber-400">{'\u20AC'}{(totalServiceFee / 100).toFixed(2)}</div>
                        </div>
                        <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                          <div className="text-sm text-slate-400 mb-1">Totaal bedrag</div>
                          <div className="text-2xl font-bold text-green-400">{'\u20AC'}{(grandTotal / 100).toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'promo_codes' && role === 'super_admin' && (
          <div>
            <PromoCodesManager events={events} showToast={showToast} />
          </div>
        )}

        {activeTab === 'packages' && role === 'super_admin' && (
          <div>
            <TablePackagesManager />
          </div>
        )}

        {activeTab === 'table_bookings' && role === 'super_admin' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Tafel<span className="text-red-400">reservaties</span>
                </h2>
                <p className="text-white">Beheer alle tafelreservaties per event</p>
              </div>
            </div>

            <div className="mb-6 bg-slate-800/60 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-white">Filter op Event</label>
                  <select
                    value={bookingFilters.event}
                    onChange={(e) => setBookingFilters({ ...bookingFilters, event: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    <option value="">Alle Events</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>{event.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-white">Filter op Status</label>
                  <select
                    value={bookingFilters.status}
                    onChange={(e) => setBookingFilters({ ...bookingFilters, status: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    <option value="">Alle Statussen</option>
                    <option value="PAID">Betaald</option>
                    <option value="PENDING">In afwachting</option>
                    <option value="CANCELLED">Geannuleerd</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-white">Zoeken</label>
                  <input
                    type="text"
                    placeholder="Naam, email of code..."
                    value={bookingFilters.search}
                    onChange={(e) => setBookingFilters({ ...bookingFilters, search: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {filteredBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-bold text-white">
                          Tafel #{booking.floorplan_tables?.table_number || 'N/A'}
                        </h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            booking.status === 'PAID'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : booking.status === 'PENDING'
                              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {booking.status === 'PAID' ? 'BETAALD' : booking.status === 'PENDING' ? 'IN AFWACHTING' : 'GEANNULEERD'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <div className="text-sm text-white">Event</div>
                          <div className="font-semibold text-white">{booking.events?.name || 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Klant</div>
                          <div className="font-semibold text-white">{booking.customer_name}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Email</div>
                          <div className="font-semibold text-white text-sm">{booking.customer_email}</div>
                        </div>
                        <div>
                          <div className="text-sm text-white">Bedrag</div>
                          <div className="font-semibold text-white">€{(parseFloat(booking.total_price) || 0).toFixed(2)}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-3">
                        <div>
                          <div className="text-white">Capaciteit</div>
                          <div className="text-white">{booking.floorplan_tables?.capacity || 'N/A'} personen</div>
                        </div>
                        <div>
                          <div className="text-white">Aantal gasten</div>
                          <div className="text-white">{booking.number_of_guests} personen</div>
                        </div>
                        <div>
                          <div className="text-white">Type</div>
                          <div className="text-white">{booking.floorplan_tables?.table_type === 'SEATED' ? 'Zittafel' : 'Sta-tafel'}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-white">Reservatiecode</div>
                          <div className="text-white font-mono text-cyan-400">{booking.booking_code}</div>
                        </div>
                        <div>
                          <div className="text-white">Geboekt op</div>
                          <div className="text-white">{new Date(booking.created_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })}</div>
                        </div>
                        {booking.updated_at && (
                          <div>
                            <div className="text-white">Laatste update</div>
                            <div className="text-white">{new Date(booking.updated_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })}</div>
                          </div>
                        )}
                      </div>

                      {booking.special_requests && (
                        <div className="mt-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                          <div className="text-sm text-cyan-400">
                            <strong>Speciale verzoeken:</strong> {booking.special_requests}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {booking.status === 'PAID' && booking.order_id && (
                        <>
                          <button
                            onClick={() => resendTicketEmail(booking.order_id)}
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg font-semibold transition-colors text-white"
                            title="Verstuur bevestigingsmail opnieuw"
                          >
                            <Mail className="w-4 h-4" />
                            Resend Email
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBookingForCancellation(booking);
                              setShowCancellationModal(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-semibold transition-colors"
                            title="Annuleer reservatie"
                          >
                            <XCircle className="w-4 h-4" />
                            Annuleren
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredBookings.length === 0 && (
                <div className="text-center py-12 bg-slate-800/50 rounded-2xl border-2 border-slate-700">
                  <Grid className="w-16 h-16 mx-auto mb-4" style={{ color: 'rgba(255, 255, 255, 0.45)' }} />
                  <p className="text-white text-lg">Geen tafelreservaties gevonden</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'floorplan' && role === 'super_admin' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Floorplan<span className="text-red-400"> Builder</span>
                </h2>
                <p className="text-white">Beheer tafels en hun posities op de floorplan</p>
              </div>
            </div>

            <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6 mb-8">
              <FloorPlanEditor />
            </div>

          </div>
        )}

        {activeTab === 'floorplan' && role !== 'super_admin' && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-red-400" />
              <h2 className="text-2xl font-bold text-white mb-2">Geen Toegang</h2>
              <p className="text-slate-400">Je hebt geen toegang tot de Floorplan functie.</p>
            </div>
          </div>
        )}

        {role === 'admin' && !isAdminAllowedTab(activeTab) && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-red-400" />
              <h2 className="text-2xl font-bold text-white mb-2">Geen Toegang</h2>
              <p className="text-slate-400">Je hebt geen toegang tot deze sectie.</p>
              <p className="text-slate-500 text-sm mt-2">Als admin heb je alleen toegang tot Guest Tickets en Tafel Gasten.</p>
            </div>
          </div>
        )}

        {showCancellationModal && selectedBookingForCancellation && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full border-2 border-red-500/30 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-red-500/20 p-3 rounded-full">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Reservatie Annuleren</h2>
                <p className="text-white">
                  Tafel #{selectedBookingForCancellation.floorplan_tables?.table_number}
                </p>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-xl p-6 mb-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-white">Klant</div>
                  <div className="font-semibold text-white">{selectedBookingForCancellation.customer_name}</div>
                </div>
                <div>
                  <div className="text-sm text-white">Email</div>
                  <div className="font-semibold text-white text-sm">{selectedBookingForCancellation.customer_email}</div>
                </div>
                <div>
                  <div className="text-sm text-white">Totaal Bedrag</div>
                  <div className="font-semibold text-white">€{parseFloat(selectedBookingForCancellation.total_price).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-sm text-white">Event</div>
                  <div className="font-semibold text-white">{selectedBookingForCancellation.events?.name}</div>
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                {(() => {
                  const refundInfo = calculateRefund(selectedBookingForCancellation);
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-white">Dagen tot event:</span>
                        <span className="font-bold text-white">{refundInfo.daysUntilEvent}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white">Terugbetaling:</span>
                        <span className="font-bold text-cyan-400">{refundInfo.percentage}%</span>
                      </div>
                      <div className="flex items-center justify-between text-lg">
                        <span className="text-white font-semibold">Terug te betalen bedrag:</span>
                        <span className="font-bold text-green-400">€{(refundInfo.amount / 100).toFixed(2)}</span>
                      </div>
                      {(refundInfo.daysUntilEvent ?? 0) < 10 && (
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mt-3">
                          <p className="text-sm text-yellow-300">
                            <strong>Let op:</strong> Binnen 10 dagen voor het event wordt 30% ingehouden (70% terugbetaald)
                          </p>
                        </div>
                      )}
                      {(refundInfo.daysUntilEvent ?? 0) >= 10 && (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mt-3">
                          <p className="text-sm text-green-300">
                            <strong>Gratis annuleren:</strong> Meer dan 10 dagen voor het event - volledige terugbetaling
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-white mb-2">
                Reden van annulatie (optioneel)
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Bijv: Op verzoek van klant, dubbele reservatie, etc..."
                className="w-full px-4 py-3 bg-slate-900/50 border-2 border-slate-600 rounded-lg text-white placeholder:text-white/50 focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCancellationModal(false);
                  setSelectedBookingForCancellation(null);
                  setCancellationReason('');
                }}
                className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={handleCancelBooking}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-500 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                Bevestig Annulatie
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
    </div>
  );
}
