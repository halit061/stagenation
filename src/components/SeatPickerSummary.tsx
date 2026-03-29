import { X, ShoppingCart, Clock, Loader2, AlertTriangle } from 'lucide-react';
import type { SeatSection } from '../types/seats';
import type { PickerSeat } from '../hooks/useSeatPickerState';
import { SeatPickerCountdown } from './SeatPickerCountdown';

interface Props {
  selectedSeats: PickerSeat[];
  sections: SeatSection[];
  totalPrice: number;
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

export function SeatPickerSummary({
  selectedSeats,
  sections,
  totalPrice,
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
  const isHeld = holdIds.length > 0 && expiresAt;

  function getSeatPrice(seat: PickerSeat) {
    const section = sections.find(s => s.id === seat.sectionId);
    return seat.price_override ?? (section ? Number(section.price_amount) : 0);
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
          <ShoppingCart className="w-4 h-4 text-blue-400" />
          <h3 className="text-white font-semibold text-sm">
            Jouw Stoelen
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
            Alles wissen
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
              <ShoppingCart className="w-5 h-5 text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm">Selecteer stoelen op het zaalplan</p>
            <p className="text-slate-500 text-xs mt-1">Maximum {maxSeats} stoelen</p>
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
                          Rij {seat.row_label} - Stoel {seat.seat_number}
                        </span>
                        {seat.seat_type !== 'regular' && (
                          <span className="ml-1.5 text-xs text-amber-400">
                            {seat.seat_type === 'vip' ? 'VIP' : seat.seat_type === 'wheelchair' ? 'Rolstoel' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 text-sm font-medium tabular-nums">
                        EUR {getSeatPrice(seat).toFixed(2)}
                      </span>
                      {!isHeld && (
                        <button
                          onClick={() => onRemoveSeat(seat.id)}
                          className="p-0.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
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
          <div className="flex items-center justify-between">
            <span className="text-slate-300 text-sm">Totaal</span>
            <span className="text-white text-lg font-bold tabular-nums">
              EUR {totalPrice.toFixed(2)}
            </span>
          </div>

          {holdError && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {holdError}
            </div>
          )}

          {isHeld ? (
            <div className="space-y-2">
              <button
                onClick={onNavigateCheckout}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                Ga naar Betaling
              </button>
              <button
                onClick={onReleaseHold}
                className="w-full py-2 text-slate-400 hover:text-white text-xs transition-colors"
              >
                Annuleren & stoelen vrijgeven
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
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reserveren...
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" />
                  Reserveer voor 10 min
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
