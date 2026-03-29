import { useMemo } from 'react';
import { Calendar, MapPin, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { PickerSeat, PriceCategory } from '../hooks/useSeatPickerState';
import type { SeatSection } from '../types/seats';

interface Props {
  eventName: string;
  eventDate: string;
  eventLocation: string;
  selectedSeats: PickerSeat[];
  sections: SeatSection[];
  priceCategories: PriceCategory[];
  serviceFee: number;
  totalPrice: number;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onChangeSeats: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function CheckoutOrderSummary({
  eventName,
  eventDate,
  eventLocation,
  selectedSeats,
  sections,
  priceCategories,
  serviceFee,
  totalPrice,
  submitting,
  canSubmit,
  onSubmit,
  onChangeSeats,
  collapsed,
  onToggleCollapse,
}: Props) {
  const seatsBySection = useMemo(() => {
    const grouped: Record<string, { section: SeatSection; seats: PickerSeat[] }> = {};
    for (const seat of selectedSeats) {
      const section = sections.find(s => s.id === seat.sectionId);
      if (!section) continue;
      if (!grouped[section.id]) {
        grouped[section.id] = { section, seats: [] };
      }
      grouped[section.id].seats.push(seat);
    }
    return Object.values(grouped);
  }, [selectedSeats, sections]);

  const priceBreakdown = useMemo(() => {
    const breakdown: { name: string; count: number; unitPrice: number; subtotal: number }[] = [];
    for (const cat of priceCategories) {
      const catSeats = selectedSeats.filter(s => cat.sectionIds.includes(s.sectionId));
      if (catSeats.length === 0) continue;
      breakdown.push({
        name: cat.name,
        count: catSeats.length,
        unitPrice: cat.price,
        subtotal: catSeats.reduce((sum, seat) => {
          const sec = sections.find(s => s.id === seat.sectionId);
          return sum + (seat.price_override ?? (sec ? Number(sec.price_amount) : 0));
        }, 0),
      });
    }
    return breakdown;
  }, [priceCategories, selectedSeats, sections]);

  const subtotal = priceBreakdown.reduce((s, b) => s + b.subtotal, 0);

  const formattedDate = useMemo(() => {
    if (!eventDate) return '';
    const d = new Date(eventDate);
    return d.toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [eventDate]);

  if (collapsed !== undefined && onToggleCollapse) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <span className="text-white font-medium text-sm">
            {selectedSeats.length} stoel{selectedSeats.length !== 1 ? 'en' : ''} — EUR {totalPrice.toFixed(2)}
          </span>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          )}
        </button>
        {!collapsed && renderContent()}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl sticky top-[80px]">
      {renderContent()}
    </div>
  );

  function renderContent() {
    return (
      <div className="divide-y divide-slate-800">
        <div className="px-5 py-4">
          <h3 className="text-white font-bold text-lg leading-tight">{eventName}</h3>
          {formattedDate && (
            <p className="flex items-center gap-1.5 text-slate-400 text-sm mt-1.5">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              {formattedDate}
            </p>
          )}
          {eventLocation && (
            <p className="flex items-center gap-1.5 text-slate-400 text-sm mt-1">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {eventLocation}
            </p>
          )}
        </div>

        <div className="px-5 py-4 space-y-3">
          {seatsBySection.map(({ section, seats }) => (
            <div key={section.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: section.color }}
                />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {section.name}
                </span>
              </div>
              <div className="space-y-1 ml-4">
                {seats
                  .sort((a, b) => a.row_label.localeCompare(b.row_label) || a.seat_number - b.seat_number)
                  .map(seat => {
                    const price = seat.price_override ?? Number(section.price_amount);
                    return (
                      <div key={seat.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-300">
                            Rij {seat.row_label} - Stoel {seat.seat_number}
                          </span>
                          {seat.seat_type === 'vip' && (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                              VIP
                            </span>
                          )}
                          {seat.seat_type === 'restricted_view' && (
                            <span className="text-slate-500 text-xs">(beperkt zicht)</span>
                          )}
                        </div>
                        <span className="text-white font-medium tabular-nums">
                          EUR {price.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 space-y-2">
          {priceBreakdown.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{item.count}x {item.name}</span>
              <span className="text-slate-300 tabular-nums">EUR {item.subtotal.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Subtotaal</span>
            <span className="text-slate-300 tabular-nums">EUR {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Servicekosten</span>
            <span className="text-slate-300 tabular-nums">EUR {serviceFee.toFixed(2)}</span>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-bold text-lg">TOTAAL</span>
            <span className="text-white font-bold text-xl tabular-nums">EUR {totalPrice.toFixed(2)}</span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">Inclusief BTW</p>
        </div>

        <div className="px-5 py-4 space-y-3 hidden lg:block">
          <button
            type="button"
            onClick={onSubmit}
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
          <button
            type="button"
            onClick={onChangeSeats}
            className="w-full text-center text-sm text-slate-400 hover:text-blue-400 transition-colors"
          >
            Andere stoelen kiezen?
          </button>
        </div>
      </div>
    );
  }
}
