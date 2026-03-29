import { useState, useRef, useEffect } from 'react';
import { Sparkles, ChevronDown, Users, RefreshCw } from 'lucide-react';
import type { BestAvailableStrategy, SeatSection } from '../types/seats';
import type { PriceCategory } from '../hooks/useSeatPickerState';

interface Props {
  sections: SeatSection[];
  priceCategories: PriceCategory[];
  maxSeats: number;
  currentCount: number;
  onFind: (opts: {
    count: number;
    strategy: BestAvailableStrategy;
    sectionId?: string;
    priceCategory?: string;
    keepTogether: boolean;
  }) => void;
  onRetry: () => void;
  lastResult: 'none' | 'found' | 'empty';
  retryCount: number;
}

const STRATEGIES: { id: BestAvailableStrategy; label: string; desc: string }[] = [
  { id: 'best', label: 'Beste', desc: 'Dicht bij podium + centraal' },
  { id: 'front', label: 'Vooraan', desc: 'Zo dicht mogelijk bij podium' },
  { id: 'center', label: 'Centraal', desc: 'Midden in de zaal' },
  { id: 'cheapest', label: 'Voordeligst', desc: 'Laagste prijs' },
  { id: 'expensive', label: 'Premium', desc: 'Beste categorie' },
];

const QUICK_COUNTS = [1, 2, 4, 6];

export function BestAvailablePanel({
  sections,
  priceCategories,
  maxSeats,
  currentCount,
  onFind,
  onRetry,
  lastResult,
  retryCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(2);
  const [strategy, setStrategy] = useState<BestAvailableStrategy>('best');
  const [sectionId, setSectionId] = useState<string>('');
  const [priceCategory, setPriceCategory] = useState<string>('');
  const [keepTogether, setKeepTogether] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const handleQuickSelect = (n: number) => {
    setCount(n);
    onFind({
      count: n,
      strategy,
      sectionId: sectionId || undefined,
      priceCategory: priceCategory || undefined,
      keepTogether,
    });
  };

  const handleFind = () => {
    onFind({
      count,
      strategy,
      sectionId: sectionId || undefined,
      priceCategory: priceCategory || undefined,
      keepTogether,
    });
  };

  const remaining = maxSeats - currentCount;

  return (
    <div ref={panelRef} className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-blue-600/20"
        >
          <Sparkles className="w-4 h-4" />
          Beste Beschikbaar
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {remaining > 0 && (
          <div className="flex items-center gap-1.5">
            {QUICK_COUNTS.filter(n => n <= remaining).map(n => (
              <button
                key={n}
                onClick={() => handleQuickSelect(n)}
                className="w-8 h-8 flex items-center justify-center text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 rounded-lg transition-all"
              >
                {n}
              </button>
            ))}
            {remaining > 6 && (
              <button
                onClick={() => { setCount(remaining); handleQuickSelect(remaining); }}
                className="px-2 h-8 flex items-center justify-center text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 rounded-lg transition-all"
              >
                6+
              </button>
            )}
          </div>
        )}

        {lastResult === 'found' && retryCount < 5 && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-2 text-slate-400 hover:text-white text-xs rounded-lg hover:bg-slate-800 transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Andere stoelen
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden seat-tooltip-enter">
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">
                Aantal stoelen
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCount(Math.max(1, count - 1))}
                  className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors text-lg font-bold"
                >
                  -
                </button>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700 min-w-[60px] justify-center">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-white font-bold">{count}</span>
                </div>
                <button
                  onClick={() => setCount(Math.min(remaining || maxSeats, count + 1))}
                  className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors text-lg font-bold"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">
                Voorkeur
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {STRATEGIES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setStrategy(s.id)}
                    className={`text-left px-3 py-2 rounded-lg text-xs transition-all border ${
                      strategy === s.id
                        ? 'bg-blue-600/20 border-blue-500/50 text-white'
                        : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-medium">{s.label}</div>
                    <div className="text-[10px] opacity-60 mt-0.5">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {priceCategories.length > 1 && (
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">
                  Prijscategorie
                </label>
                <select
                  value={priceCategory}
                  onChange={(e) => setPriceCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Alle categorieen</option>
                  {priceCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} - EUR {cat.price.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sections.length > 1 && (
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">
                  Sectie
                </label>
                <select
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Alle secties</option>
                  {sections.map(sec => (
                    <option key={sec.id} value={sec.id}>{sec.name}</option>
                  ))}
                </select>
              </div>
            )}

            {count > 1 && (
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div
                  className={`w-9 h-5 rounded-full transition-colors relative ${keepTogether ? 'bg-blue-600' : 'bg-slate-700'}`}
                  onClick={() => setKeepTogether(!keepTogether)}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${keepTogether ? 'translate-x-4' : 'translate-x-0.5'}`}
                  />
                </div>
                <span className="text-sm text-slate-300">Naast elkaar zitten</span>
              </label>
            )}

            <button
              onClick={() => { handleFind(); setOpen(false); }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all text-sm flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Vind {count} stoel{count !== 1 ? 'en' : ''}
            </button>
          </div>
        </div>
      )}

      {lastResult === 'empty' && (
        <div className="mt-2 text-amber-400 text-xs bg-amber-500/10 rounded-lg px-3 py-2">
          Geen {count} beschikbare stoelen gevonden met deze criteria. Probeer andere voorkeuren.
        </div>
      )}
    </div>
  );
}
