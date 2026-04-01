import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: 'Ctrl / Cmd + Z', description: 'Ongedaan maken' },
  { keys: 'Ctrl / Cmd + Shift + Z', description: 'Opnieuw' },
  { keys: 'Ctrl / Cmd + A', description: 'Alles selecteren in sectie' },
  { keys: 'Ctrl / Cmd + S', description: 'Layout opslaan' },
  { keys: 'Delete / Backspace', description: 'Geselecteerde stoelen verwijderen' },
  { keys: 'Escape', description: 'Selectie opheffen' },
  { keys: 'Shift + Klik', description: 'Bereik selecteren' },
  { keys: 'Klik + Sleep', description: 'Stoel verplaatsen' },
  { keys: 'Scroll', description: 'Zoomen (muis op canvas)' },
  { keys: 'B', description: 'Achtergrond aan/uit' },
];

export function KeyboardShortcutsModal({ isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">Sneltoetsen</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-300">{s.description}</span>
              <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                {s.keys.split(' + ').map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-slate-500 text-xs">+</span>}
                    <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 font-mono whitespace-nowrap">
                      {k.trim()}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Sluiten
        </button>
      </div>
    </div>
  );
}
