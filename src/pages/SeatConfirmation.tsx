import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CheckCircle, Copy, Calendar, MapPin, Share2, ArrowLeft, Download, Ticket, Loader2, XCircle, RefreshCw, FileText } from 'lucide-react';
import QRCode from 'qrcode';
import {
  fetchOrderById,
  fetchOrderSeats,
  fetchSeatsForOrder,
  fetchSectionsForOrder,
} from '../services/seatCheckoutService';
import { fetchEventInfo, fetchLayoutByEvent, fetchSections } from '../services/seatPickerService';
import { generateTicketsPdf } from '../lib/generateTicketPdf';
import type { TicketPdfSection } from '../lib/generateTicketPdf';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';
import { track as fbTrack, buildAdvancedMatch } from '../lib/fbPixel';

interface Props {
  eventId: string;
  orderId: string;
  onNavigate: (page: string) => void;
}

interface OrderData {
  id: string;
  order_number: string;
  payer_name: string;
  payer_email: string;
  payer_phone: string | null;
  total_amount: number;
  service_fee_amount: number;
  payment_method: string | null;
  status: string;
  verification_code: string | null;
  metadata: any;
  created_at: string;
}

interface SeatInfo {
  id: string;
  row_label: string;
  seat_number: number;
  seat_type: string;
  section_name: string;
  section_color: string;
  price: number;
  ticket_code: string | null;
  ticket_number: string | null;
  qr_data: string | null;
  ticket_type_name: string | null;
}

function QRCodeImage({ data, size = 160 }: { data: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;
    QRCode.toCanvas(canvasRef.current, data, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {});
  }, [data, size]);

  return <canvas ref={canvasRef} className="rounded-lg" />;
}

