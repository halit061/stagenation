import { useEffect } from 'react';
import { Shield } from 'lucide-react';

interface Props {
  active: boolean;
  onKeepSeats: () => void;
  onCancel: () => void;
  onStay: () => void;
  visible: boolean;
}

export function NavigationGuard({ active, onKeepSeats, onCancel, onStay, visible }: Props) {
  useEffect(() => {
    if (!active) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Je hebt gereserveerde stoelen. Weet je zeker dat je wilt vertrekken?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [active]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onStay}
      />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl hold-expired-enter">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-blue-500/15 flex items-center justify-center mb-4">
            <Shield className="w-7 h-7 text-blue-400" />
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            Reservering Actief
          </h2>

          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Je hebt stoelen gereserveerd. Wat wil je doen?
          </p>

          <div className="flex flex-col gap-2 w-full">
            <button
              onClick={onKeepSeats}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all text-sm"
            >
              Stoelen behouden
            </button>
            <button
              onClick={onCancel}
              className="w-full py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium rounded-xl transition-colors text-sm border border-red-500/30"
            >
              Reservering annuleren
            </button>
            <button
              onClick={onStay}
              className="w-full py-2.5 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Blijf op deze pagina
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
