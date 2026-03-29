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
import { createSeatOrder } from '../services/seatCheckoutService';
import { CheckoutForm } from '../components/CheckoutForm';
import { CheckoutOrderSummary } from '../components/CheckoutOrderSummary';
import { HoldTimerBar } from '../components/HoldTimerBar';
import { HoldExpiredModal } from '../components/HoldExpiredModal';
import { NavigationGuard } from '../components/NavigationGuard';
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

function validateField(field: keyof CheckoutFormData, data: CheckoutFormData): string | undefined {
  switch (field) {
    case 'firstName':
      if (!data.firstName.trim()) return 'Vul je voornaam in';
      if (data.firstName.trim().length < 2) return 'Vul je voornaam in';
      if (!NAME_RE.test(data.firstName.trim())) return 'Vul een geldige voornaam in';
      return undefined;
    case 'lastName':
      if (!data.lastName.trim()) return 'Vul je achternaam in';
      if (data.lastName.trim().length < 2) return 'Vul je achternaam in';
      return undefined;
    case 'email':
      if (!data.email.trim()) return 'Vul een geldig e-mailadres in';
      if (!EMAIL_RE.test(data.email.trim())) return 'Vul een geldig e-mailadres in';
      return undefined;
    case 'emailConfirm':
      if (!data.emailConfirm.trim()) return 'Bevestig je e-mailadres';
      if (data.emailConfirm.trim().toLowerCase() !== data.email.trim().toLowerCase())
        return 'E-mailadressen komen niet overeen';
      return undefined;
    case 'phone':
      if (data.phone.trim() && data.phone.replace(/\D/g, '').length < 9)
        return 'Vul een geldig telefoonnummer in';
      return undefined;
    case 'paymentMethod':
      if (!data.paymentMethod) return 'Kies een betaalmethode';
      return undefined;
    case 'termsAccepted':
      if (!data.termsAccepted) return 'Je moet akkoord gaan met de voorwaarden';
      return undefined;
    default:
      return undefined;
  }
}

function validateAll(data: CheckoutFormData): CheckoutFormErrors {
  const errors: CheckoutFormErrors = {};
  const fields: (keyof CheckoutFormData)[] = ['firstName', 'lastName', 'email', 'emailConfirm', 'phone', 'paymentMethod', 'termsAccepted'];
  for (const f of fields) {
    const err = validateField(f, data);
    if (err) (errors as any)[f] = err;
  }
  return errors;
}

export function SeatCheckout({ eventId, onNavigate }: Props) {
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
  const [summaryCollapsed, setSummaryCollapsed] = useState(true);

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

        const seatData = await fetchSeats(secs.map(s => s.id));
        if (cancelled) return;

        const sessionId = getSessionId();
        const { data: activeHolds } = await supabase
          .from('seat_holds')
          .select('id, seat_id')
          .eq('session_id', sessionId)
          .eq('event_id', eventId)
          .eq('status', 'held');

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
        setLoading(false);
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
    return sections.reduce<PriceCategory[]>((acc, sec) => {
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
  }, [sections]);

  const subtotal = useMemo(() => {
    return heldSeats.reduce((total, seat) => {
      const section = sections.find(s => s.id === seat.sectionId);
      return total + (seat.price_override ?? (section ? Number(section.price_amount) : 0));
    }, 0);
  }, [heldSeats, sections]);

  const serviceFee = 0;
  const totalPrice = subtotal + serviceFee;

  const seatPrices = useMemo(() => {
    return heldSeats.map(seat => {
      const section = sections.find(s => s.id === seat.sectionId);
      return seat.price_override ?? (section ? Number(section.price_amount) : 0);
    });
  }, [heldSeats, sections]);

  const handleFieldChange = useCallback((field: keyof CheckoutFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setSubmitError(null);

    if (touched.has(field)) {
      setErrors(prev => {
        const updated = { ...prev };
        const newData = { ...formData, [field]: value } as CheckoutFormData;
        const err = validateField(field, newData);
        if (err) (updated as any)[field] = err;
        else delete (updated as any)[field];

        if (field === 'email' && touched.has('emailConfirm')) {
          const emailErr = validateField('emailConfirm', newData);
          if (emailErr) updated.emailConfirm = emailErr;
          else delete updated.emailConfirm;
        }

        return updated;
      });
    }
  }, [formData, touched]);

  const handleValidateField = useCallback((field: keyof CheckoutFormData) => {
    setTouched(prev => new Set(prev).add(field));
    const err = validateField(field, formData);
    setErrors(prev => {
      const updated = { ...prev };
      if (err) (updated as any)[field] = err;
      else delete (updated as any)[field];
      return updated;
    });
  }, [formData]);

  const canSubmit = useMemo(() => {
    const allErrors = validateAll(formData);
    return Object.keys(allErrors).length === 0;
  }, [formData]);

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

    const allErrors = validateAll(formData);
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
        .eq('status', 'held');

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
      });

      if (result.success && result.order_id) {
        onNavigate(`seat-confirmation?event=${eventId}&order=${result.order_id}`);
      } else if (result.error === 'holds_expired') {
        setHoldExpired(true);
      } else {
        setSubmitError(result.error || 'Er ging iets mis bij het verwerken van je bestelling. Probeer het opnieuw.');
      }
    } catch (err: any) {
      setSubmitError('Er ging iets mis bij het verwerken van je bestelling. Je stoelen zijn nog steeds gereserveerd. Probeer het opnieuw.');
    }

    submittingRef.current = false;
    setSubmitting(false);
  }, [formData, eventId, heldSeats, seatPrices, subtotal, totalPrice, onNavigate]);

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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin" />
          </div>
          <p className="text-slate-400 text-sm">Checkout laden...</p>
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
            className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-white font-bold text-base">Checkout</h1>
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
          totalPrice={totalPrice}
          submitting={submitting}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          onChangeSeats={handleBack}
          collapsed={summaryCollapsed}
          onToggleCollapse={() => setSummaryCollapsed(prev => !prev)}
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
              <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
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
              totalPrice={totalPrice}
              submitting={submitting}
              canSubmit={canSubmit}
              onSubmit={handleSubmit}
              onChangeSeats={handleBack}
            />
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-slate-900 border-t border-slate-800 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className={`w-full py-3.5 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2 ${
            canSubmit && !submitting
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Bestelling wordt verwerkt...
            </>
          ) : (
            `Bestelling Plaatsen — EUR ${totalPrice.toFixed(2)}`
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
        active={!holdExpired && !!expiresAt}
        visible={showNavGuard}
        onKeepSeats={handleNavKeep}
        onCancel={handleNavCancel}
        onStay={handleNavStay}
      />
    </div>
  );
}

export default SeatCheckout;
