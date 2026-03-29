import { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface Props {
  expiresAt: string;
  onExpired: () => void;
}

export function SeatPickerCountdown({ expiresAt, onExpired }: Props) {
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
  const isUrgent = remaining <= 120;
  const isCritical = remaining <= 60;

  return (
    <div className={`flex items-center gap-2 ${isCritical ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-amber-300'}`}>
      {isCritical ? (
        <AlertTriangle className="w-4 h-4 animate-pulse" />
      ) : (
        <Clock className="w-4 h-4" />
      )}
      <div className="flex-1">
        <p className="text-xs font-medium">
          {isCritical ? 'Bijna verlopen!' : 'Reservering verloopt over'}
        </p>
      </div>
      <div className={`font-mono font-bold text-sm tabular-nums ${isCritical ? 'countdown-critical' : isUrgent ? 'countdown-urgent' : ''}`}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </div>
    </div>
  );
}
