import { memo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';
import { SeatChair } from './SeatIcon';
import type { TicketTypeColor } from '../services/seatPickerService';

interface Props {
  compact?: boolean;
  ticketTypeColors?: TicketTypeColor[];
}

export const SeatPickerLegend = memo(function SeatPickerLegend({ compact, ticketTypeColors = [] }: Props) {
  const { language } = useLanguage();
  const ttItems = ticketTypeColors.filter(tt => tt.color);
  const hasTicketTypes = ttItems.length > 0;

  return (
    <div
      className={`flex items-center ${compact ? 'gap-2' : 'gap-3'} overflow-x-auto scrollbar-hide pb-1`}
      role="list"
      aria-label="Seat legend"
      style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
    >
      {hasTicketTypes && ttItems.map(tt => (
        <div key={tt.id} className="flex items-center gap-1 shrink-0" role="listitem" title={`${tt.name} - EUR ${tt.price.toFixed(2)}`}>
          <SeatChair color={tt.color} size={compact ? 12 : 16} borderColor={tt.color} />
          <span className="text-[10px] sm:text-xs text-slate-400 font-medium whitespace-nowrap">
            <span className="hidden sm:inline">{tt.name} </span>
            <span className="text-slate-300">&euro;{tt.price.toFixed(0)}</span>
          </span>
        </div>
      ))}
      {!hasTicketTypes && (
        <div className="flex items-center gap-1 shrink-0" role="listitem">
          <SeatChair color="#4ade80" size={compact ? 12 : 16} borderColor="#16a34a" />
          <span className="text-[10px] sm:text-xs text-slate-400 font-medium">{st(language, 'legend.available')}</span>
        </div>
      )}
      <div className="flex items-center gap-1 shrink-0" role="listitem">
        <SeatChair color="#3b82f6" size={compact ? 12 : 16} selected borderColor="#1d4ed8" glowColor="#ffffff" />
        <span className="text-[10px] sm:text-xs text-slate-400 font-medium whitespace-nowrap">{st(language, 'legend.yourSelection')}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0" role="listitem">
        <SeatChair color="#f87171" size={compact ? 12 : 16} opacity={0.85} borderColor="#dc2626" />
        <span className="text-[10px] sm:text-xs text-slate-400 font-medium whitespace-nowrap">{st(language, 'legend.unavailable')}</span>
      </div>
    </div>
  );
});
