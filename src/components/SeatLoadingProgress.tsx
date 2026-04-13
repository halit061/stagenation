import { Armchair } from 'lucide-react';

interface Props {
  loaded: number;
  sectionsDone: number;
  totalSections: number;
  isComplete: boolean;
}

export function SeatLoadingProgress({ loaded, sectionsDone, totalSections, isComplete }: Props) {
  if (isComplete && loaded === 0) return null;

  const pct = totalSections > 0 ? Math.round((sectionsDone / totalSections) * 100) : 0;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div className={`
        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg
        transition-all duration-500
        ${isComplete
          ? 'bg-slate-800/80 text-emerald-400 backdrop-blur-sm'
          : 'bg-slate-800/90 text-white backdrop-blur-sm'
        }
      `}>
        <Armchair className={`w-4 h-4 ${isComplete ? 'text-emerald-400' : 'animate-pulse text-blue-400'}`} />
        {isComplete ? (
          <span>{loaded.toLocaleString()} stoelen geladen</span>
        ) : (
          <>
            <span>Stoelen laden... {loaded.toLocaleString()}</span>
            <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-slate-400 text-xs">{sectionsDone}/{totalSections}</span>
          </>
        )}
      </div>
    </div>
  );
}
