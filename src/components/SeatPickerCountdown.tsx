import { useState, useEffect, memo } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

interface Props {
  expiresAt: string;
  onExpired: () => void;
}

export const SeatPickerCountdown = memo(function SeatPickerCountdown({ expiresAt, onExpired }: Props) {
  const { language } = useLanguage();
  const [remaining, setRemaining] = useState(() => {
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(interval);
        onExpired();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const isUrgent = remaining <= 120;
  const isCritical = remaining <= 60;

  return (
    <div
      className={`flex items-center gap-2 ${isCritical ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-amber-300'}`}
      role="timer"
      aria-live="polite"
      aria-label={st(language, 'timer.label', { time: timeStr })}
    >
      {isCritical ? (
        <AlertTriangle className="w-4 h-4 animate-pulse" aria-hidden="true" />
      ) : (
        <Clock className="w-4 h-4" aria-hidden="true" />
      )}
      <div className="flex-1">
        <p className="text-xs font-medium">
          {isCritical ? st(language, 'timer.critical') : st(language, 'timer.expiresIn')}
        </p>
      </div>
      <div className={`font-mono font-bold text-sm tabular-nums ${isCritical ? 'countdown-critical' : isUrgent ? 'countdown-urgent' : ''}`}>
        {timeStr}
      </div>
    </div>
  );
});
