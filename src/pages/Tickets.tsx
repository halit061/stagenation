import { Check, Minus, Plus, Ticket as TicketIcon, ShieldCheck, CreditCard, AlertTriangle, X, Loader2, Clock, Lock, ChevronDown, ChevronUp, ArrowRight, MapPin } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Database } from '../lib/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import { checkoutWithRetry, reserveTickets } from '../lib/checkoutClient';
import { cachedQuery, invalidateCache } from '../lib/queryCache';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { VenueMap } from '../components/VenueMap';
import {
  fetchSeats as fetchSeatsFromService,
  fetchSections as fetchSectionsFromService,
  fetchFloorplanObjects as fetchFpObjects,
  fetchTicketTypeColorsForEvent,
} from '../services/seatPickerService';
import type { FloorplanObject, TicketTypeColor } from '../services/seatPickerService';
import type { Seat, SeatSection } from '../types/seats';

type TicketType = Database['public']['Tables']['ticket_types']['Row'];

interface CartItem {
  ticketType: TicketType;
  quantity: number;
}

interface TicketsProps {
  onNavigate?: (page: string) => void;
}

function ReservationTimer({ expiresAt, onExpired, t }: { expiresAt: string; onExpired: () => void; t: (key: string) => any }) {
  const [remaining, setRemaining] = useState(
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(interval);
        onExpired();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isUrgent = remaining <= 120;

  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${
      isUrgent
        ? 'bg-red-500/10 border-red-500/30'
        : 'bg-amber-500/10 border-amber-500/30'
    }`}>
      <Clock className={`w-4 h-4 ${isUrgent ? 'text-red-400' : 'text-amber-400'}`} />
      <span className={`text-sm font-medium ${isUrgent ? 'text-red-400' : 'text-amber-400'}`}>
        {t('tickets.ticketsReserved') || 'Tickets reserved for'} {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}

export function Tickets({ onNavigate }: TicketsProps) {
  const { t, language } = useLanguage();
  const [seoEventName, setSeoEventName] = useState('');
  useDocumentHead({
    title: seoEventName ? `${seoEventName} Tickets` : 'Tickets',
    description: seoEventName
      ? `Koop tickets voor ${seoEventName}. Veilige online ticketing via StageNation.`
      : 'Koop je tickets veilig online via StageNation. Evenementen in Genk, België.',
    path: '/tickets',
  });

  useEffect(() => {
    const SCRIPT_ID = 'stagenation-studio100-event-jsonld';
    const data = {
      '@context': 'https://schema.org',
      '@type': 'MusicEvent',
      name: 'Studio 100 Zingt in Genk',
      startDate: '2026-06-21T14:00:00+02:00',
      endDate: '2026-06-21T17:00:00+02:00',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: 'Limburghal',
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Jaarbeurslaan 6',
          addressLocality: 'Genk',
          postalCode: '3600',
          addressCountry: 'BE',
        },
      },
      image: ['https://stagenation.be/og-image.png'],
      description: 'Studio 100 Zingt live in Genk at Limburghal. Official tickets available via StageNation.',
      offers: {
        '@type': 'Offer',
        url: 'https://stagenation.be/tickets',
        price: '25',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        validFrom: '2026-04-25T10:00:00+02:00',
      },
      performer: { '@type': 'Organization', name: 'Studio 100' },
      organizer: { '@type': 'Organization', name: 'StageNation', url: 'https://stagenation.be' },
    };
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
    return () => {
      const el = document.getElementById(SCRIPT_ID);
      if (el) el.remove();
    };
  }, []);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    discount_type: string;
    discount_value: number;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [eventName, setEventName] = useState<string>('');
  const [eventServiceFeeEnabled, setEventServiceFeeEnabled] = useState(false);
  const [eventServiceFeeAmount, setEventServiceFeeAmount] = useState(0);
  const [eventFloorplanEnabled, setEventFloorplanEnabled] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    email: '',
    phone: '',
    street: '',
    number: '',
    postalCode: '',
    city: '',
    country: 'Belgium',
    marketingOptIn: false,
    acceptTerms: false,
  });
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [paymentBanner, setPaymentBanner] = useState<{ type: string; visible: boolean }>({ type: '', visible: false });
  const [eventId, setEventId] = useState<string | null>(null);
  const [sectionNamesPerTicketType, setSectionNamesPerTicketType] = useState<Record<string, string[]>>({});
  const [seatAvailability, setSeatAvailability] = useState<Record<string, number>>({});

  // Reservation timer state
  const [reservationOrderId, setReservationOrderId] = useState<string | null>(null);
  const [reservationExpiresAt, setReservationExpiresAt] = useState<string | null>(null);
  const [reservationExpired, setReservationExpired] = useState(false);
  const [reserving, setReserving] = useState(false);

  const [floorplanObjects, setFloorplanObjects] = useState<FloorplanObject[]>([]);
  const [floorplanSections, setFloorplanSections] = useState<SeatSection[]>([]);
  const [floorplanSeatDots, setFloorplanSeatDots] = useState<Seat[]>([]);
  const [floorplanTicketTypes, setFloorplanTicketTypes] = useState<TicketTypeColor[]>([]);

  // Refund protection state
  const [refundProtectionConfig, setRefundProtectionConfig] = useState<{
    is_enabled: boolean;
    fee_type: 'percentage' | 'fixed';
    fee_value: number;
    description: string;
  } | null>(null);
  const [refundProtectionSelected, setRefundProtectionSelected] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (paymentStatus && ['failed', 'expired', 'canceled'].includes(paymentStatus)) {
      setPaymentBanner({ type: paymentStatus, visible: true });
      window.history.replaceState(null, '', window.location.pathname);
    }

    try {
      const restoredCustomer = sessionStorage.getItem('restored_customer');
      if (restoredCustomer) {
        const c = JSON.parse(restoredCustomer);
        setCustomerInfo((prev) => ({
          ...prev,
          name: c.name || prev.name,
          email: c.email || prev.email,
          phone: c.phone || prev.phone,
          street: c.street || prev.street,
          number: c.number || prev.number,
          postalCode: c.postalCode || prev.postalCode,
          city: c.city || prev.city,
          country: c.country || prev.country,
        }));
        sessionStorage.removeItem('restored_customer');
      }
    } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!ticketTypes.length) return;
    try {
      const restored = sessionStorage.getItem('restored_cart');
      if (!restored) return;
      const items = JSON.parse(restored) as Array<{ ticket_type_id: string; quantity: number }>;
      const newCart: CartItem[] = [];
      for (const item of items) {
        const tt = ticketTypes.find((t) => t.id === item.ticket_type_id);
        if (!tt) continue;
        const maxQty = tt.quantity_total - tt.quantity_sold - ((tt as any).quantity_reserved || 0);
        const qty = Math.max(0, Math.min(item.quantity || 0, maxQty));
        if (qty > 0) newCart.push({ ticketType: tt, quantity: qty });
      }
      if (newCart.length > 0) setCart(newCart);
      sessionStorage.removeItem('restored_cart');
    } catch (_) { /* ignore */ }
  }, [ticketTypes]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventSlug = params.get('event');
    loadTicketTypes(eventSlug);

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        const p = new URLSearchParams(window.location.search);
        invalidateCache('ticket_types:');
        loadTicketTypes(p.get('event'));
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  async function loadTicketTypes(eventSlug: string | null) {
    try {
      const cacheKey = `ticket_types:${eventSlug || 'all'}`;
      let data = await cachedQuery<TicketType[]>(
        cacheKey,
        async () => {
          let query = supabase
            .from('ticket_types')
            .select('*, events!inner(id, name, slug, service_fee_enabled, service_fee_amount, floorplan_enabled)')
            .eq('is_active', true);

          if (eventSlug) {
            query = query.eq('events.slug', eventSlug);
          }

          const { data: rows, error } = await query.order('price', { ascending: true }).limit(10000);
          if (error) throw error;
          return rows || [];
        },
        15_000
      );

      if (data.length > 0) {
        const eventData = (data[0] as any).events;
        setEventName(eventData?.name || '');
        setSeoEventName(eventData?.name || '');
        setEventServiceFeeEnabled(eventData?.service_fee_enabled || false);
        setEventServiceFeeAmount(eventData?.service_fee_amount || 0);
        setEventFloorplanEnabled(eventData?.floorplan_enabled || false);
        const evId = eventData?.id;
        setEventId(evId);

        if (evId) {
          // Cleanup expired reservations (fire and forget)
          try { await supabase.rpc('release_expired_reservations', { p_event_id: evId }); } catch (_) {}

          if (eventData?.floorplan_enabled) {
            const [fpObjects, ttColors, { data: layouts }] = await Promise.all([
              fetchFpObjects(evId),
              fetchTicketTypeColorsForEvent(evId),
              supabase.from('venue_layouts').select('id').eq('event_id', evId).limit(1),
            ]);
            setFloorplanObjects(fpObjects);
            setFloorplanTicketTypes(ttColors);
            const layoutId = layouts?.[0]?.id;
            if (layoutId) {
              const secs = await fetchSectionsFromService(layoutId);
              setFloorplanSections(secs);
              const sectionIds = secs.map(s => s.id);
              if (sectionIds.length > 0) {
                const allSeats = await fetchSeatsFromService(sectionIds);
                setFloorplanSeatDots(allSeats);
              }
            }
          }

          // Load refund protection config
          const { data: rpConfig } = await supabase
            .from('refund_protection_config')
            .select('*')
            .eq('event_id', evId)
            .eq('is_enabled', true)
            .maybeSingle();

          if (rpConfig) {
            const langKey = `description_${language || 'nl'}` as string;
            setRefundProtectionConfig({
              is_enabled: rpConfig.is_enabled,
              fee_type: rpConfig.fee_type as 'percentage' | 'fixed',
              fee_value: Number(rpConfig.fee_value),
              description: (rpConfig as any)[langKey] || rpConfig.description_nl || '',
            });
          }

          try {
            const { data: ttSections } = await supabase
              .from('ticket_type_sections')
              .select('ticket_type_id, section_id, seat_sections(name)')
              .in('ticket_type_id', data.map((t: any) => t.id))
              .limit(10000);
            if (ttSections) {
              const nameMap: Record<string, string[]> = {};
              const sectionMap: Record<string, string[]> = {};
              for (const row of ttSections as any[]) {
                const ttId = row.ticket_type_id;
                const sName = row.seat_sections?.name;
                if (sName) {
                  if (!nameMap[ttId]) nameMap[ttId] = [];
                  if (!nameMap[ttId].includes(sName)) nameMap[ttId].push(sName);
                }
                if (!sectionMap[ttId]) sectionMap[ttId] = [];
                sectionMap[ttId].push(row.section_id);
              }
              setSectionNamesPerTicketType(nameMap);

              if (eventData?.floorplan_enabled) {
                const allTicketTypeIds = data.map((t: any) => t.id);
                const avail: Record<string, number> = {};
                for (const ttId of allTicketTypeIds) avail[ttId] = 0;

                const { data: rpcRows, error: rpcErr } = await supabase
                  .rpc('get_ticket_availability', { p_event_id: evId });

                if (!rpcErr && rpcRows) {
                  for (const row of rpcRows as Array<{ ticket_type_id: string; available_count: number }>) {
                    avail[row.ticket_type_id] = Number(row.available_count) || 0;
                  }
                } else if (allTicketTypeIds.length > 0) {
                  const { data: typeSeats } = await supabase
                    .from('seats')
                    .select('ticket_type_id')
                    .in('ticket_type_id', allTicketTypeIds)
                    .eq('is_active', true)
                    .eq('status', 'available')
                    .limit(20000);
                  for (const s of (typeSeats || []) as any[]) {
                    if (s.ticket_type_id) {
                      avail[s.ticket_type_id] = (avail[s.ticket_type_id] || 0) + 1;
                    }
                  }
                }

                setSeatAvailability(avail);
              }
            }
          } catch {
            // Section linkage is optional display info
          }
        }
      }

      // Override quantity_sold with actual paid ticket counts for accuracy
      if (data.length > 0) {
        const evId = (data[0] as any).events?.id;
        if (evId) {
          const { data: paidOrders } = await supabase
            .from('orders')
            .select('id')
            .eq('event_id', evId)
            .in('status', ['paid', 'comped'])
            .limit(10000);
          const paidOrderIds = (paidOrders || []).map((o: any) => o.id);
          if (paidOrderIds.length > 0) {
            const { data: paidTickets } = await supabase
              .from('tickets')
              .select('id, ticket_type_id')
              .in('order_id', paidOrderIds)
              .limit(10000);
            const countByType: Record<string, number> = {};
            (paidTickets || []).forEach((t: any) => {
              countByType[t.ticket_type_id] = (countByType[t.ticket_type_id] || 0) + 1;
            });
            data = data.map(tt => ({
              ...tt,
              quantity_sold: Math.max(tt.quantity_sold || 0, countByType[tt.id] || 0),
            }));
          }
        }
      }

      setTicketTypes(data);
    } catch (error) {
      console.error('Error loading ticket types:', error);
    } finally {
      setLoading(false);
    }
  }

  const updateQuantity = (ticketType: TicketType, delta: number) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.ticketType.id === ticketType.id);

      if (!existing && delta > 0) {
        return [...prev, { ticketType, quantity: 1 }];
      }

      return prev
        .map((item) => {
          if (item.ticketType.id === ticketType.id) {
            const newQuantity = item.quantity + delta;
            const maxQuantity = item.ticketType.quantity_total - item.ticketType.quantity_sold - ((item.ticketType as any).quantity_reserved || 0);
            return { ...item, quantity: Math.max(0, Math.min(newQuantity, maxQuantity)) };
          }
          return item;
        })
        .filter((item) => item.quantity > 0);
    });

    // No auto-scroll on mobile — user can tap the floating button when ready
  };

  const getCartQuantity = (ticketTypeId: string) => {
    return cart.find((item) => item.ticketType.id === ticketTypeId)?.quantity || 0;
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + item.ticketType.price * item.quantity, 0);
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = calculateTotal();

  const calculateServiceFee = () => {
    let totalCents = 0;
    for (const item of cart) {
      const tt = item.ticketType as any;
      const mode = tt.service_fee_mode || 'none';
      if (mode === 'fixed') {
        totalCents += Math.round(Number(tt.service_fee_fixed) * 100) * item.quantity;
      } else if (mode === 'percent') {
        totalCents += Math.round(item.ticketType.price * item.quantity * Number(tt.service_fee_percent) / 100);
      }
    }
    return totalCents;
  };

  const serviceFeeCents = calculateServiceFee();
  const eventFeeCents = eventServiceFeeEnabled ? totalItems * eventServiceFeeAmount : 0;

  const promoDiscountCents = (() => {
    if (!promoApplied || totalAmount === 0) return 0;
    if (promoApplied.discount_type === 'percentage') {
      return Math.round(totalAmount * promoApplied.discount_value / 100);
    }
    // fixed discount in cents
    return Math.min(promoApplied.discount_value, totalAmount);
  })();

  const refundProtectionFeeCents = (() => {
    if (!refundProtectionSelected || !refundProtectionConfig) return 0;
    if (refundProtectionConfig.fee_type === 'percentage') {
      return Math.round(totalAmount * refundProtectionConfig.fee_value / 100);
    }
    return Math.round(refundProtectionConfig.fee_value * 100);
  })();

  const grandTotalCents = Math.max(0, totalAmount + serviceFeeCents + eventFeeCents - promoDiscountCents + refundProtectionFeeCents);

  const getTranslatedName = (name: string) => {
    const ticketTypesTranslations = t('tickets.ticketTypes') as unknown as Record<string, string>;
    return ticketTypesTranslations[name] || name;
  };

  const handleApplyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;

    setPromoLoading(true);
    setPromoError('');

    try {
      const evId = eventId || ticketTypes[0]?.event_id;

      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        setPromoError(t('tickets.promoInvalid'));
        setPromoApplied(null);
        return;
      }

      // Check event match
      if (data.event_id && evId && data.event_id !== evId) {
        setPromoError(t('tickets.promoInvalid'));
        setPromoApplied(null);
        return;
      }

      // Check usage limit
      if (data.max_uses && data.used_count >= data.max_uses) {
        setPromoError(t('tickets.promoExpired'));
        setPromoApplied(null);
        return;
      }

      // Check validity dates
      const now = new Date();
      if (data.valid_from && new Date(data.valid_from) > now) {
        setPromoError(t('tickets.promoInvalid'));
        setPromoApplied(null);
        return;
      }
      if (data.valid_until && new Date(data.valid_until) < now) {
        setPromoError(t('tickets.promoExpired'));
        setPromoApplied(null);
        return;
      }

      if (data.ticket_type_id) {
        const cartHasTicketType = cart.some((item) => item.ticketType.id === data.ticket_type_id);
        if (!cartHasTicketType) {
          setPromoError('Deze code is niet geldig voor dit tickettype');
          setPromoApplied(null);
          return;
        }
      }

      setPromoApplied({
        code: data.code,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
      });
      setPromoError('');
    } catch {
      setPromoError(t('tickets.promoInvalid'));
      setPromoApplied(null);
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoApplied(null);
    setPromoCode('');
    setPromoError('');
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setReserving(true);
    setError('');

    try {
      const evId = eventId || ticketTypes[0]?.event_id;
      if (!evId) throw new Error('Event not found');

      const result = await reserveTickets({
        event_id: evId,
        cart: cart.map(item => ({
          ticket_type_id: item.ticketType.id,
          quantity: item.quantity,
          price: item.ticketType.price,
        })),
      });

      setReservationOrderId(result.order_id);
      setReservationExpiresAt(result.expires_at);
      setReservationExpired(false);
      setShowCheckoutForm(true);
    } catch (err: any) {
      if (err.message === 'SOLD_OUT') {
        setError(t('tickets.soldOut') + '!');
      } else if (err.message === 'PHASE_LOCKED') {
        setError(t('tickets.phaseLocked') || 'This ticket is not yet available.');
      } else if (err.message === 'QUEUED') {
        setError(t('tickets.queueMessage') || 'You are in queue. Please wait...');
      } else if (err.message === 'RATE_LIMITED') {
        setError(t('tickets.rateLimited') || 'Too many attempts. Please wait.');
      } else {
        // Fallback: skip reservation, proceed directly to checkout form
        console.warn('Reservation failed, falling back to direct checkout:', err.message);
        setReservationOrderId(null);
        setReservationExpiresAt(null);
        setShowCheckoutForm(true);
      }
    } finally {
      setReserving(false);
    }
  };

  const handleReservationExpired = useCallback(() => {
    setReservationExpired(true);
    setShowCheckoutForm(false);
    setReservationOrderId(null);
    setReservationExpiresAt(null);
    setError(t('tickets.reservationExpired') || 'Your reservation has expired. Please select your tickets again.');
  }, [t]);

  const handleSubmitCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (!customerInfo.email || !customerInfo.name) {
        throw new Error('Vul alle verplichte velden in');
      }

      if (!customerInfo.street || !customerInfo.number || !customerInfo.postalCode || !customerInfo.city || !customerInfo.country) {
        throw new Error(t('tickets.addressRequired'));
      }

      if (!customerInfo.acceptTerms) {
        throw new Error(t('tickets.termsRequired'));
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerInfo.email)) {
        throw new Error('Voer een geldig e-mailadres in');
      }

      // SECURITY: Validate email length
      if (customerInfo.email.length > 254) {
        throw new Error('E-mailadres is te lang');
      }

      // SECURITY: Validate name length
      if (customerInfo.name.length > 200) {
        throw new Error('Naam is te lang');
      }

      // SECURITY: Validate phone format (if provided)
      if (customerInfo.phone && !/^[+\d\s()-]{0,30}$/.test(customerInfo.phone)) {
        throw new Error('Ongeldig telefoonnummer formaat');
      }

      const evId = eventId || ticketTypes[0]?.event_id;
      if (!evId) {
        throw new Error('Event not found');
      }

      const cartData = cart.map(item => ({
        ticket_type_id: item.ticketType.id,
        quantity: item.quantity,
        price: item.ticketType.price,
      }));

      const data = await checkoutWithRetry({
        event_id: evId,
        cart: cartData,
        customer_email: customerInfo.email,
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        billing_street: customerInfo.street,
        billing_number: customerInfo.number,
        billing_postal_code: customerInfo.postalCode,
        billing_city: customerInfo.city,
        billing_country: customerInfo.country,
        promo_code: promoCode,
        marketing_opt_in: customerInfo.marketingOptIn,
        terms_accepted: customerInfo.acceptTerms,
        terms_language: language || 'nl',
        order_id: reservationOrderId || undefined,
        refund_protection: refundProtectionSelected,
      });

      if (!data.checkoutUrl) {
        throw new Error('Geen checkout URL ontvangen van de server');
      }

      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      console.error('Checkout error:', err);
      const msg = err.message || '';
      if (msg === 'SOLD_OUT') {
        setError(t('tickets.soldOut') || 'Uitverkocht! Niet genoeg tickets beschikbaar.');
      } else if (msg === 'ALREADY_PAID') {
        setError('Deze bestelling is al betaald.');
      } else if (msg === 'RESERVATION_EXPIRED' || msg.includes('expired')) {
        setError(t('tickets.reservationExpired') || 'Reservering verlopen. Probeer opnieuw.');
        setShowCheckoutForm(false);
        setReservationOrderId(null);
        setReservationExpiresAt(null);
      } else if (msg === 'RATE_LIMITED') {
        setError(t('tickets.rateLimited') || 'Te veel pogingen. Wacht even.');
      } else {
        setError(msg || 'Er ging iets mis bij het starten van de betaling. Probeer opnieuw of contacteer ons.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">{t('tickets.loading')}</p>
        </div>
      </div>
    );
  }

  // Phase locking: compute which ticket types are locked based on phase_group/phase_order
  const lockedStatus = (() => {
    const result = new Map<string, { locked: boolean; unlocksAfter: string | null }>();
    const groups = new Map<string, TicketType[]>();

    for (const tt of ticketTypes) {
      const pg = tt.phase_group;
      if (!pg) {
        result.set(tt.id, { locked: false, unlocksAfter: null });
        continue;
      }
      if (!groups.has(pg)) groups.set(pg, []);
      groups.get(pg)!.push(tt);
    }

    for (const [, groupTypes] of groups) {
      const sorted = [...groupTypes].sort((a, b) => (a.phase_order || 0) - (b.phase_order || 0));
      let activePhaseFound = false;
      let previousPhaseName: string | null = null;

      for (const tt of sorted) {
        const order = tt.phase_order || 0;
        const avail = tt.quantity_total - tt.quantity_sold;
        const isSoldOut = avail <= 0;

        if (order === 0) {
          result.set(tt.id, { locked: false, unlocksAfter: null });
          continue;
        }

        if (!activePhaseFound) {
          // This is the first phase in the order, or previous ones were sold out.
          result.set(tt.id, { locked: false, unlocksAfter: null });
          
          if (!isSoldOut) {
            // This phase is now the active one. Subsequent phases should be locked.
            activePhaseFound = true;
            previousPhaseName = tt.name;
          }
        } else {
          // An active phase was already found before this one, so this one must be locked.
          result.set(tt.id, { locked: true, unlocksAfter: previousPhaseName });
        }
      }

      // If all sold out, none locked
      if (!activePhaseFound) {
        for (const tt of sorted) {
          if (!result.has(tt.id)) result.set(tt.id, { locked: false, unlocksAfter: null });
        }
      }
    }
    return result;
  })();

  if (ticketTypes.length === 0) {
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto">
          <div className="w-20 h-20 bg-cyan-500/10 border border-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-cyan-400" />
          </div>
          <p className="text-slate-400 text-lg">
            {t('tickets.comingSoon')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {eventName ? (
              <>
                <span className="text-cyan-400">{eventName}</span>
              </>
            ) : (
              <>
                {t('tickets.title')} <span className="text-cyan-400">{t('tickets.titleHighlight')}</span>
              </>
            )}
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            {t('tickets.subtitle')}
          </p>
        </div>

        {paymentBanner.visible && (
          <div className={`max-w-3xl mx-auto mb-8 rounded-xl border p-4 flex items-start gap-3 ${
            paymentBanner.type === 'expired'
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
              paymentBanner.type === 'expired' ? 'text-amber-400' : 'text-red-400'
            }`} />
            <div className="flex-1">
              <p className={`font-semibold ${
                paymentBanner.type === 'expired' ? 'text-amber-300' : 'text-red-300'
              }`}>
                {paymentBanner.type === 'failed' && (language === 'nl' ? 'Betaling mislukt. Probeer opnieuw.' : language === 'tr' ? 'Payment failed. Please try again.' : language === 'fr' ? 'Paiement échoué. Veuillez réessayer.' : language === 'en' ? 'Payment failed. Please try again.' : 'Zahlung fehlgeschlagen. Bitte versuchen Sie es erneut.')}
                {paymentBanner.type === 'expired' && (language === 'nl' ? 'Betaling verlopen. Start opnieuw.' : language === 'tr' ? 'Payment expired. Please start again.' : language === 'fr' ? 'Paiement expiré. Veuillez recommencer.' : language === 'en' ? 'Payment expired. Please start again.' : 'Zahlung abgelaufen. Bitte starten Sie erneut.')}
                {paymentBanner.type === 'canceled' && (language === 'nl' ? 'Betaling geannuleerd.' : language === 'tr' ? 'Payment canceled.' : language === 'fr' ? 'Paiement annulé.' : language === 'en' ? 'Payment cancelled.' : 'Zahlung storniert.')}
              </p>
            </div>
            <button
              onClick={() => setPaymentBanner({ type: '', visible: false })}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {ticketTypes.map((ticketType) => {
              const seatBased = seatAvailability[ticketType.id] !== undefined;
              const available = seatBased
                ? seatAvailability[ticketType.id]
                : ticketType.quantity_total - ticketType.quantity_sold;
              const soldOut = available <= 0;
              const phaseInfo = lockedStatus.get(ticketType.id);
              const isLocked = phaseInfo?.locked || false;
              const unlocksAfterName = phaseInfo?.unlocksAfter || null;
              const cartQty = getCartQuantity(ticketType.id);

              const remaining = Math.max(0, available);
              const shouldShowRemaining =
                ticketType.show_remaining_tickets &&
                (seatBased || ticketType.quantity_total != null) &&
                (ticketType.remaining_display_threshold == null || remaining <= ticketType.remaining_display_threshold);

              // Color always from admin theme — no hardcoded overrides
              const theme = ticketType.theme as { card_border?: string; badge_text?: string } | null;
              const themeColor = theme?.card_border || null;
              const adminColor = ticketType.color || null;
              const tc = adminColor || themeColor || '#06b6d4';
              const badgeText = theme?.badge_text || null;

              // Helper to create rgba from hex
              const hexToRgb = (hex: string) => {
                const h = hex.replace('#', '');
                const r = parseInt(h.substring(0, 2), 16);
                const g = parseInt(h.substring(2, 4), 16);
                const b = parseInt(h.substring(4, 6), 16);
                return { r, g, b };
              };
              const rgb = hexToRgb(tc);
              const rgba = (a: number) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;

              // Determine if the color is light (for text contrast)
              const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
              const stubTextClass = luminance > 0.5 ? 'text-black/70' : 'text-white/80';

              /* Scalloped ticket edge mask - creates semicircle cutouts on left & right */
              const ticketMask = `
                radial-gradient(circle 6px at 0 50%, transparent 5.5px, black 6px) left / 51% 12px repeat-y,
                radial-gradient(circle 6px at 100% 50%, transparent 5.5px, black 6px) right / 51% 12px repeat-y
              `;

              return (
                <div
                  key={ticketType.id}
                  id={`ticket-${ticketType.id}`}
                  className={`group relative transition-all duration-200 ${soldOut ? 'opacity-50 grayscale' : isLocked ? 'opacity-60' : 'hover:-translate-y-1'}`}
                  style={{ filter: `drop-shadow(0 4px 24px ${rgba(0.12)})` }}
                >
                  {isLocked && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 rounded-lg">
                      <div className="text-center px-4">
                        <Lock className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                        {unlocksAfterName && (
                          <p className="text-slate-400 text-[11px]">
                            {(t('tickets.unlocksWhen') || '').replace('{name}', unlocksAfterName)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <div
                    className="flex overflow-hidden"
                    style={{ WebkitMask: ticketMask, mask: ticketMask }}
                  >
                    {/* Left colored stub - like a real ticket */}
                    <div className="w-12 sm:w-16 flex-shrink-0 flex items-center justify-center"
                      style={{ background: tc }}
                    >
                      <div className="transform -rotate-90 whitespace-nowrap">
                        <span className={`text-[10px] sm:text-xs font-extrabold uppercase tracking-[0.25em] ${stubTextClass}`}>
                          {badgeText ? `★ ${badgeText.split(' ')[0]} ★` : 'TICKET'}
                        </span>
                      </div>
                    </div>

                    {/* Perforation dots - like a tear line */}
                    <div className="w-4 flex-shrink-0 bg-[#111827] flex flex-col items-center justify-center gap-[3px] py-3">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div key={i} className="w-[2.5px] h-[2.5px] rounded-full"
                          style={{ backgroundColor: rgba(0.2) }} />
                      ))}
                    </div>

                    {/* Main ticket body */}
                    <div className="flex-1 flex flex-col sm:flex-row min-w-0 bg-[#111827]">
                      {/* Info section */}
                      <div className="flex-1 py-4 px-4 sm:py-5 sm:px-5 flex flex-col min-w-0">
                        {/* Decorative top line */}
                        <div className="h-px mb-3"
                          style={{ background: `linear-gradient(to right, ${rgba(0.3)}, ${rgba(0.05)}, transparent)` }} />

                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base sm:text-lg font-bold truncate"
                            style={badgeText ? { color: tc } : { color: '#fff' }}>
                            {getTranslatedName(ticketType.name)}
                          </h3>
                          {badgeText && (
                            <span className="flex-shrink-0 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded"
                              style={{
                                background: rgba(0.12),
                                color: tc,
                                border: `1px solid ${rgba(0.3)}`,
                              }}>
                              ★ {badgeText}
                            </span>
                          )}
                        </div>

                        {ticketType.description && (
                          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">{ticketType.description}</p>
                        )}

                        {sectionNamesPerTicketType[ticketType.id]?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {sectionNamesPerTicketType[ticketType.id].map(name => (
                              <span key={name} className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-400">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}

                        {remaining <= 0 ? (
                          <div className="mt-auto pt-3">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                              {t('tickets.soldOut')}
                            </span>
                          </div>
                        ) : shouldShowRemaining ? (() => {
                          const isUrgent = remaining <= 10;
                          const isCritical = remaining <= 50;
                          const dotColor = isUrgent ? '#ef4444' : isCritical ? '#f97316' : '#f59e0b';
                          const bgColor = isUrgent ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)';
                          const borderColor = isUrgent ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.18)';
                          const textCls = isUrgent ? 'text-red-400' : 'text-amber-400';
                          const fomoText = isUrgent
                            ? (t('tickets.lastTickets') || '').replace('{count}', String(remaining))
                            : (t('tickets.onlyLeft') || '').replace('{count}', String(remaining));
                          return (
                            <div className="mt-auto pt-3">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${textCls}`}
                                style={{ background: bgColor, border: `1px solid ${borderColor}` }}
                              >
                                <span className="relative flex h-2 w-2">
                                  {remaining <= 30 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: dotColor }} />}
                                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: dotColor }} />
                                </span>
                                {fomoText}
                              </span>
                            </div>
                          );
                        })() : null}

                        {/* Decorative bottom line */}
                        <div className="h-px mt-3"
                          style={{ background: `linear-gradient(to right, ${rgba(0.3)}, ${rgba(0.05)}, transparent)` }} />
                      </div>

                      {/* Price & controls stub */}
                      <div className={`py-4 px-4 sm:py-5 bg-[#0d1420] flex items-center gap-3 ${eventFloorplanEnabled ? 'sm:w-48 flex-row sm:flex-col justify-between sm:justify-center' : 'sm:w-40 flex-row sm:flex-col justify-between sm:justify-center'}`}>
                        <div className="text-xl sm:text-2xl font-black tracking-tight"
                          style={{ color: tc }}>
                          {'\u20AC'}{(ticketType.price / 100).toFixed(2)}
                        </div>

                        {isLocked ? (
                          <Lock className="w-5 h-5 text-slate-600" />
                        ) : eventFloorplanEnabled ? (
                          (() => {
                            const seatCount = seatAvailability[ticketType.id];
                            const noSeats = seatCount !== undefined && seatCount <= 0;
                            const isUnavailable = noSeats || soldOut;
                            return isUnavailable ? (
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                {t('tickets.soldOut')}
                              </span>
                            ) : (
                              <div className="flex flex-col items-center gap-1.5">
                                <button
                                  onClick={(e) => {
                                    if (isUnavailable) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      return;
                                    }
                                    onNavigate?.(`seat-picker?event=${eventId}&ticket_type=${ticketType.id}`);
                                  }}
                                  disabled={isUnavailable}
                                  aria-disabled={isUnavailable}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                  style={{ backgroundColor: tc, color: luminance > 0.5 ? '#000' : '#fff' }}
                                >
                                  <MapPin className="w-3.5 h-3.5" />
                                  <span>{t('tickets.chooseSeats') || 'Kies stoelen'}</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                                {seatCount !== undefined && seatCount > 0 && (ticketType.remaining_display_threshold == null || seatCount <= ticketType.remaining_display_threshold) && (
                                  <span className="text-[10px] text-slate-500">
                                    {seatCount} {t('tickets.seatsAvailable') || 'beschikbaar'}
                                  </span>
                                )}
                              </div>
                            );
                          })()
                        ) : !soldOut ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateQuantity(ticketType, -1)}
                              disabled={cartQty === 0}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700/50 hover:bg-slate-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center font-bold tabular-nums">{cartQty}</span>
                            <button
                              onClick={() => updateQuantity(ticketType, 1)}
                              disabled={cartQty >= available}
                              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed ${luminance > 0.5 ? 'text-black' : 'text-white'}`}
                              style={{ backgroundColor: tc }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {t('tickets.soldOut')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-6">
              <div className="flex items-start space-x-3">
                <ShieldCheck className="w-6 h-6 text-cyan-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold mb-2 text-cyan-400">{t('tickets.secureTickets')}</h3>
                  <ul className="space-y-1 text-sm text-slate-300">
                    <li className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-cyan-400" />
                      <span>{t('tickets.uniqueQR')}</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-cyan-400" />
                      <span>{t('tickets.directEmail')}</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-cyan-400" />
                      <span>{t('tickets.fraudProtection')}</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-cyan-400" />
                      <span>{t('tickets.transferable')}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Venue Map - from admin FloorPlan Editor */}
            {eventFloorplanEnabled && (floorplanObjects.length > 0 || floorplanSections.length > 0) && (
              <VenueMap
                sections={floorplanSections}
                seats={floorplanSeatDots}
                floorplanObjects={floorplanObjects}
                ticketTypeColors={floorplanTicketTypes}
                onNavigateToSeatPicker={eventId ? () => onNavigate?.(`seat-picker?event=${eventId}`) : undefined}
              />
            )}

          </div>

          <div id="cart-section" className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {eventFloorplanEnabled ? (
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
                <div className="flex items-center space-x-3 mb-5">
                  <MapPin className="w-6 h-6 text-cyan-400" />
                  <h3 className="text-xl font-bold">{t('tickets.seatPickerTitle') || 'Kies je stoelen'}</h3>
                </div>
                <div className="space-y-4 text-sm text-slate-300">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-cyan-400">1</span>
                    </div>
                    <p>{t('tickets.seatStep1') || 'Kies een tickettype hiernaast'}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-cyan-400">2</span>
                    </div>
                    <p>{t('tickets.seatStep2') || 'Selecteer je stoelen op het zaalplan'}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-cyan-400">3</span>
                    </div>
                    <p>{t('tickets.seatStep3') || 'Bevestig en betaal veilig online'}</p>
                  </div>
                </div>
              </div>
              ) : (
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <TicketIcon className="w-6 h-6 text-cyan-400" />
                  <h3 className="text-xl font-bold">{t('tickets.cart')}</h3>
                </div>

                {cart.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">
                    {t('tickets.cartEmpty')}
                  </p>
                ) : (
                  <>
                    <div className="space-y-4 mb-6">
                      {cart.map((item) => (
                        <div key={item.ticketType.id} className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium">{getTranslatedName(item.ticketType.name)}</div>
                            <div className="text-sm text-slate-400">
                              {item.quantity} x {'\u20AC'}{(item.ticketType.price / 100).toFixed(2)}
                            </div>
                          </div>
                          <div className="font-bold">
                            {'\u20AC'}{((item.ticketType.price * item.quantity) / 100).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-slate-700 pt-4 space-y-3 mb-6">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">{t('tickets.subtotal')}</span>
                        <span className="font-semibold">{'\u20AC'}{(totalAmount / 100).toFixed(2)}</span>
                      </div>

                      {serviceFeeCents > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-300">
                            {t('tickets.serviceFee')}
                          </span>
                          <span className="font-semibold text-slate-300">{'\u20AC'}{(serviceFeeCents / 100).toFixed(2)}</span>
                        </div>
                      )}

                      {eventFeeCents > 0 && (
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="text-slate-300">
                              {t('tickets.eventServiceFee')}
                            </div>
                          </div>
                          <span className="font-semibold text-slate-300">{'\u20AC'}{(eventFeeCents / 100).toFixed(2)}</span>
                        </div>
                      )}

                      {promoDiscountCents > 0 && (
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-1.5">
                            <span className="text-green-400">{t('tickets.promoDiscount')}</span>
                            <span className="text-[10px] text-green-400/60 bg-green-500/10 px-1.5 py-0.5 rounded font-mono">
                              {promoApplied?.code}
                            </span>
                          </div>
                          <span className="font-semibold text-green-400">-{'\u20AC'}{(promoDiscountCents / 100).toFixed(2)}</span>
                        </div>
                      )}

                      {refundProtectionFeeCents > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-300">{t('tickets.refundProtectionFee')}</span>
                          <span className="font-semibold text-slate-300">{'\u20AC'}{(refundProtectionFeeCents / 100).toFixed(2)}</span>
                        </div>
                      )}

                      <div className="border-t border-slate-700 pt-3 flex justify-between items-center">
                        <span className="text-white font-bold text-lg">{t('tickets.total')}</span>
                        <span className="text-cyan-400 font-bold text-lg">{'\u20AC'}{(grandTotalCents / 100).toFixed(2)}</span>
                      </div>

                      <div className="text-xs text-slate-500 pt-1">
                        {totalItems} {t('tickets.tickets')} {t('tickets.inclFees')}
                      </div>
                    </div>

                    {!showCheckoutForm ? (
                      <>
                        <div className="mb-6">
                          <label className="block text-sm font-medium mb-2">{t('tickets.promoCode')}</label>
                          {promoApplied ? (
                            <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <Check className="w-4 h-4 text-green-400" />
                                <span className="font-mono text-green-400 text-sm font-semibold">{promoApplied.code}</span>
                                <span className="text-green-400/60 text-xs">
                                  ({promoApplied.discount_type === 'percentage'
                                    ? `${promoApplied.discount_value}%`
                                    : `€${(promoApplied.discount_value / 100).toFixed(2)}`})
                                </span>
                              </div>
                              <button
                                onClick={handleRemovePromo}
                                className="text-slate-400 hover:text-red-400 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={promoCode}
                                onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); }}
                                placeholder="PROMO2025"
                                onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                                className={`flex-1 px-4 py-2 bg-slate-900 border rounded-lg focus:outline-none focus:border-cyan-500 text-white ${
                                  promoError ? 'border-red-500/50' : 'border-slate-700'
                                }`}
                              />
                              <button
                                onClick={handleApplyPromo}
                                disabled={promoLoading || !promoCode.trim()}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
                              >
                                {promoLoading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  t('tickets.promoApply')
                                )}
                              </button>
                            </div>
                          )}
                          {promoError && (
                            <p className="text-red-400 text-xs mt-1.5">{promoError}</p>
                          )}
                        </div>

                        {refundProtectionConfig && refundProtectionConfig.is_enabled && (
                          <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                                <span className="font-semibold text-white text-sm">{t('tickets.refundProtection')}</span>
                              </div>
                              <span className="text-xs font-bold text-cyan-400">
                                + {'\u20AC'}{(refundProtectionFeeCents / 100).toFixed(2)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">{refundProtectionConfig.description}</p>
                            <ul className="space-y-1 text-xs text-slate-300">
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                                <span>{t('tickets.refundBenefit1')}</span>
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                                <span>{t('tickets.refundBenefit2')}</span>
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                                <span>{t('tickets.refundBenefit3')}</span>
                              </li>
                            </ul>
                            <div className="space-y-2">
                              <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                                refundProtectionSelected
                                  ? 'border-cyan-500/50 bg-cyan-500/10'
                                  : 'border-slate-600 hover:border-slate-500'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="refundProtection"
                                    checked={refundProtectionSelected}
                                    onChange={() => setRefundProtectionSelected(true)}
                                    className="text-cyan-500 focus:ring-cyan-500"
                                  />
                                  <span className="text-sm text-white font-medium">{t('tickets.yesProtect')}</span>
                                </div>
                              </label>
                              <label className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                                !refundProtectionSelected
                                  ? 'border-slate-500/50 bg-slate-700/30'
                                  : 'border-slate-600 hover:border-slate-500'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="refundProtection"
                                    checked={!refundProtectionSelected}
                                    onChange={() => setRefundProtectionSelected(false)}
                                    className="text-slate-500 focus:ring-slate-500"
                                  />
                                  <span className="text-sm text-slate-300">{t('tickets.noProtection')}</span>
                                </div>
                              </label>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={handleCheckout}
                          disabled={reserving}
                          className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold transition-all shadow-lg shadow-cyan-500/30"
                        >
                          {reserving ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>{t('tickets.reserving') || 'Reserving...'}</span>
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-5 h-5" />
                              <span>{t('tickets.checkout')}</span>
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <form id="checkout-form" onSubmit={handleSubmitCheckout} className="space-y-4">
                        {reservationExpiresAt && !reservationExpired && (
                          <ReservationTimer
                            expiresAt={reservationExpiresAt}
                            onExpired={handleReservationExpired}
                            t={t}
                          />
                        )}

                        {error && (
                          <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 text-red-500 text-sm">
                            {error}
                          </div>
                        )}

                        <div>
                          <label className="block text-sm font-medium mb-2">{t('tickets.name')} *</label>
                          <input
                            type="text"
                            required
                            value={customerInfo.name}
                            onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">{t('tickets.email')} *</label>
                          <input
                            type="email"
                            required
                            value={customerInfo.email}
                            onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">{t('tickets.phone')}</label>
                          <input
                            type="tel"
                            value={customerInfo.phone}
                            onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                            placeholder="+32 XXX XX XX XX"
                          />
                        </div>

                        <div className="border-t border-slate-700 pt-4 mt-2">
                          <label className="block text-sm font-semibold mb-3 text-white">{t('tickets.billingAddress')}</label>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <input
                                type="text"
                                required
                                value={customerInfo.street}
                                onChange={(e) => setCustomerInfo({ ...customerInfo, street: e.target.value })}
                                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                                placeholder={t('tickets.street')}
                              />
                            </div>
                            <div>
                              <input
                                type="text"
                                required
                                value={customerInfo.number}
                                onChange={(e) => setCustomerInfo({ ...customerInfo, number: e.target.value })}
                                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                                placeholder={t('tickets.houseNumber')}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>
                              <input
                                type="text"
                                required
                                value={customerInfo.postalCode}
                                onChange={(e) => setCustomerInfo({ ...customerInfo, postalCode: e.target.value })}
                                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                                placeholder={t('tickets.postalCode')}
                              />
                            </div>
                            <div>
                              <input
                                type="text"
                                required
                                value={customerInfo.city}
                                onChange={(e) => setCustomerInfo({ ...customerInfo, city: e.target.value })}
                                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                                placeholder={t('tickets.city')}
                              />
                            </div>
                          </div>
                          <div className="mt-2">
                            <select
                              required
                              value={customerInfo.country}
                              onChange={(e) => setCustomerInfo({ ...customerInfo, country: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                            >
                              <option value="Belgium">Belgium</option>
                              <option value="Netherlands">Netherlands</option>
                              <option value="Germany">Germany</option>
                              <option value="France">France</option>
                              <option value="Luxembourg">Luxembourg</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className={`bg-slate-900/50 border rounded-lg p-4 transition-colors ${
                            error && !customerInfo.acceptTerms
                              ? 'border-red-500/50 bg-red-500/5'
                              : 'border-slate-700'
                          }`}>
                            <label className="flex items-start gap-3 cursor-pointer group">
                              <input
                                type="checkbox"
                                required
                                checked={customerInfo.acceptTerms}
                                onChange={(e) => setCustomerInfo({ ...customerInfo, acceptTerms: e.target.checked })}
                                className="mt-1 w-5 h-5 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900 cursor-pointer"
                              />
                              <div className="flex-1">
                                <p className="text-white font-medium text-sm leading-relaxed">
                                  {t('tickets.acceptTerms')}{' '}
                                  <a
                                    href="/terms"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      window.open('/terms', '_blank');
                                    }}
                                  >
                                    {t('tickets.termsLink')}
                                  </a>{' '}
                                  *
                                </p>
                                {error && !customerInfo.acceptTerms && (
                                  <p className="text-red-400 text-xs mt-2 flex items-start gap-1">
                                    <span className="text-red-400">{'\u26A0'}</span>
                                    <span>{t('tickets.termsRequired')}</span>
                                  </p>
                                )}
                              </div>
                            </label>
                          </div>

                          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                            <label className="flex items-start gap-3 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={customerInfo.marketingOptIn}
                                onChange={(e) => setCustomerInfo({ ...customerInfo, marketingOptIn: e.target.checked })}
                                className="mt-1 w-5 h-5 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                              />
                              <div>
                                <p className="text-white font-medium group-hover:text-cyan-400 transition-colors text-sm">
                                  {t('tickets.marketingOptIn')}
                                </p>
                              </div>
                            </label>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCheckoutForm(false);
                              // Reservation will expire naturally; no need to cancel
                              setReservationOrderId(null);
                              setReservationExpiresAt(null);
                            }}
                            disabled={submitting}
                            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg font-semibold transition-colors"
                          >
                            {t('tickets.back')}
                          </button>
                          <button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold transition-all"
                          >
                            {submitting ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>{t('tickets.processing')}</span>
                              </>
                            ) : (
                              <>
                                <CreditCard className="w-5 h-5" />
                                <span>{t('tickets.pay')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>
              )}



            </div>
          </div>
        </div>

        {/* Mobile floating buttons */}
        {!eventFloorplanEnabled && cart.length > 0 && (
          <div className="fixed bottom-6 left-4 right-20 z-[60] lg:hidden flex gap-2">
            {/* Scroll to top button */}
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center justify-center w-14 h-14 bg-slate-700/90 backdrop-blur hover:bg-slate-600 active:bg-slate-800 text-white rounded-2xl shadow-lg shadow-black/30 transition-colors flex-shrink-0"
              aria-label="Scroll to top"
            >
              <ChevronUp className="w-6 h-6" />
            </button>

            {showCheckoutForm ? (
              /* When checkout form is visible: Pay button that submits the form */
              <button
                onClick={() => {
                  const form = document.querySelector<HTMLFormElement>('#checkout-form');
                  if (form) {
                    form.requestSubmit();
                  }
                }}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:from-cyan-600 active:to-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-cyan-900/40 transition-all"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t('tickets.processing')}</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>{t('tickets.pay')}</span>
                    <span>{'\u20AC'}{(grandTotalCents / 100).toFixed(2)}</span>
                  </>
                )}
              </button>
            ) : (
              /* When browsing tickets: scroll to cart */
              <button
                onClick={() => {
                  document.getElementById('cart-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="flex-1 flex items-center justify-between gap-3 px-6 py-4 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold rounded-2xl shadow-lg shadow-cyan-900/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <TicketIcon className="w-5 h-5" />
                  <span>{cart.reduce((sum, item) => sum + item.quantity, 0)} {t('tickets.tickets')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>{'\u20AC'}{(grandTotalCents / 100).toFixed(2)}</span>
                  <ChevronDown className="w-5 h-5 animate-bounce" />
                </div>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
