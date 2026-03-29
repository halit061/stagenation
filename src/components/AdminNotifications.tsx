import { useState, useRef, useEffect } from 'react';
import { Bell, Volume2, VolumeX, ShoppingCart } from 'lucide-react';
import type { OrderNotification } from '../hooks/useAdminSeatRealtime';

interface Props {
  notifications: OrderNotification[];
  unreadCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onMarkAllRead: () => void;
  onViewOrders: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Zojuist';
  if (mins < 60) return `${mins} min geleden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }
  return 'Gisteren';
}

export function AdminNotifications({
  notifications,
  unreadCount,
  soundEnabled,
  onToggleSound,
  onMarkAllRead,
  onViewOrders,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      onMarkAllRead();
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        className="relative p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
        title="Notificaties"
      >
        <Bell className="w-5 h-5 text-slate-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center notif-badge-pop">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-white">Recente Bestellingen</h3>
            <button
              onClick={onToggleSound}
              className="p-1.5 text-slate-400 hover:text-white rounded transition-colors"
              title={soundEnabled ? 'Geluid uitzetten' : 'Geluid aanzetten'}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">
                Nog geen bestellingen
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`px-4 py-3 border-b border-slate-700/50 last:border-0 transition-colors ${
                    notif.read ? '' : 'bg-blue-500/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      notif.read ? 'bg-slate-600' : 'bg-emerald-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">
                        {notif.customer_name}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {notif.seat_count} stoel{notif.seat_count !== 1 ? 'en' : ''} — EUR {notif.total_amount.toFixed(2)}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-500 flex-shrink-0 mt-0.5">
                      {timeAgo(notif.created_at)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-700 px-4 py-2.5">
            <button
              onClick={() => { setOpen(false); onViewOrders(); }}
              className="w-full text-center text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              <ShoppingCart className="w-3 h-3" />
              Alle bestellingen bekijken
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function OrderToast({ order, onDismiss }: { order: OrderNotification; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-slide-in">
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-slate-800/95 backdrop-blur-sm border border-emerald-500/30 shadow-xl max-w-sm">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <ShoppingCart className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Nieuwe bestelling!</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {order.customer_name} — {order.seat_count} stoel{order.seat_count !== 1 ? 'en' : ''} — EUR {order.total_amount.toFixed(2)}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-500 hover:text-white text-xs flex-shrink-0 mt-0.5"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
