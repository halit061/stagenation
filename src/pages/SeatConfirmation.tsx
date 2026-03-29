import { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle, Copy, Calendar, MapPin, Share2, ArrowLeft, Download, Ticket } from 'lucide-react';
import {
  fetchOrderById,
  fetchOrderSeats,
  fetchSeatsForOrder,
  fetchSectionsForOrder,
} from '../services/seatCheckoutService';
import { fetchEventInfo } from '../services/seatPickerService';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

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

  const dateLocale = language === 'de' ? 'de-DE' : language === 'fr' ? 'fr-FR' : language === 'tr' ? 'tr-TR' : 'nl-NL';

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [orderData, ev] = await Promise.all([
          fetchOrderById(orderId),
          fetchEventInfo(eventId),
        ]);

        if (cancelled) return;
        if (!orderData || !ev) {
          setError(st(language, 'confirm.notFound'));
          setLoading(false);
          return;
        }

        setOrder(orderData as OrderData);
        setEventInfo(ev);

        const ticketSeats = await fetchOrderSeats(orderId);
        if (cancelled) return;

        const seatIds = ticketSeats.map((ts: any) => ts.seat_id);
        const seatData = await fetchSeatsForOrder(seatIds);
        if (cancelled) return;

        const sectionIds = [...new Set(seatData.map((s: any) => s.section_id))];
        const sectionData = await fetchSectionsForOrder(sectionIds as string[]);
        if (cancelled) return;

        const sectionMap = new Map(sectionData.map((s: any) => [s.id, s]));
        const seatInfos: SeatInfo[] = ticketSeats.map((ts: any) => {
          const seat = seatData.find((s: any) => s.id === ts.seat_id);
          const section = seat ? sectionMap.get(seat.section_id) : null;
          return {
            id: ts.id,
            row_label: seat?.row_label || '?',
            seat_number: seat?.seat_number || 0,
            seat_type: seat?.seat_type || 'regular',
            section_name: section?.name || st(language, 'confirm.unknown'),
            section_color: section?.color || '#64748b',
            price: Number(ts.price_paid),
          };
        });

        seatInfos.sort((a, b) =>
          a.section_name.localeCompare(b.section_name) ||
          a.row_label.localeCompare(b.row_label) ||
          a.seat_number - b.seat_number
        );

        setSeats(seatInfos);
        setLoading(false);
        setTimeout(() => setAnimReady(true), 100);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || st(language, 'confirm.notFound'));
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
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
      try {
        await navigator.share(shareData);
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    }
  }, [eventInfo, eventId]);

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
  const subtotal = order?.metadata?.subtotal ?? (order ? order.total_amount / 100 : 0);
  const serviceFeeVal = Number(order?.service_fee_amount ?? order?.metadata?.service_fee ?? 0);
  const totalAmount = order ? order.total_amount / 100 : 0;

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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="h-4 w-28 skeleton rounded mb-2 mx-auto" />
            <div className="h-6 w-36 skeleton rounded mx-auto" />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="h-5 w-44 skeleton rounded" />
            <div className="h-4 w-56 skeleton rounded" />
            <div className="h-4 w-40 skeleton rounded" />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 skeleton rounded-lg" />
            ))}
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
                  <div key={seat.id} className={`flex justify-between px-3 py-2 rounded-lg ${seat.seat_type === 'vip' ? 'bg-amber-500/5' : 'bg-slate-800/30'}`}>
                    <span className="text-slate-300 text-sm">
                      {st(language, 'picker.row')} {seat.row_label} - {st(language, 'picker.seatLabel')} {seat.seat_number}
                      {seat.seat_type === 'vip' && (
                        <span className="ml-1.5 text-[10px] font-bold text-amber-400">VIP</span>
                      )}
                    </span>
                    <span className="text-white font-medium text-sm tabular-nums">EUR {seat.price.toFixed(2)}</span>
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
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">{st(language, 'checkout.serviceFee')}</span>
              <span className="text-slate-300 tabular-nums">EUR {serviceFeeVal.toFixed(2)}</span>
            </div>
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

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Ticket className="w-5 h-5 text-slate-400" aria-hidden="true" />
            <h3 className="text-white font-semibold text-base">{st(language, 'confirm.yourTickets')}</h3>
          </div>
          <p className="text-slate-400 text-sm mb-4">{st(language, 'confirm.ticketsSoon')}</p>
          <div className="flex items-center justify-center mb-4">
            <div className="w-32 h-32 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700">
              <span className="text-slate-500 text-2xl font-mono font-bold">QR</span>
            </div>
          </div>
          <button
            disabled
            className="w-full py-3 bg-slate-800 text-slate-500 font-medium rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            {st(language, 'confirm.soonAvailable')}
          </button>
        </div>

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
