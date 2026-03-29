import { useEffect, useRef, memo } from 'react';
import { Clock } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

interface Props {
  onRestart: () => void;
  onClose: () => void;
}

export const HoldExpiredModal = memo(function HoldExpiredModal({ onRestart, onClose }: Props) {
  const { language } = useLanguage();
  const restartRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    restartRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hold-expired-title"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl hold-expired-enter">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-red-400" />
          </div>

          <h2 id="hold-expired-title" className="text-xl font-bold text-white mb-2">
            {st(language, 'expired.title')}
          </h2>

          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            {st(language, 'expired.message')}
          </p>

          <div className="flex flex-col gap-2 w-full">
            <button
              ref={restartRef}
              onClick={onRestart}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-emerald-600/20"
            >
              {st(language, 'expired.restart')}
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-colors text-sm"
            >
              {st(language, 'expired.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
