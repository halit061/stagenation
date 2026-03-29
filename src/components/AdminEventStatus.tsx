import { memo } from 'react';
import { Calendar } from 'lucide-react';
import { st } from '../lib/seatTranslations';
import type { SalesStats } from '../hooks/useAdminSeatRealtime';

interface EventInfo {
  name: string;
  start_date: string;
}

interface Props {
  event: EventInfo | null;
  stats: SalesStats;
}

export const AdminEventStatus = memo(function AdminEventStatus({ event, stats }: Props) {
  if (!event) {
    return (
      <p className="text-xs text-slate-500">
        {st(null, 'admin.noEvent')}
      </p>
    );
  }

  const formattedDate = new Date(event.start_date).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  let badge: { label: string; color: string };
  const availablePct = stats.seatsTotal > 0
    ? ((stats.seatsTotal - stats.seatsSold) / stats.seatsTotal) * 100
    : 100;

  if (stats.seatsSold === 0 && stats.orderCount === 0) {
    badge = { label: st(null, 'admin.salesNotStarted'), color: 'bg-slate-600 text-slate-300' };
  } else if (stats.seatsSold >= stats.seatsTotal && stats.seatsTotal > 0) {
    badge = { label: st(null, 'admin.soldOut'), color: 'bg-red-500/20 text-red-400' };
  } else if (availablePct <= 10) {
    badge = { label: st(null, 'admin.almostSoldOut'), color: 'bg-amber-500/20 text-amber-400' };
  } else {
    badge = { label: st(null, 'admin.salesActive'), color: 'bg-emerald-500/20 text-emerald-400' };
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
      <span className="text-slate-300 truncate max-w-[200px]">{event.name}</span>
      <span className="text-slate-500" aria-hidden="true">—</span>
      <span className="text-slate-400">{formattedDate}</span>
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.color}`}>
        {badge.label}
      </span>
    </div>
  );
});
