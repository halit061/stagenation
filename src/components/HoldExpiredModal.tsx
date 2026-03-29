import { Clock } from 'lucide-react';

interface Props {
  onRestart: () => void;
  onClose: () => void;
}

export function HoldExpiredModal({ onRestart, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl hold-expired-enter">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-red-400" />
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            Reservering Verlopen
          </h2>

          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Je gereserveerde stoelen zijn vrijgegeven omdat de tijd is verstreken.
          </p>

          <div className="flex flex-col gap-2 w-full">
            <button
              onClick={onRestart}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-emerald-600/20"
            >
              Opnieuw Stoelen Kiezen
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-colors text-sm"
            >
              Sluiten
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
