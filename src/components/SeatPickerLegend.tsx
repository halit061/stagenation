import { memo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';
import { SeatChair } from './SeatIcon';

interface Props {
  compact?: boolean;
}

export const SeatPickerLegend = memo(function SeatPickerLegend({ compact }: Props) {
  const { language } = useLanguage();

  const items = [
    { color: '#3b82f6', key: 'legend.available', opacity: 0.9 },
    { color: '#22c55e', key: 'legend.yourSelection', selected: true, opacity: 1 },
    { color: '#eab308', key: 'legend.vip', opacity: 0.9 },
    { color: '#ef4444', key: 'legend.unavailable', opacity: 0.5 },
  ];

  return (
    <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4'} flex-wrap`} role="list" aria-label="Seat legend">
      {items.map(item => (
        <div key={item.key} className="flex items-center gap-1.5" role="listitem">
          <SeatChair
            color={item.color}
            size={14}
            selected={item.selected}
            opacity={item.opacity}
            glowColor={item.selected ? '#ffffff' : undefined}
          />
          <span className="text-xs text-slate-400">{st(language, item.key)}</span>
        </div>
      ))}
    </div>
  );
});
