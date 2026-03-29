import { useState, useEffect, useCallback, memo } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

interface Props {
  expiresAt: string;
  extended: boolean;
  onExpired: () => void;
  onExtend: () => void;
}

export const HoldTimerBar = memo(function HoldTimerBar({ expiresAt, extended, onExpired, onExtend }: Props) {
  const { language } = useLanguage();
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );
  const [showExtendConfirm, setShowExtendConfirm] = useState(false);

  useEffect(() => {
    const recalc = () => {
      const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) onExpired();
    };

    recalc();
    const interval = setInterval(recalc, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') recalc();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [expiresAt, onExpired]);

  const handleExtendConfirm = useCallback(() => {
    onExtend();
    setShowExtendConfirm(false);
  }, [onExtend]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  let phase: 'calm' | 'warning' | 'urgent' = 'calm';
  if (remaining <= 120) phase = 'urgent';
  else if (remaining <= 300) phase = 'warning';

  const bgClass = phase === 'urgent'
    ? 'bg-red-600'
    : phase === 'warning'
    ? 'bg-amber-500'
    : 'bg-slate-800 border-b border-slate-700';

  const textClass = phase === 'warning' ? 'text-amber-950' : 'text-white';

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[60] h-12 flex items-center justify-center px-4 ${bgClass} ${phase === 'urgent' ? 'hold-timer-pulse' : ''}`}
      role="timer"
      aria-live="polite"
      aria-label={st(language, 'timer.label', { time: timeStr })}
    >
      <div className={`flex items-center gap-3 ${textClass}`}>
        {phase === 'urgent' ? (
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        ) : (
          <Clock className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        )}

        <span className={`text-sm ${phase === 'urgent' ? 'font-bold' : phase === 'warning' ? 'font-semibold' : 'font-medium'}`}>
          {phase === 'urgent'
            ? st(language, 'timer.hurry', { time: timeStr })
            : st(language, 'timer.reserved', { time: timeStr })
          }
        </span>

        <span className={`font-mono font-bold text-base tabular-nums ${phase === 'urgent' ? 'hold-timer-digits-pulse' : ''}`}>
          {timeStr}
        </span>
      </div>

      {!extended && remaining > 30 && (
        <div className="absolute right-4 flex items-center">
          {showExtendConfirm ? (
            <div className="flex items-center gap-2 text-sm">
              <span className={textClass}>{st(language, 'timer.extendQuestion')}</span>
              <button
                onClick={handleExtendConfirm}
                className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs font-medium transition-colors"
              >
                {st(language, 'timer.yes')}
              </button>
              <button
                onClick={() => setShowExtendConfirm(false)}
                className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors"
              >
                {st(language, 'timer.no')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowExtendConfirm(true)}
              className={`text-xs underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity ${textClass}`}
            >
              {st(language, 'timer.moreTime')}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
