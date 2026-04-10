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
    { color: '#4ade80', borderColor: '#16a34a', key: 'legend.available' },
    { color: '#3b82f6', borderColor: '#1d4ed8', key: 'legend.yourSelection', selected: true },
    { color: '#fbbf24', borderColor: '#d97706', key: 'legend.vip' },
    { color: '#f87171', borderColor: '#dc2626', key: 'legend.unavailable', opacity: 0.85 },
  ];

  return (
    <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4'} flex-wrap`} role="list" aria-label="Seat legend">
      {items.map(item => (
        <div key={item.key} className="flex items-center gap-1.5" role="listitem">
          <SeatChair
            color={item.color}
            size={16}
            selected={item.selected}
            opacity={item.opacity ?? 1}
            borderColor={item.borderColor}
            glowColor={item.selected ? '#ffffff' : undefined}
          />
          <span className="text-xs text-slate-500 font-medium">{st(language, item.key)}</span>
        </div>
      ))}
    </div>
  );
});
