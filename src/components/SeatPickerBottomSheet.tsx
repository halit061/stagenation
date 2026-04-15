import { useRef, useState, useCallback, useEffect, memo } from 'react';
import { ChevronUp } from 'lucide-react';
import type { SeatSection } from '../types/seats';
import type { PickerSeat } from '../hooks/useSeatPickerState';
import { SeatPickerSummary } from './SeatPickerSummary';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

type SheetState = 'collapsed' | 'half' | 'full';

interface Props {
  selectedSeats: PickerSeat[];
  sections: SeatSection[];
  sectionTicketPrices?: Map<string, { ttName: string; price: number }>;
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

const COLLAPSED_H = 72;
const HALF_RATIO = 0.45;

export const SeatPickerBottomSheet = memo(function SeatPickerBottomSheet({
  selectedSeats,
  sections,
  sectionTicketPrices,
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
  const [state, setState] = useState<SheetState>('collapsed');
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; height: number } | null>(null);
  const [sheetHeight, setSheetHeight] = useState(COLLAPSED_H);

  useEffect(() => {
    if (selectedSeats.length > 0 && state === 'collapsed') {
      setState('collapsed');
    }
  }, [selectedSeats.length]);

  useEffect(() => {
    const wh = window.innerHeight;
    switch (state) {
      case 'collapsed':
        setSheetHeight(selectedSeats.length > 0 ? COLLAPSED_H : 0);
        break;
      case 'half':
        setSheetHeight(wh * HALF_RATIO);
        break;
      case 'full':
        setSheetHeight(wh * 0.9);
        break;
    }
  }, [state, selectedSeats.length]);

  const handleDragStart = useCallback((e: React.TouchEvent) => {
    dragStart.current = { y: e.touches[0].clientY, height: sheetHeight };
  }, [sheetHeight]);

  const handleDragMove = useCallback((e: React.TouchEvent) => {
    if (!dragStart.current) return;
    const dy = dragStart.current.y - e.touches[0].clientY;
    const newH = Math.max(0, Math.min(window.innerHeight * 0.9, dragStart.current.height + dy));
    setSheetHeight(newH);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!dragStart.current) return;
    const wh = window.innerHeight;
    const ratio = sheetHeight / wh;
    if (ratio < 0.15) setState('collapsed');
    else if (ratio < 0.6) setState('half');
    else setState('full');
    dragStart.current = null;
  }, [sheetHeight]);

  if (selectedSeats.length === 0) return null;

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700 rounded-t-2xl shadow-2xl transition-[height] duration-300 ease-out lg:hidden"
      style={{ height: sheetHeight }}
      role="region"
      aria-label={st(language, 'summary.yourSeats')}
    >
      <div
        className="flex items-center justify-center py-2 cursor-grab active:cursor-grabbing"
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
        onClick={() => {
          if (state === 'collapsed') setState('half');
          else if (state === 'half') setState('full');
          else setState('collapsed');
        }}
      >
        <div className="w-10 h-1 bg-slate-600 rounded-full" />
      </div>

      {state === 'collapsed' ? (
        <div className="px-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-white text-sm font-medium">
                {selectedSeats.length} {selectedSeats.length !== 1 ? st(language, 'picker.seats') : st(language, 'picker.seat')}
              </span>
            </div>
            <span className="text-emerald-400 font-bold text-sm tabular-nums">
              EUR {totalPrice.toFixed(2)}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setState('half'); }}
            className="p-1.5 text-slate-400 hover:text-white"
            aria-label="Expand seat summary"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col h-[calc(100%-28px)] overflow-hidden">
          <SeatPickerSummary
            selectedSeats={selectedSeats}
            sections={sections}
            sectionTicketPrices={sectionTicketPrices}
            totalPrice={totalPrice}
            serviceFee={serviceFee}
            feePerTicket={feePerTicket}
            maxSeats={maxSeats}
            holdIds={holdIds}
            expiresAt={expiresAt}
            holdLoading={holdLoading}
            holdError={holdError}
            onRemoveSeat={onRemoveSeat}
            onClear={onClear}
            onConfirmHold={onConfirmHold}
            onReleaseHold={onReleaseHold}
            onExpired={onExpired}
            onNavigateCheckout={onNavigateCheckout}
          />
        </div>
      )}
    </div>
  );
});
