import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, MapPin, Calendar, Users } from 'lucide-react';
import { useSeatPickerState } from '../hooks/useSeatPickerState';
import { SeatPickerMap } from '../components/SeatPickerMap';
import { SeatPickerSummary } from '../components/SeatPickerSummary';
import { SeatPickerBottomSheet } from '../components/SeatPickerBottomSheet';
import { SeatPickerLegend } from '../components/SeatPickerLegend';
import { SeatPickerFilters } from '../components/SeatPickerFilters';
import { SeatPickerMiniMap } from '../components/SeatPickerMiniMap';

interface Props {
  eventId: string;
  onNavigate: (page: string) => void;
}

export function SeatPicker({ eventId, onNavigate }: Props) {
  const state = useSeatPickerState(eventId);
  const [viewport, setViewport] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const handleViewportChange = useCallback((vp: { x: number; y: number; w: number; h: number }) => {
    setViewport(vp);
  }, []);

  const handleExpired = useCallback(() => {
    state.releaseHold();
  }, [state.releaseHold]);

  const handleNavigateCheckout = useCallback(() => {
    onNavigate(`tickets?event=${eventId}&seats=${[...state.selectedIds].join(',')}&holds=${state.holdIds.join(',')}`);
  }, [onNavigate, eventId, state.selectedIds, state.holdIds]);

  const selectedSeats = useMemo(() => state.getSelectedSeats(), [state.getSelectedSeats]);
  const totalPrice = useMemo(() => state.getTotalPrice(), [state.getTotalPrice]);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin" />
          </div>
          <p className="text-slate-400 text-sm">Zaalplan laden...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Zaalplan niet beschikbaar</h1>
          <p className="text-slate-400 mb-6">{state.error}</p>
          <button
            onClick={() => onNavigate('home')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors"
          >
            Terug naar home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <header className="flex-shrink-0 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-4 py-3 z-20">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('tickets')}
              className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">
                {state.eventInfo?.name || 'Kies je stoelen'}
              </h1>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                {state.eventInfo?.start_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(state.eventInfo.start_date).toLocaleDateString('nl-NL', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
                {state.eventInfo?.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {state.eventInfo.location}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400">
              {state.selectedIds.size}/{state.maxSeats} stoelen
            </span>
          </div>
        </div>
      </header>

      <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-800/50 bg-slate-950">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4">
          <SeatPickerFilters
            categories={state.priceCategories}
            activeFilters={state.activePriceFilters}
            onToggle={state.togglePriceFilter}
          />
          <div className="hidden md:block">
            <SeatPickerLegend compact />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <SeatPickerMap
            sections={state.sections}
            seats={state.visibleSeats}
            selectedIds={state.selectedIds}
            onSeatClick={state.toggleSeat}
            canvasWidth={state.canvasWidth}
            canvasHeight={state.canvasHeight}
            onViewportChange={handleViewportChange}
          />

          <SeatPickerMiniMap
            sections={state.sections}
            canvasWidth={state.canvasWidth}
            canvasHeight={state.canvasHeight}
            viewport={viewport}
          />

          <div className="absolute bottom-4 left-4 md:hidden z-10">
            <div className="bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-lg px-3 py-2">
              <SeatPickerLegend compact />
            </div>
          </div>

          {state.selectedIds.size >= state.maxSeats && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 seat-tooltip-enter">
              <div className="bg-amber-500/90 backdrop-blur text-black text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
                Maximum {state.maxSeats} stoelen bereikt
              </div>
            </div>
          )}
        </div>

        <div className="hidden lg:flex flex-col w-[360px] border-l border-slate-800 bg-slate-900/50">
          <SeatPickerSummary
            selectedSeats={selectedSeats}
            sections={state.sections}
            totalPrice={totalPrice}
            maxSeats={state.maxSeats}
            holdIds={state.holdIds}
            expiresAt={state.expiresAt}
            holdLoading={state.holdLoading}
            holdError={state.holdError}
            onRemoveSeat={state.toggleSeat}
            onClear={state.clearSelection}
            onConfirmHold={state.confirmHold}
            onReleaseHold={state.releaseHold}
            onExpired={handleExpired}
            onNavigateCheckout={handleNavigateCheckout}
          />
        </div>
      </div>

      <SeatPickerBottomSheet
        selectedSeats={selectedSeats}
        sections={state.sections}
        totalPrice={totalPrice}
        maxSeats={state.maxSeats}
        holdIds={state.holdIds}
        expiresAt={state.expiresAt}
        holdLoading={state.holdLoading}
        holdError={state.holdError}
        onRemoveSeat={state.toggleSeat}
        onClear={state.clearSelection}
        onConfirmHold={state.confirmHold}
        onReleaseHold={state.releaseHold}
        onExpired={handleExpired}
        onNavigateCheckout={handleNavigateCheckout}
      />
    </div>
  );
}

export default SeatPicker;
