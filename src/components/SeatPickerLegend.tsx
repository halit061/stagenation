import { memo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

interface Props {
  compact?: boolean;
}

export const SeatPickerLegend = memo(function SeatPickerLegend({ compact }: Props) {
  const { language } = useLanguage();

  const items = [
    { color: '#22c55e', key: 'legend.available' },
    { color: '#3b82f6', key: 'legend.yourSelection', isSelection: true },
    { color: '#eab308', key: 'legend.vip', hasRing: true },
    { color: '#4b5563', key: 'legend.unavailable' },
  ];

  return (
    <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4'} flex-wrap`} role="list" aria-label="Seat legend">
      {items.map(item => (
        <div key={item.key} className="flex items-center gap-1.5" role="listitem">
          <div className="relative">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: item.color,
                opacity: item.color === '#4b5563' ? 0.5 : 0.9,
                boxShadow: item.isSelection
                  ? '0 0 0 1.5px #ffffff, 0 0 6px rgba(59,130,246,0.4)'
                  : item.hasRing
                  ? '0 0 0 1px #fbbf24'
                  : undefined,
              }}
            />
          </div>
          <span className="text-xs text-slate-400">{st(language, item.key)}</span>
        </div>
      ))}
    </div>
  );
});
