import { useState, useCallback, useMemo, useEffect } from 'react';
import { ArrowLeft, MapPin, Calendar, Users, WifiOff } from 'lucide-react';
import { useSeatPickerState } from '../hooks/useSeatPickerState';
import { fetchServiceFeeForSections } from '../services/seatCheckoutService';
import { SeatPickerMap } from '../components/SeatPickerMap';
import { SeatPickerSummary } from '../components/SeatPickerSummary';
import { SeatPickerBottomSheet } from '../components/SeatPickerBottomSheet';
import { SeatPickerLegend } from '../components/SeatPickerLegend';
import { SeatPickerFilters } from '../components/SeatPickerFilters';
import { SeatPickerMiniMap } from '../components/SeatPickerMiniMap';
import { BestAvailablePanel } from '../components/BestAvailablePanel';
import { HoldTimerBar } from '../components/HoldTimerBar';
import { HoldExpiredModal } from '../components/HoldExpiredModal';
import { NavigationGuard } from '../components/NavigationGuard';
import { SeatNotificationBanner } from '../components/SeatNotificationBanner';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

interface Props {
  eventId: string;
  ticketTypeId?: string;
  onNavigate: (page: string) => void;
}

export function SeatPicker({ eventId, ticketTypeId, onNavigate }: Props) {
  const { language } = useLanguage();
  const state = useSeatPickerState(eventId, ticketTypeId);
  const [viewport, setViewport] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [showNavGuard, setShowNavGuard] = useState(false);
  const [feePerTicket, setFeePerTicket] = useState(0);

  useEffect(() => {
    if (state.sections.length === 0) return;
    const sectionIds = state.sections.map(s => s.id);
    fetchServiceFeeForSections(sectionIds, eventId)
      .then(info => setFeePerTicket(info.feePerTicket))
      .catch(() => {});
  }, [state.sections, eventId]);

  const handleViewportChange = useCallback((vp: { x: number; y: number; w: number; h: number }) => {
    setViewport(vp);
  }, []);

  const handleNavigateCheckout = useCallback(() => {
    onNavigate(`seat-checkout?event=${eventId}`);
  }, [onNavigate, eventId]);

  const handleBack = useCallback(() => {
    if (state.holdActive) {
      setShowNavGuard(true);
    } else {
      onNavigate('tickets');
    }
  }, [state.holdActive, onNavigate]);

  const handleNavKeepSeats = useCallback(() => {
    setShowNavGuard(false);
  }, []);

  const handleNavCancel = useCallback(async () => {
    setShowNavGuard(false);
    await state.releaseHold();
    onNavigate('tickets');
  }, [state.releaseHold, onNavigate]);

  const handleNavStay = useCallback(() => {
    setShowNavGuard(false);
  }, []);

  const handleExpiredRestart = useCallback(() => {
    state.dismissExpiredModal();
  }, [state.dismissExpiredModal]);

  const handleExpiredClose = useCallback(() => {
    state.dismissExpiredModal();
  }, [state.dismissExpiredModal]);

  const selectedSeats = useMemo(() => state.getSelectedSeats(), [state.getSelectedSeats]);
  const subtotal = useMemo(() => state.getTotalPrice(), [state.getTotalPrice]);
  const serviceFee = feePerTicket * selectedSeats.length;
  const totalPrice = subtotal + serviceFee;

  const restrictedSectionIds = useMemo(() => {
    if (!state.allowedSectionIds) return undefined;
    const allowed = new Set(state.allowedSectionIds);
    const restricted = new Set<string>();
    for (const sec of state.sections) {
      if (!allowed.has(sec.id)) restricted.add(sec.id);
    }
    return restricted.size > 0 ? restricted : undefined;
  }, [state.allowedSectionIds, state.sections]);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col" role="status" aria-label={st(language, 'picker.loading')}>
        <div className="h-14 bg-slate-900/80 border-b border-slate-800 flex items-center px-4 gap-3">
          <div className="w-8 h-8 skeleton rounded-lg" />
          <div className="space-y-1.5">
            <div className="h-4 w-40 skeleton rounded" />
            <div className="h-3 w-24 skeleton rounded" />
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-800/50">
          <div className="flex items-center gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 w-20 skeleton rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin" />
            </div>
            <p className="text-slate-400 text-sm">{st(language, 'picker.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4" role="alert">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-7 h-7 text-red-400" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">{st(language, 'picker.unavailable')}</h1>
          <p className="text-slate-400 mb-6">{state.error}</p>
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

  const timerOffset = state.holdActive && state.expiresAt ? 'pt-12' : '';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {state.holdActive && state.expiresAt && (
        <HoldTimerBar
          expiresAt={state.expiresAt}
          extended={state.holdExtended}
          onExpired={state.handleHoldExpired}
          onExtend={state.extendHold}
        />
      )}

      <header className={`flex-shrink-0 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-4 py-3 z-20 ${timerOffset}`}>
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800 focus-ring"
              aria-label={st(language, 'picker.backHome')}
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">
                {state.eventInfo?.name || st(language, 'picker.title')}
              </h1>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                {state.eventInfo?.start_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" aria-hidden="true" />
                    {new Date(state.eventInfo.start_date).toLocaleDateString(language === 'de' ? 'de-DE' : language === 'fr' ? 'fr-FR' : language === 'tr' ? 'tr-TR' : 'nl-NL', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
                {state.eventInfo?.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" aria-hidden="true" />
                    {state.eventInfo.location}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-3 text-sm">
            {state.connectionStatus === 'disconnected' && (
              <div className="flex items-center gap-1.5 text-amber-400 text-xs bg-amber-500/10 px-2 py-1 rounded-lg" role="status">
                <WifiOff className="w-3 h-3" aria-hidden="true" />
                {st(language, 'picker.reconnecting')}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <span className="text-slate-400">
                {state.selectedIds.size}/{state.maxSeats} {st(language, 'picker.seats')}
              </span>
            </div>
          </div>
        </div>
      </header>

      {!state.holdActive && (
        <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-800/50 bg-slate-950">
          <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <SeatPickerFilters
                categories={state.priceCategories}
                activeFilters={state.activePriceFilters}
                onToggle={state.togglePriceFilter}
              />
              <BestAvailablePanel
                sections={state.sections}
                priceCategories={state.priceCategories}
                maxSeats={state.maxSeats}
                currentCount={state.selectedIds.size}
                onFind={state.findBest}
                onRetry={state.retryBest}
                lastResult={state.bestAvailableResult}
                retryCount={state.bestAvailableRetries}
              />
            </div>
            <div className="hidden md:block">
              <SeatPickerLegend compact />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <SeatPickerMap
            sections={state.sections}
            seats={state.visibleSeats}
            selectedIds={state.selectedIds}
            highlightedIds={state.highlightedSeatIds}
            flashingIds={state.flashingSeatIds}
            restrictedSectionIds={restrictedSectionIds}
            floorplanObjects={state.floorplanObjects}
            onSeatClick={state.toggleSeat}
            canvasWidth={state.canvasWidth}
            canvasHeight={state.canvasHeight}
            onViewportChange={handleViewportChange}
          />

          <SeatPickerMiniMap
            sections={state.sections}
            floorplanObjects={state.floorplanObjects}
            canvasWidth={state.canvasWidth}
            canvasHeight={state.canvasHeight}
            viewport={viewport}
          />

          <SeatNotificationBanner
            notifications={state.notifications}
            onDismiss={state.dismissNotification}
          />

          <div className="absolute bottom-4 left-4 md:hidden z-10">
            <div className="bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-lg px-3 py-2">
              <SeatPickerLegend compact />
            </div>
          </div>

          {state.selectedIds.size >= state.maxSeats && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 seat-tooltip-enter" role="alert">
              <div className="bg-amber-500/90 backdrop-blur text-black text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
                {st(language, 'picker.maxReached', { max: state.maxSeats })}
              </div>
            </div>
          )}

          {state.connectionStatus === 'disconnected' && (
            <div className="absolute top-3 right-3 z-10 md:hidden">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs bg-amber-500/10 backdrop-blur px-2.5 py-1.5 rounded-lg border border-amber-500/20" role="status">
                <WifiOff className="w-3 h-3" aria-hidden="true" />
                {st(language, 'picker.restoring')}
              </div>
            </div>
          )}
        </div>

        <div className="hidden lg:flex flex-col w-[360px] border-l border-slate-800 bg-slate-900/50">
          <SeatPickerSummary
            selectedSeats={selectedSeats}
            sections={state.sections}
            totalPrice={totalPrice}
            serviceFee={serviceFee}
            feePerTicket={feePerTicket}
            maxSeats={state.maxSeats}
            holdIds={state.holdIds}
            expiresAt={state.expiresAt}
            holdLoading={state.holdLoading}
            holdError={state.holdError}
            onRemoveSeat={state.toggleSeat}
            onClear={state.clearSelection}
            onConfirmHold={state.confirmHold}
            onReleaseHold={state.releaseHold}
            onExpired={state.handleHoldExpired}
            onNavigateCheckout={handleNavigateCheckout}
          />
        </div>
      </div>

      <SeatPickerBottomSheet
        selectedSeats={selectedSeats}
        sections={state.sections}
        totalPrice={totalPrice}
        serviceFee={serviceFee}
        feePerTicket={feePerTicket}
        maxSeats={state.maxSeats}
        holdIds={state.holdIds}
        expiresAt={state.expiresAt}
        holdLoading={state.holdLoading}
        holdError={state.holdError}
        onRemoveSeat={state.toggleSeat}
        onClear={state.clearSelection}
        onConfirmHold={state.confirmHold}
        onReleaseHold={state.releaseHold}
        onExpired={state.handleHoldExpired}
        onNavigateCheckout={handleNavigateCheckout}
      />

      {state.holdExpired && (
        <HoldExpiredModal
          onRestart={handleExpiredRestart}
          onClose={handleExpiredClose}
        />
      )}

      <NavigationGuard
        active={state.holdActive}
        visible={showNavGuard}
        onKeepSeats={handleNavKeepSeats}
        onCancel={handleNavCancel}
        onStay={handleNavStay}
      />
    </div>
  );
}

export default SeatPicker;
