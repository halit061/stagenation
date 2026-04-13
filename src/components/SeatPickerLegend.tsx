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
    <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4'} flex-wrap`} role="list" aria-label="Seat legend">
      {hasTicketTypes ? (
        <>
          {ttItems.map(tt => (
            <div key={tt.id} className="flex items-center gap-1.5" role="listitem">
              <SeatChair
                color={tt.color}
                size={16}
                borderColor={tt.color}
              />
              <span className="text-xs text-slate-500 font-medium">
                {tt.name}
                {tt.price > 0 && !compact && (
                  <span className="text-slate-600 ml-1">EUR {tt.price.toFixed(2)}</span>
                )}
              </span>
            </div>
          ))}
        </>
      ) : (
        <div className="flex items-center gap-1.5" role="listitem">
          <SeatChair color="#4ade80" size={16} borderColor="#16a34a" />
          <span className="text-xs text-slate-500 font-medium">{st(language, 'legend.available')}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5" role="listitem">
        <SeatChair
          color="#3b82f6"
          size={16}
          selected
          borderColor="#1d4ed8"
          glowColor="#ffffff"
        />
        <span className="text-xs text-slate-500 font-medium">{st(language, 'legend.yourSelection')}</span>
      </div>
      <div className="flex items-center gap-1.5" role="listitem">
        <SeatChair
          color="#f87171"
          size={16}
          opacity={0.85}
          borderColor="#dc2626"
        />
        <span className="text-xs text-slate-500 font-medium">{st(language, 'legend.unavailable')}</span>
      </div>
    </div>
  );
});
