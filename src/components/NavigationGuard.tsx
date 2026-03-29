import { useEffect, useRef, memo } from 'react';
import { Shield } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

interface Props {
  active: boolean;
  onKeepSeats: () => void;
  onCancel: () => void;
  onStay: () => void;
  visible: boolean;
}

export const NavigationGuard = memo(function NavigationGuard({ active, onKeepSeats, onCancel, onStay, visible }: Props) {
  const { language } = useLanguage();
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!active) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [active]);

  useEffect(() => {
    if (visible) keepRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStay();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onStay]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nav-guard-title"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onStay}
      />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl hold-expired-enter">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-blue-500/15 flex items-center justify-center mb-4">
            <Shield className="w-7 h-7 text-blue-400" />
          </div>

          <h2 id="nav-guard-title" className="text-xl font-bold text-white mb-2">
            {st(language, 'nav.title')}
          </h2>

          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            {st(language, 'nav.message')}
          </p>

          <div className="flex flex-col gap-2 w-full">
            <button
              ref={keepRef}
              onClick={onKeepSeats}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all text-sm"
            >
              {st(language, 'nav.keepSeats')}
            </button>
            <button
              onClick={onCancel}
              className="w-full py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium rounded-xl transition-colors text-sm border border-red-500/30"
            >
              {st(language, 'nav.cancel')}
            </button>
            <button
              onClick={onStay}
              className="w-full py-2.5 text-slate-400 hover:text-white text-sm transition-colors"
            >
              {st(language, 'nav.stay')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