export function SeatConfirmation({ eventId, orderId, onNavigate }: Props) {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [eventInfo, setEventInfo] = useState<any>(null);
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  const [copied, setCopied] = useState(false);
  const [animReady, setAnimReady] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>('loading');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [venueSections, setVenueSections] = useState<TicketPdfSection[]>([]);
  const pollRef = useRef(0);

  const dateLocale = language === 'de' ? 'de-DE' : language === 'fr' ? 'fr-FR' : language === 'tr' ? 'tr-TR' : 'nl-NL';

  useEffect(() => {
    let cancelled = false;
    let pollCount = 0;

    async function loadOrder() {
      try {
        const orderData = await fetchOrderById(orderId);
        if (cancelled) return;

        if (!orderData) {
          setError(st(language, 'confirm.notFound'));
          setPaymentStatus('error');
          setLoading(false);
          return;
        }

        const status = orderData.status;
        setOrder(orderData as OrderData);

        if (status === 'paid') {
          setPaymentStatus('paid');
          await loadFullData(orderData);
          if (!cancelled) {
            setLoading(false);
            setTimeout(() => setAnimReady(true), 100);
          }
        } else if (['payment_failed', 'payment_canceled', 'payment_expired', 'failed', 'cancelled'].includes(status)) {
          setPaymentStatus('failed');
          setLoading(false);
        } else {
          setPaymentStatus('pending');
          setLoading(false);
          pollCount++;
          if (pollCount < 30) {
            const delay = Math.min(2000 * Math.pow(1.3, pollCount - 1), 10000);
            pollRef.current = window.setTimeout(() => { if (!cancelled) loadOrder(); }, delay);
          }
        }
      } catch {
        if (!cancelled) {
          setError(st(language, 'confirm.notFound'));
          setPaymentStatus('error');
          setLoading(false);
        }
      }
    }

    async function loadFullData(orderData: any) {
      try {
        const ev = await fetchEventInfo(eventId);
        if (cancelled) return;
        setEventInfo(ev);

        const ticketSeats = await fetchOrderSeats(orderId);
        if (cancelled) return;

        const seatIds = ticketSeats.map((ts: any) => ts.seat_id);
        const seatData = await fetchSeatsForOrder(seatIds);
        if (cancelled) return;

        const sectionIds = [...new Set(seatData.map((s: any) => s.section_id))];
        const sectionData = await fetchSectionsForOrder(sectionIds as string[]);
        if (cancelled) return;

        const ttIds = [...new Set(seatData.filter((s: any) => s.ticket_type_id).map((s: any) => s.ticket_type_id))];
        let ttMap = new Map<string, { name: string; price: number; color: string }>();
        if (ttIds.length > 0) {
          const { supabase: sb } = await import('../lib/supabaseClient');
          const { data: ttData } = await sb
            .from('ticket_types')
            .select('id, name, price, color')
            .in('id', ttIds)
            .limit(10000);
          if (ttData) ttMap = new Map(ttData.map((t: any) => [t.id, { name: t.name, price: (t.price || 0) / 100, color: t.color || '' }]));
        }

        const sectionMap = new Map(sectionData.map((s: any) => [s.id, s]));
        const seatInfos: SeatInfo[] = ticketSeats.map((ts: any) => {
          const seat = seatData.find((s: any) => s.id === ts.seat_id);
          const section = seat ? sectionMap.get(seat.section_id) : null;
          const tt = seat?.ticket_type_id ? ttMap.get(seat.ticket_type_id) : null;
          const pricePaid = Number(ts.price_paid) || 0;
          const resolvedPrice = pricePaid > 0 ? pricePaid : (tt?.price ?? 0);
          return {
            id: ts.id,
            row_label: seat?.row_label || '?',
            seat_number: seat?.seat_number || 0,
            seat_type: seat?.seat_type || 'regular',
            section_name: tt?.name || section?.name || st(language, 'confirm.unknown'),
            section_color: tt?.color || section?.color || '#64748b',
            price: resolvedPrice,
            ticket_code: ts.ticket_code || null,
            ticket_number: ts.ticket_number || null,
            qr_data: ts.qr_data || null,
            ticket_type_name: tt?.name || null,
          };
        });

        seatInfos.sort((a, b) =>
          a.section_name.localeCompare(b.section_name) ||
          a.row_label.localeCompare(b.row_label) ||
          a.seat_number - b.seat_number
        );

        setSeats(seatInfos);

        try {
          const purchaseKey = `fb_purchase_fired_${orderData.id}`;
          if (!sessionStorage.getItem(purchaseKey)) {
            const userData = await buildAdvancedMatch({
              email: orderData.payer_email,
              phone: orderData.payer_phone,
              fullName: orderData.payer_name,
              country: 'be',
            });
            fbTrack(
              'Purchase',
              {
                value: orderData.total_amount / 100,
                currency: 'EUR',
                content_ids: [eventId],
                content_name: ev?.name || 'Event',
                content_type: 'product',
                num_items: seatInfos.length,
                order_id: orderData.id,
                ...userData,
              },
              { eventID: orderData.id }
            );
            sessionStorage.setItem(purchaseKey, '1');
          }
        } catch {}

        try {
          const layout = await fetchLayoutByEvent(eventId);
          if (layout && !cancelled) {
            const allSections = await fetchSections(layout.id);
            if (!cancelled) {
              setVenueSections(allSections.map(s => ({
                id: s.id,
                name: s.name,
                color: s.color,
                position_x: s.position_x,
                position_y: s.position_y,
                width: s.width,
                height: s.height,
              })));
            }
          }
        } catch {}
      } catch {}
    }

    loadOrder();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [orderId, eventId, language]);

  const handleCopy = useCallback(async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.order_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [order]);

  const handleShare = useCallback(async () => {
    if (!eventInfo) return;
    const shareData = {
      title: eventInfo.name,
      text: eventInfo.name,
      url: window.location.origin + `/seat-picker?event=${eventId}`,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    }
  }, [eventInfo, eventId]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    if (!order || !eventInfo || seats.length === 0) return;
    setPdfGenerating(true);
    try {
      await generateTicketsPdf(
        {
          order_number: order.order_number,
          payer_name: order.payer_name,
          payer_email: order.payer_email,
          verification_code: order.verification_code,
        },
        {
          name: eventInfo.name,
          start_date: eventInfo.start_date,
          location: eventInfo.location,
          venue_name: eventInfo.venue_name,
        },
        seats.map(s => ({
          row_label: s.row_label,
          seat_number: s.seat_number,
          section_name: s.section_name,
          section_color: s.section_color,
          price: s.price,
          ticket_code: s.ticket_code,
          ticket_number: s.ticket_number,
          qr_data: s.qr_data,
          seat_type: s.seat_type,
          ticket_type_name: s.ticket_type_name || undefined,
        })),
        venueSections.length > 0 ? venueSections : undefined,
      );
    } catch {
    } finally {
      setPdfGenerating(false);
    }
  }, [order, eventInfo, seats, venueSections]);

  const formattedDate = useMemo(() => {
    if (!eventInfo?.start_date) return '';
    return new Date(eventInfo.start_date).toLocaleDateString(dateLocale, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [eventInfo, dateLocale]);

  const firstName = order?.metadata?.customer_first_name || order?.payer_name?.split(' ')[0] || '';
  const totalAmount = order ? order.total_amount / 100 : 0;
  const serviceFeeVal = Number(order?.service_fee_amount ?? order?.metadata?.service_fee ?? 0);
  const seatsSubtotal = seats.reduce((sum, s) => sum + s.price, 0);
  const subtotal = seatsSubtotal > 0 ? seatsSubtotal : (order?.metadata?.subtotal ?? (totalAmount - serviceFeeVal));

  const seatsBySection = useMemo(() => {
    const grouped: Record<string, SeatInfo[]> = {};
    for (const seat of seats) {
      if (!grouped[seat.section_name]) grouped[seat.section_name] = [];
      grouped[seat.section_name].push(seat);
    }
    return grouped;
  }, [seats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col" role="status" aria-label={st(language, 'confirm.loading')}>
        <div className="h-14 bg-slate-900/80 border-b border-slate-800 flex items-center px-4 gap-3">
          <div className="w-8 h-8 skeleton rounded-lg" />
          <div className="h-4 w-24 skeleton rounded" />
        </div>
        <div className="max-w-3xl mx-auto w-full px-4 py-8 space-y-6">
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 skeleton rounded-full mb-4" />
            <div className="h-7 w-48 skeleton rounded mb-2" />
            <div className="h-4 w-56 skeleton rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (paymentStatus === 'pending') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/15 mb-6">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{st(language, 'confirm.paymentPending')}</h2>
          <p className="text-slate-400 mb-6">{st(language, 'confirm.paymentPendingDesc')}</p>
          <div className="flex items-center justify-center gap-2 text-slate-500 text-sm mb-8">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>{st(language, 'confirm.autoRefresh')}</span>
          </div>
          <p className="text-slate-500 text-xs mb-3">{st(language, 'confirm.stillProcessing')}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => onNavigate(`seat-picker?event=${eventId}`)}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              {st(language, 'confirm.tryAgain')}
            </button>
            <button
              onClick={() => onNavigate('home')}
              className="flex-1 px-4 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 font-medium rounded-xl transition-colors text-sm"
            >
              {st(language, 'picker.backHome')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (paymentStatus === 'failed') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/15 mb-6">
            <XCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{st(language, 'confirm.paymentFailed') || 'Betaling mislukt'}</h2>
          <p className="text-slate-400 mb-6">{st(language, 'confirm.paymentFailedDesc') || 'Je betaling kon niet worden verwerkt. Je stoelen zijn weer beschikbaar.'}</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => onNavigate(`seat-picker?event=${eventId}`)}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors"
            >
              {st(language, 'confirm.tryAgain') || 'Opnieuw proberen'}
            </button>
            <button
              onClick={() => onNavigate('home')}
              className="px-6 py-3 border border-slate-700 text-slate-300 hover:bg-slate-800 font-medium rounded-xl transition-colors"
            >
              {st(language, 'picker.backHome')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4" role="alert">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-white mb-2">{st(language, 'confirm.notFound')}</h1>
          <p className="text-slate-400 mb-6">{error || st(language, 'confirm.notFoundDesc')}</p>
          <button
            onClick={() => onNavigate('home')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors focus-ring"
          >
            {st(language, 'picker.backHome')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 print:bg-white">
      <header className="bg-slate-900/80 backdrop-blur border-b border-slate-800 px-4 py-3 print:hidden">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={() => onNavigate('home')}
            className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800 focus-ring"
            aria-label={st(language, 'picker.backHome')}
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <h1 className="text-white font-bold text-base">{st(language, 'confirm.title')}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className={`text-center transition-all duration-500 ${animReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/15 mb-4 ${animReady ? 'confirmation-check-bounce' : ''}`}>
            <CheckCircle className="w-10 h-10 text-emerald-400" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-white">{st(language, 'confirm.orderPlaced')}</h2>
          <p className="text-slate-400 mt-1">
            {st(language, 'confirm.thanks')}{firstName ? `, ${firstName}` : ''}!
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{st(language, 'confirm.orderNumber')}</p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xl font-mono font-bold text-white select-all">
              {order.order_number}
            </span>
            <button
              onClick={handleCopy}
              className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800 focus-ring"
              aria-label={st(language, 'confirm.copyOrder')}
            >
              {copied ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {copied && <p className="text-emerald-400 text-xs mt-1" role="status">{st(language, 'confirm.copied')}</p>}
          {order.verification_code && (
            <p className="text-slate-500 text-xs mt-2">
              {st(language, 'confirm.verificationCode') || 'Verificatiecode'}: <span className="font-mono font-bold text-slate-300">{order.verification_code}</span>
            </p>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-white font-bold text-base mb-3">{eventInfo?.name}</h3>
          {formattedDate && (
            <p className="flex items-center gap-2 text-slate-400 text-sm mb-1.5">
              <Calendar className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {formattedDate}
            </p>
          )}
          {(eventInfo?.venue_name || eventInfo?.location) && (
            <p className="flex items-center gap-2 text-slate-400 text-sm">
              <MapPin className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {eventInfo.venue_name || eventInfo.location}
            </p>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h3 className="text-white font-semibold text-sm">{st(language, 'confirm.seatsOverview')}</h3>
          </div>

          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-800">
                  <th className="text-left px-5 py-2 font-medium">{st(language, 'confirm.sectionHeader')}</th>
                  <th className="text-left px-3 py-2 font-medium">{st(language, 'confirm.rowHeader')}</th>
                  <th className="text-left px-3 py-2 font-medium">{st(language, 'confirm.seatHeader')}</th>
                  <th className="text-left px-3 py-2 font-medium">Code</th>
                  <th className="text-right px-5 py-2 font-medium">{st(language, 'confirm.priceHeader')}</th>
                </tr>
              </thead>
              <tbody>
                {seats.map(seat => (
                  <tr
                    key={seat.id}
                    className={`border-b border-slate-800/50 last:border-0 ${seat.seat_type === 'vip' ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seat.section_color }} aria-hidden="true" />
                        <span className="text-slate-300">{seat.section_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">{seat.row_label}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-slate-300">{seat.seat_number}</span>
                      {seat.seat_type === 'vip' && (
                        <span className="ml-1.5 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">VIP</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {seat.ticket_code && (
                        <span className="font-mono text-xs text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded select-all">{seat.ticket_code}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right text-white font-medium tabular-nums">EUR {seat.price.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden px-4 py-3 space-y-2">
            {Object.entries(seatsBySection).map(([sectionName, sectionSeats]) => (
              <div key={sectionName} className="space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sectionSeats[0].section_color }} aria-hidden="true" />
                  <span className="text-xs font-semibold text-slate-400 uppercase">{sectionName}</span>
                </div>
                {sectionSeats.map(seat => (
                  <div key={seat.id} className={`px-3 py-2 rounded-lg ${seat.seat_type === 'vip' ? 'bg-amber-500/5' : 'bg-slate-800/30'}`}>
                    <div className="flex justify-between">
                      <span className="text-slate-300 text-sm">
                        {st(language, 'picker.row')} {seat.row_label} - {st(language, 'picker.seatLabel')} {seat.seat_number}
                        {seat.seat_type === 'vip' && (
                          <span className="ml-1.5 text-[10px] font-bold text-amber-400">VIP</span>
                        )}
                      </span>
                      <span className="text-white font-medium text-sm tabular-nums">EUR {seat.price.toFixed(2)}</span>
                    </div>
                    {seat.ticket_code && (
                      <span className="font-mono text-[10px] text-cyan-400 mt-0.5 block select-all">{seat.ticket_code}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="border-t border-slate-800 px-5 py-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">{st(language, 'checkout.subtotal')}</span>
              <span className="text-slate-300 tabular-nums">EUR {subtotal.toFixed(2)}</span>
            </div>
            {serviceFeeVal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">{st(language, 'checkout.serviceFee')}</span>
                <span className="text-slate-300 tabular-nums">EUR {serviceFeeVal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-700">
              <span className="text-white">{st(language, 'checkout.totalLabel')}</span>
              <span className="text-white tabular-nums">EUR {totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <span>{st(language, 'confirm.emailSent')} <strong className="text-white">{order.payer_email}</strong></span>
          </div>
          <p className="text-slate-500 text-xs leading-relaxed">
            {st(language, 'confirm.keepOrderNumber')}
          </p>
        </div>

        {seats.some(s => s.qr_data) && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <Ticket className="w-5 h-5 text-slate-400" aria-hidden="true" />
              <h3 className="text-white font-semibold text-base">{st(language, 'confirm.yourTickets')}</h3>
            </div>
            <p className="text-slate-400 text-sm mb-5">{st(language, 'confirm.showQR') || 'Toon deze QR code(s) bij de ingang.'}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {seats.filter(s => s.qr_data).map(seat => (
                <div
                  key={seat.id}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex flex-col items-center gap-3"
                >
                  <QRCodeImage data={seat.qr_data!} size={160} />
                  <div className="text-center">
                    <p className="text-white text-sm font-medium">
                      {seat.section_name} — {st(language, 'picker.row')} {seat.row_label}, {st(language, 'picker.seatLabel')} {seat.seat_number}
                    </p>
                    {seat.ticket_code && (
                      <p className="font-mono text-xs text-cyan-400 mt-1 select-all">{seat.ticket_code}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <button
                onClick={handleDownloadPdf}
                disabled={pdfGenerating}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {pdfGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    PDF wordt gegenereerd...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" aria-hidden="true" />
                    Download Tickets (PDF)
                  </>
                )}
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                {st(language, 'confirm.printTickets') || 'Print tickets'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 print:hidden">
          <button
            onClick={() => onNavigate('home')}
            className="flex-1 py-3 border border-blue-500/50 text-blue-400 hover:bg-blue-500/10 font-medium rounded-xl transition-colors text-sm focus-ring"
          >
            {st(language, 'confirm.backToEvents')}
          </button>
          <button
            onClick={() => onNavigate(`seat-picker?event=${eventId}`)}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors text-sm focus-ring"
          >
            {st(language, 'confirm.buyMore')}
          </button>
          <button
            onClick={handleShare}
            className="flex-1 py-3 border border-slate-700 text-slate-300 hover:bg-slate-800 font-medium rounded-xl transition-colors text-sm flex items-center justify-center gap-2 focus-ring"
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
            {st(language, 'confirm.share')}
          </button>
        </div>
      </main>
    </div>
  );
}

export default SeatConfirmation;
