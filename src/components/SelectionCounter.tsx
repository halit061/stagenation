import { X } from 'lucide-react';

interface Props {
  count: number;
  onClear: () => void;
}

export function SelectionCounter({ count, onClear }: Props) {
  if (count === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 bg-slate-900/95 border border-slate-600 text-white text-sm font-medium rounded-lg px-3 py-2 shadow-xl backdrop-blur-sm">
      <span className="tabular-nums">{count} {count === 1 ? 'stoel' : 'stoelen'} geselecteerd</span>
      <button
        onClick={onClear}
        className="p-0.5 hover:bg-slate-700 rounded transition-colors"
        title="Deselecteer alles"
        style={{ minHeight: 'auto' }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
