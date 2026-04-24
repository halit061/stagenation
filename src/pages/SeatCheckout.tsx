import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import {
  fetchLayoutByEvent,
  fetchSections,
  fetchSeats,
  fetchEventInfo,
  loadHoldFromStorage,
  clearHoldStorage,
  getSessionId,
  releaseSessionHolds,
} from '../services/seatPickerService';
import { createSeatOrder, fetchServiceFeeForSections } from '../services/seatCheckoutService';
import { CheckoutForm } from '../components/CheckoutForm';
import { CheckoutOrderSummary } from '../components/CheckoutOrderSummary';
import { HoldTimerBar } from '../components/HoldTimerBar';
import { HoldExpiredModal } from '../components/HoldExpiredModal';
import { NavigationGuard } from '../components/NavigationGuard';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';
import type { CheckoutFormData, CheckoutFormErrors } from '../components/CheckoutForm';
import type { PickerSeat, PriceCategory } from '../hooks/useSeatPickerState';
import type { SeatSection, Seat } from '../types/seats';

interface Props {
  eventId: string;
  onNavigate: (page: string) => void;
}

const HEADER_H = 24;
const PAD = 10;

function computePickerSeat(section: SeatSection, seat: Seat, allSeats: Seat[]): PickerSeat {
  const sx = section.position_x;
  const sy = section.position_y;
  const sw = section.width;
  const sh = section.height;
  const bodyTop = sy + HEADER_H + PAD;
  const bodyH = sh - HEADER_H - PAD * 2;
  const bodyW = sw - PAD * 2;
  const centerX = sx + sw / 2;

  const secSeats = allSeats.filter(s => s.section_id === section.id);
  const minX = Math.min(...secSeats.map(s => s.x_position));
  const maxX = Math.max(...secSeats.map(s => s.x_position));
  const minY = Math.min(...secSeats.map(s => s.y_position));
  const maxY = Math.max(...secSeats.map(s => s.y_position));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const useScaling = rangeX > bodyW || rangeY > bodyH;
  const scaleX = bodyW / rangeX;
  const scaleY = bodyH / rangeY;

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
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[a-zA-ZÀ-ÿ\s'-]+$/;

function validateField(field: keyof CheckoutFormData, data: CheckoutFormData, lang: string | null): string | undefined {
  switch (field) {
    case 'firstName':
      if (!data.firstName.trim()) return st(lang as any, 'validation.firstNameRequired');
      if (data.firstName.trim().length < 2) return st(lang as any, 'validation.firstNameRequired');
      if (!NAME_RE.test(data.firstName.trim())) return st(lang as any, 'validation.firstNameInvalid');
      return undefined;
    case 'lastName':
      if (!data.lastName.trim()) return st(lang as any, 'validation.lastNameRequired');
      if (data.lastName.trim().length < 2) return st(lang as any, 'validation.lastNameRequired');
      return undefined;
    case 'email':
      if (!data.email.trim()) return st(lang as any, 'validation.emailRequired');
      if (!EMAIL_RE.test(data.email.trim())) return st(lang as any, 'validation.emailInvalid');
      return undefined;
    case 'emailConfirm':
      if (!data.emailConfirm.trim()) return st(lang as any, 'validation.emailConfirmRequired');
      if (data.emailConfirm.trim().toLowerCase() !== data.email.trim().toLowerCase())
        return st(lang as any, 'validation.emailMismatch');
      return undefined;
    case 'phone':
      if (data.phone.trim() && data.phone.replace(/\D/g, '').length < 9)
        return st(lang as any, 'validation.phoneInvalid');
      return undefined;
    case 'paymentMethod':
      if (!data.paymentMethod) return st(lang as any, 'validation.paymentRequired');
      return undefined;
    case 'termsAccepted':
      if (!data.termsAccepted) return st(lang as any, 'validation.termsRequired');
      return undefined;
    default:
      return undefined;
  }
}

function validateAll(data: CheckoutFormData, lang: string | null): CheckoutFormErrors {
  const errors: CheckoutFormErrors = {};
  const fields: (keyof CheckoutFormData)[] = ['firstName', 'lastName', 'email', 'emailConfirm', 'phone', 'paymentMethod', 'termsAccepted'];
  for (const f of fields) {
    const err = validateField(f, data, lang);
    if (err) (errors as any)[f] = err;
  }
  return errors;
}

export function SeatCheckout({ eventId, onNavigate }: Props) {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [eventInfo, setEventInfo] = useState<any>(null);
  const [sections, setSections] = useState<SeatSection[]>([]);
  const [heldSeats, setHeldSeats] = useState<PickerSeat[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [holdExtended, setHoldExtended] = useState(false);
  const [holdExpired, setHoldExpired] = useState(false);
  const [showNavGuard, setShowNavGuard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feePerTicket, setFeePerTicket] = useState(0);
  const [ticketTypeId, setTicketTypeId] = useState<string | null>(null);
  const [summaryCollapsed, setSummaryCollapsed] = useState(true);
  const [sectionTicketPrices, setSectionTicketPrices] = useState<Map<string, number>>(new Map());
  const [seatTicketTypePrices, setSeatTicketTypePrices] = useState<Map<string, number>>(new Map());
  const [ticketTypeNames, setTicketTypeNames] = useState<Map<string, string>>(new Map());
  const [ticketTypeColors, setTicketTypeColors] = useState<Map<string, string>>(new Map());

  const [formData, setFormData] = useState<CheckoutFormData>({
    firstName: '',
    lastName: '',
    email: '',
    emailConfirm: '',
    phone: '',
    paymentMethod: '',
    notes: '',
    termsAccepted: false,
  });
  const [errors, setErrors] = useState<CheckoutFormErrors>({});
  const [touched, setTouched] = useState<Set<keyof CheckoutFormData>>(new Set());

  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const stored = loadHoldFromStorage();
      if (!stored || stored.event_id !== eventId) {
        onNavigate(`seat-picker?event=${eventId}`);
        return;
      }

      const remaining = new Date(stored.expires_at).getTime() - Date.now();
      if (remaining <= 0) {
        clearHoldStorage();
        onNavigate(`seat-picker?event=${eventId}`);
        return;
      }

      setExpiresAt(stored.expires_at);
      setHoldExtended(stored.extended);

      try {
        const [ev, layoutData] = await Promise.all([
          fetchEventInfo(eventId),
          fetchLayoutByEvent(eventId),
        ]);

        if (cancelled) return;
        if (!ev || !layoutData) {
          onNavigate(`seat-picker?event=${eventId}`);
          return;
        }

        setEventInfo(ev);

        const secs = await fetchSections(layoutData.id);
        if (cancelled) return;
        setSections(secs);

        try {
          const { fetchTicketTypePricesForSections } = await import('../services/seatPickerService');
          const ttPrices = await fetchTicketTypePricesForSections(secs.map(s => s.id));
          if (!cancelled) {
            const priceMap = new Map<string, number>();
            ttPrices.forEach((val, key) => {
              priceMap.set(key, val.price);
            });
            setSectionTicketPrices(priceMap);
          }
        } catch {}

        const seatData = await fetchSeats(secs.map(s => s.id));
        if (cancelled) return;

        const sessionId = getSessionId();
        const { data: activeHolds } = await supabase
          .from('seat_holds')
          .select('id, seat_id')
          .eq('session_id', sessionId)
          .eq('event_id', eventId)
          .eq('status', 'held')
          .limit(10000);

        if (cancelled) return;
        if (!activeHolds || activeHolds.length === 0) {
          clearHoldStorage();
          onNavigate(`seat-picker?event=${eventId}`);
          return;
        }

        const heldSeatIds = new Set(activeHolds.map((h: any) => h.seat_id));
        const held: PickerSeat[] = [];
        for (const sec of secs) {
          const secSeats = seatData.filter(s => s.section_id === sec.id);
          for (const seat of secSeats) {
            if (heldSeatIds.has(seat.id)) {
              held.push(computePickerSeat(sec, seat, seatData));
            }
          }
        }

        if (held.length === 0) {
          clearHoldStorage();
          onNavigate(`seat-picker?event=${eventId}`);
          return;
        }

        setHeldSeats(held);

        const ttIds = [...new Set(held.map(s => s.ticket_type_id).filter(Boolean))] as string[];
        if (ttIds.length > 0) {
          const { data: ttData } = await supabase
            .from('ticket_types')
            .select('id, name, price, color, service_fee_mode, service_fee_fixed, service_fee_percent')
            .in('id', ttIds)
            .limit(100);
          if (ttData && !cancelled) {
            const priceMap = new Map<string, number>();
            const nameMap = new Map<string, string>();
            const colorMap = new Map<string, string>();
            ttData.forEach((tt: any) => {
              priceMap.set(tt.id, (tt.price || 0) / 100);
              if (tt.name) nameMap.set(tt.id, tt.name);
              if (tt.color) colorMap.set(tt.id, tt.color);
            });
            setSeatTicketTypePrices(priceMap);
            setTicketTypeNames(nameMap);
            setTicketTypeColors(colorMap);

            const firstTt = ttData[0] as any;
            if (firstTt) {
              const mode = firstTt.service_fee_mode || 'none';
              if (mode === 'fixed') {
                setFeePerTicket(Number(firstTt.service_fee_fixed) || 0);
              } else if (mode === 'percent') {
                const pct = Number(firstTt.service_fee_percent) || 0;
                const price = (Number(firstTt.price) || 0) / 100;
                setFeePerTicket(Math.round(price * pct / 100 * 100) / 100);
              }
            }
          }
        }

        if (ttIds.length === 0) {
          const sectionIds = [...new Set(held.map(s => s.sectionId))];
          try {
            const feeInfo = await fetchServiceFeeForSections(sectionIds, eventId);
            if (!cancelled) {
              setFeePerTicket(feeInfo.feePerTicket);
            }
          } catch {}
        }

        const storedHold = loadHoldFromStorage();
        const ttId = storedHold?.ticket_type_id || null;
        if (ttId) setTicketTypeId(ttId);

        setLoading(false);

        if (typeof window.fbq === 'function') {
          window.fbq('track', 'InitiateCheckout', {
            content_ids: [eventId],
            content_type: 'product',
            content_name: ev?.name || 'Event',
            num_items: held.length,
          });
        }
      } catch {
        if (!cancelled) {
          onNavigate(`seat-picker?event=${eventId}`);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [eventId, onNavigate]);

  const priceCategories = useMemo<PriceCategory[]>(() => {
    const categories: PriceCategory[] = [];
    const seen = new Set<string>();

    for (const seat of heldSeats) {
      const ttId = seat.ticket_type_id;
      if (!ttId || seen.has(ttId)) continue;
      seen.add(ttId);
      const price = seatTicketTypePrices.get(ttId) ?? 0;
      const name = ticketTypeNames.get(ttId) ?? ttId;
      const color = ticketTypeColors.get(ttId) ?? '#64748b';
      const sectionIds = heldSeats
        .filter(s => s.ticket_type_id === ttId)
        .map(s => s.sectionId)
        .filter((v, i, a) => a.indexOf(v) === i);
      categories.push({ id: ttId, name, color, price, sectionIds });
    }

    if (categories.length === 0) {
      return sections.reduce<PriceCategory[]>((acc, sec) => {
        const key = sec.price_category || sec.name;
        const existing = acc.find(c => c.id === key);
        const sectionPrice = Number(sec.price_amount) || 0;
        const ttPrice = sectionTicketPrices.get(sec.id) ?? 0;
        const resolvedPrice = sectionPrice > 0 ? sectionPrice : ttPrice;
        if (existing) {
          existing.sectionIds.push(sec.id);
        } else {
          acc.push({ id: key, name: sec.price_category || sec.name, color: sec.color, price: resolvedPrice, sectionIds: [sec.id] });
        }
        return acc;
      }, []);
    }

    return categories;
  }, [heldSeats, sections, sectionTicketPrices, seatTicketTypePrices, ticketTypeNames, ticketTypeColors]);

  const subtotal = useMemo(() => {
    return heldSeats.reduce((total, seat) => {
      if (seat.price_override != null && seat.price_override > 0) {
        return total + seat.price_override;
      }
      if (seat.ticket_type_id && seatTicketTypePrices.has(seat.ticket_type_id)) {
        return total + seatTicketTypePrices.get(seat.ticket_type_id)!;
      }
      const section = sections.find(s => s.id === seat.sectionId);
      const sectionPrice = section ? Number(section.price_amount) : 0;
      if (sectionPrice > 0) return total + sectionPrice;
      const ttPrice = sectionTicketPrices.get(seat.sectionId) ?? 0;
      return total + ttPrice;
    }, 0);
  }, [heldSeats, sections, sectionTicketPrices, seatTicketTypePrices]);

  const serviceFee = feePerTicket * heldSeats.length;
  const totalPrice = subtotal + serviceFee;

  const seatPrices = useMemo(() => {
    return heldSeats.map(seat => {
      if (seat.price_override != null && seat.price_override > 0) {
        return seat.price_override;
      }
      if (seat.ticket_type_id && seatTicketTypePrices.has(seat.ticket_type_id)) {
        return seatTicketTypePrices.get(seat.ticket_type_id)!;
      }
      const section = sections.find(s => s.id === seat.sectionId);
      const sectionPrice = section ? Number(section.price_amount) : 0;
      if (sectionPrice > 0) return sectionPrice;
      return sectionTicketPrices.get(seat.sectionId) ?? 0;
    });
  }, [heldSeats, sections, sectionTicketPrices, seatTicketTypePrices]);

  const handleFieldChange = useCallback((field: keyof CheckoutFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setSubmitError(null);

    if (touched.has(field)) {
      setErrors(prev => {
        const updated = { ...prev };
        const newData = { ...formData, [field]: value } as CheckoutFormData;
        const err = validateField(field, newData, language);
        if (err) (updated as any)[field] = err;
        else delete (updated as any)[field];

        if (field === 'email' && touched.has('emailConfirm')) {
          const emailErr = validateField('emailConfirm', newData, language);
          if (emailErr) updated.emailConfirm = emailErr;
          else delete updated.emailConfirm;
        }

        return updated;
      });
    }
  }, [formData, touched, language]);

  const handleValidateField = useCallback((field: keyof CheckoutFormData) => {
    setTouched(prev => new Set(prev).add(field));
    const err = validateField(field, formData, language);
    setErrors(prev => {
      const updated = { ...prev };
      if (err) (updated as any)[field] = err;
      else delete (updated as any)[field];
      return updated;
    });
  }, [formData, language]);

  const canSubmit = useMemo(() => {
    const allErrors = validateAll(formData, language);
    return Object.keys(allErrors).length === 0;
  }, [formData, language]);

  const handleHoldExpired = useCallback(() => {
    setHoldExpired(true);
    clearHoldStorage();
    releaseSessionHolds(eventId).catch(() => {});
  }, [eventId]);

  const handleExtendHold = useCallback(async () => {
    if (holdExtended) return;
    try {
      const { extendHolds } = await import('../services/seatPickerService');
      const result = await extendHolds(eventId);
      if (result.success && result.expires_at) {
        setExpiresAt(result.expires_at);
        setHoldExtended(true);
        const stored = loadHoldFromStorage();
        if (stored) {
          const { saveHoldToStorage } = await import('../services/seatPickerService');
          saveHoldToStorage({ ...stored, expires_at: result.expires_at, extended: true });
        }
      }
    } catch {}
  }, [eventId, holdExtended]);

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;

    const allErrors = validateAll(formData, language);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      setTouched(new Set(['firstName', 'lastName', 'email', 'emailConfirm', 'phone', 'paymentMethod', 'termsAccepted']));

      const fieldOrder: (keyof CheckoutFormData)[] = ['firstName', 'lastName', 'email', 'emailConfirm', 'phone', 'paymentMethod', 'termsAccepted'];
      for (const f of fieldOrder) {
        if (allErrors[f as keyof CheckoutFormErrors]) {
          const el = document.getElementById(f === 'termsAccepted' ? 'firstName' : f);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
      return;
    }

    const stored = loadHoldFromStorage();
    if (!stored || new Date(stored.expires_at).getTime() <= Date.now()) {
      setHoldExpired(true);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const sessionId = getSessionId();
      const { data: activeHolds } = await supabase
        .from('seat_holds')
        .select('id, seat_id')
        .eq('session_id', sessionId)
        .eq('event_id', eventId)
        .eq('status', 'held')
        .limit(10000);

      if (!activeHolds || activeHolds.length === 0) {
        setHoldExpired(true);
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }

      const result = await createSeatOrder({
        eventId,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        subtotal,
        serviceFee,
        totalAmount: totalPrice,
        paymentMethod: formData.paymentMethod,
        notes: formData.notes.trim(),
        seatIds: heldSeats.map(s => s.id),
        seatPrices,
        ticketTypeId: ticketTypeId || undefined,
      });

      if (result.success && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      } else if (result.error === 'holds_expired') {
        setHoldExpired(true);
      } else {
        setSubmitError(result.error || st(language, 'confirm.submitError'));
      }
    } catch {
      setSubmitError(st(language, 'confirm.submitErrorRetry'));
    }

    submittingRef.current = false;
    setSubmitting(false);
  }, [formData, eventId, heldSeats, seatPrices, subtotal, serviceFee, totalPrice, ticketTypeId, onNavigate, language]);

  const handleBack = useCallback(() => {
    setShowNavGuard(true);
  }, []);

  const handleNavKeep = useCallback(() => {
    setShowNavGuard(false);
    onNavigate(`seat-picker?event=${eventId}`);
  }, [onNavigate, eventId]);

  const handleNavCancel = useCallback(async () => {
    setShowNavGuard(false);
    await releaseSessionHolds(eventId).catch(() => {});
    onNavigate(`seat-picker?event=${eventId}`);
  }, [onNavigate, eventId]);

  const handleNavStay = useCallback(() => {
    setShowNavGuard(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col" role="status" aria-label={st(language, 'checkout.loading')}>
        <div className="h-12 bg-slate-900/80 border-b border-slate-800" />
        <div className="h-14 bg-slate-900/80 border-b border-slate-800 flex items-center px-4 gap-3">
          <div className="w-8 h-8 skeleton rounded-lg" />
          <div className="space-y-1.5">
            <div className="h-4 w-28 skeleton rounded" />
            <div className="h-3 w-40 skeleton rounded" />
          </div>
        </div>
        <div className="max-w-5xl w-full mx-auto px-4 py-6 flex gap-8">
          <div className="flex-1 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
              <div className="h-5 w-32 skeleton rounded" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-12 skeleton rounded-lg" />
                <div className="h-12 skeleton rounded-lg" />
              </div>
              <div className="h-12 skeleton rounded-lg" />
              <div className="h-12 skeleton rounded-lg" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="h-5 w-36 skeleton rounded" />
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-14 skeleton rounded-xl" />
                ))}
              </div>
            </div>
          </div>
          <div className="hidden lg:block w-[40%]">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="h-5 w-40 skeleton rounded" />
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-4 skeleton rounded" />
                ))}
              </div>
              <div className="h-12 skeleton rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {expiresAt && (
        <HoldTimerBar
          expiresAt={expiresAt}
          extended={holdExtended}
          onExpired={handleHoldExpired}
          onExtend={handleExtendHold}
        />
      )}

      <header className={`flex-shrink-0 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-4 py-3 z-20 ${expiresAt ? 'pt-14' : ''}`}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800 focus-ring"
            aria-label={st(language, 'picker.backHome')}
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-white font-bold text-base">{st(language, 'checkout.title')}</h1>
            <p className="text-slate-400 text-xs">{eventInfo?.name}</p>
          </div>
        </div>
      </header>

      <div className="lg:hidden px-4 pt-4">
        <CheckoutOrderSummary
          eventName={eventInfo?.name || ''}
          eventDate={eventInfo?.start_date || ''}
          eventLocation={eventInfo?.venue_name || eventInfo?.location || ''}
          selectedSeats={heldSeats}
          sections={sections}
          priceCategories={priceCategories}
          serviceFee={serviceFee}
          feePerTicket={feePerTicket}
          totalPrice={totalPrice}
          submitting={submitting}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          onChangeSeats={handleBack}
          collapsed={summaryCollapsed}
          onToggleCollapse={() => setSummaryCollapsed(prev => !prev)}
          ticketTypePriceMap={seatTicketTypePrices}
          ticketTypeNameMap={ticketTypeNames}
          ticketTypeColorMap={ticketTypeColors}
        />
      </div>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <div className="flex gap-8">
          <div className="flex-1 min-w-0 lg:max-w-[60%]">
            <CheckoutForm
              formData={formData}
              errors={errors}
              onChange={handleFieldChange}
              onValidateField={handleValidateField}
            />

            {submitError && (
              <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm" role="alert">
                {submitError}
              </div>
            )}
          </div>

          <div className="hidden lg:block w-[40%] flex-shrink-0">
            <CheckoutOrderSummary
              eventName={eventInfo?.name || ''}
              eventDate={eventInfo?.start_date || ''}
              eventLocation={eventInfo?.venue_name || eventInfo?.location || ''}
              selectedSeats={heldSeats}
              sections={sections}
              priceCategories={priceCategories}
              serviceFee={serviceFee}
              feePerTicket={feePerTicket}
              totalPrice={totalPrice}
              submitting={submitting}
              canSubmit={canSubmit}
              onSubmit={handleSubmit}
              onChangeSeats={handleBack}
              ticketTypePriceMap={seatTicketTypePrices}
              ticketTypeNameMap={ticketTypeNames}
              ticketTypeColorMap={ticketTypeColors}
            />
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-slate-900 border-t border-slate-800 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className={`w-full py-3.5 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2 focus-ring ${
            canSubmit && !submitting
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              {st(language, 'checkout.processing')}
            </>
          ) : (
            `${st(language, 'checkout.placeOrder')} — EUR ${totalPrice.toFixed(2)}`
          )}
        </button>
      </div>

      <div className="lg:hidden h-[72px]" />

      {holdExpired && (
        <HoldExpiredModal
          onRestart={() => {
            clearHoldStorage();
            onNavigate(`seat-picker?event=${eventId}`);
          }}
          onClose={() => onNavigate(`seat-picker?event=${eventId}`)}
        />
      )}

      <NavigationGuard
        active={!holdExpired && !!expiresAt && !submitting}
        visible={showNavGuard}
        onKeepSeats={handleNavKeep}
        onCancel={handleNavCancel}
        onStay={handleNavStay}
      />
    </div>
  );
}

export default SeatCheckout;
