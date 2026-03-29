import { memo } from 'react';
import type { PriceCategory } from '../hooks/useSeatPickerState';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

interface Props {
  categories: PriceCategory[];
  activeFilters: Set<string>;
  onToggle: (categoryId: string) => void;
}

export const SeatPickerFilters = memo(function SeatPickerFilters({ categories, activeFilters, onToggle }: Props) {
  const { language } = useLanguage();

  if (categories.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label={st(language, 'filter.label')}>
      <span className="text-xs text-slate-500 font-medium uppercase tracking-wider mr-1">
        {st(language, 'filter.label')}
      </span>
      {categories.map(cat => {
        const isActive = activeFilters.size === 0 || activeFilters.has(cat.id);
        return (
          <button
            key={cat.id}
            onClick={() => onToggle(cat.id)}
            aria-pressed={isActive}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              isActive
                ? 'bg-slate-800 border-slate-600 text-white'
                : 'bg-transparent border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600'
            }`}
          >
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: cat.color,
                opacity: isActive ? 1 : 0.3,
              }}
            />
            <span>{cat.name}</span>
            <span className="text-slate-500">EUR {cat.price.toFixed(0)}</span>
          </button>
        );
      })}
    </div>
  );
});
