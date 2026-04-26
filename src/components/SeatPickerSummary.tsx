import { memo } from 'react';
import { X, ShoppingCart, Clock, Loader2, AlertTriangle } from 'lucide-react';
import type { SeatSection } from '../types/seats';
import type { PickerSeat } from '../hooks/useSeatPickerState';
import { SeatPickerCountdown } from './SeatPickerCountdown';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

interface Props {
  selectedSeats: PickerSeat[];
  sections: SeatSection[];
  sectionTicketPrices?: Map<string, { ttName: string; price: number }>;
  ticketTypePriceMap?: Map<string, number>;
  totalPrice: number;
  serviceFee: number;
  feePerTicket: number;
  maxSeats: number;
  holdIds: string[];
  expiresAt: string | null;
  holdLoading: boolean;
  holdError: string | null;
  onRemoveSeat: (seatId: string) => void;
  onClear: () => void;
  onConfirmHold: () => void;
  onReleaseHold: () => void;
  onExpired: () => void;
  onNavigateCheckout: () => void;
}

export const SeatPickerSummary = memo(function SeatPickerSummary({
  selectedSeats,
  sections,
  sectionTicketPrices,
  ticketTypePriceMap,
  totalPrice,
  serviceFee,
  feePerTicket,
  maxSeats,
  holdIds,
  expiresAt,
  holdLoading,
  holdError,
  onRemoveSeat,
  onClear,
  onConfirmHold,
  onReleaseHold,
  onExpired,
  onNavigateCheckout,
}: Props) {
  const { language } = useLanguage();
  const isHeld = holdIds.length > 0 && expiresAt;

  function getSeatPrice(seat: PickerSeat) {
    if (seat.price_override != null) return seat.price_override;
    if (seat.ticket_type_id && ticketTypePriceMap?.has(seat.ticket_type_id)) {
      return ticketTypePriceMap.get(seat.ticket_type_id)!;
    }
    const section = sections.find(s => s.id === seat.sectionId);
    const sectionPrice = section ? Number(section.price_amount) : 0;
    if (sectionPrice > 0) return sectionPrice;
    const ttInfo = sectionTicketPrices?.get(seat.sectionId);
    return ttInfo?.price ?? 0;
  }

  function getSectionName(sectionId: string) {
    return sections.find(s => s.id === sectionId)?.name || '';
  }

  const groupedBySection = selectedSeats.reduce<Record<string, PickerSeat[]>>((acc, seat) => {
    const name = getSectionName(seat.sectionId);
    if (!acc[name]) acc[name] = [];
    acc[name].push(seat);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-blue-400" aria-hidden="true" />
          <h3 className="text-white font-semibold text-sm">
            {st(language, 'summary.yourSeats')}
          </h3>
          <span className="text-slate-400 text-xs">
            ({selectedSeats.length}/{maxSeats})
          </span>
        </div>
        {selectedSeats.length > 0 && !isHeld && (
          <button
            onClick={onClear}
            className="text-slate-400 hover:text-white text-xs transition-colors"
          >
            {st(language, 'summary.clearAll')}
          </button>
        )}
      </div>

      {isHeld && expiresAt && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
          <SeatPickerCountdown
            expiresAt={expiresAt}
            onExpired={onExpired}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 scrollbar-thin">
        {selectedSeats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
              <ShoppingCart className="w-5 h-5 text-slate-500" aria-hidden="true" />
            </div>
            <p className="text-slate-400 text-sm">{st(language, 'summary.selectSeats')}</p>
            <p className="text-slate-500 text-xs mt-1">{st(language, 'summary.maxSeats', { max: maxSeats })}</p>
          </div>
        ) : (
          Object.entries(groupedBySection).map(([sectionName, seats]) => (
            <div key={sectionName}>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                {sectionName}
              </p>
              <div className="space-y-1">
                {seats
                  .sort((a, b) => a.row_label.localeCompare(b.row_label) || a.seat_number - b.seat_number)
                  .map(seat => (
                  <div
                    key={seat.id}
                    className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2 group hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                      <div>
                        <span className="text-white text-sm font-medium">
                          {st(language, 'picker.row')} {seat.row_label} - {st(language, 'picker.seatLabel')} {seat.seat_number}
                        </span>
                        {seat.seat_type !== 'regular' && (
                          <span className="ml-1.5 text-xs text-amber-400">
                            {seat.seat_type === 'vip' ? 'VIP' : seat.seat_type === 'wheelchair' ? st(language, 'summary.wheelchair') : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 text-sm font-medium tabular-nums">
                        EUR {getSeatPrice(seat).toFixed(2)}
                      </span>
                      <button
                        onClick={() => onRemoveSeat(seat.id)}
                        className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                        aria-label={`Remove ${st(language, 'picker.row')} ${seat.row_label} ${st(language, 'picker.seatLabel')} ${seat.seat_number}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {selectedSeats.length > 0 && (
        <div className="border-t border-slate-700 px-4 py-3 space-y-3">
          {serviceFee > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{st(language, 'checkout.subtotal')}</span>
                <span className="text-slate-300 tabular-nums">EUR {(totalPrice - serviceFee).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{selectedSeats.length}x EUR {feePerTicket.toFixed(2)} {st(language, 'checkout.serviceFee').toLowerCase()}</span>
                <span className="text-slate-300 tabular-nums">EUR {serviceFee.toFixed(2)}</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-slate-300 text-sm">{st(language, 'summary.total')}</span>
            <span className="text-white text-lg font-bold tabular-nums">
              EUR {totalPrice.toFixed(2)}
            </span>
          </div>

          {holdError && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2" role="alert">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              {holdError}
            </div>
          )}

          {isHeld ? (
            <div className="space-y-2">
              <button
                onClick={onNavigateCheckout}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                {st(language, 'summary.goToPayment')}
              </button>
              <button
                onClick={onReleaseHold}
                className="w-full py-2 text-slate-400 hover:text-white text-xs transition-colors"
              >
                {st(language, 'summary.cancelRelease')}
              </button>
            </div>
          ) : (
            <button
              onClick={onConfirmHold}
              disabled={holdLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
            >
              {holdLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  {st(language, 'summary.reserving')}
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  {st(language, 'summary.reserveFor10')}
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
