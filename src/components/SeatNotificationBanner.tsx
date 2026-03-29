import { memo } from 'react';
import { X, AlertTriangle, Info } from 'lucide-react';
import type { SeatNotification } from '../hooks/useSeatPickerState';

interface Props {
  notifications: SeatNotification[];
  onDismiss: (id: string) => void;
}

export const SeatNotificationBanner = memo(function SeatNotificationBanner({ notifications, onDismiss }: Props) {
  if (notifications.length === 0) return null;

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex flex-col gap-2 w-[90%] max-w-lg"
      role="status"
      aria-live="polite"
    >
      {notifications.map(n => (
        <div
          key={n.id}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg backdrop-blur seat-notification-enter ${
            n.type === 'taken'
              ? 'bg-red-600/90 text-white'
              : 'bg-amber-500/90 text-amber-950'
          }`}
        >
          {n.type === 'taken' ? (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Info className="w-4 h-4 flex-shrink-0" />
          )}
          <p className="text-sm font-medium flex-1">{n.message}</p>
          <button
            onClick={() => onDismiss(n.id)}
            className="p-0.5 hover:bg-white/20 rounded transition-colors flex-shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
});
