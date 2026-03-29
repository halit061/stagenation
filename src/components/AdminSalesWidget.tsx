import { memo } from 'react';
import { TrendingUp, ShoppingCart, Clock, Armchair } from 'lucide-react';
import { st } from '../lib/seatTranslations';
import type { SalesStats } from '../hooks/useAdminSeatRealtime';

interface Props {
  stats: SalesStats;
}

export const AdminSalesWidget = memo(function AdminSalesWidget({ stats }: Props) {
  const pctSold = stats.seatsTotal > 0
    ? Math.round((stats.seatsSold / stats.seatsTotal) * 100)
    : 0;

  return (
    <div className="bg-slate-800 rounded-lg p-3 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{st(null, 'admin.sales')}</p>

      <div className="space-y-2">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Armchair className="w-3 h-3 text-emerald-400" aria-hidden="true" />
              {st(null, 'admin.sold')}
            </span>
            <span className="text-white font-semibold tabular-nums">
              {stats.seatsSold} / {stats.seatsTotal}
            </span>
          </div>
          <div
            className="h-2 rounded-full bg-slate-700 overflow-hidden"
            role="progressbar"
            aria-valuenow={pctSold}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={st(null, 'admin.sold')}
          >
            <div
              className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(pctSold, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 text-right">{pctSold}%</p>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-blue-400" aria-hidden="true" />
            {st(null, 'admin.revenue')}
          </span>
          <span className="text-white font-semibold tabular-nums">
            EUR {stats.revenue.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <ShoppingCart className="w-3 h-3 text-amber-400" aria-hidden="true" />
            {st(null, 'admin.orders')}
          </span>
          <span className="text-white font-semibold tabular-nums">
            {stats.orderCount}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-orange-400" aria-hidden="true" />
            {st(null, 'admin.activeHolds')}
          </span>
          <span className="text-white font-semibold tabular-nums">
            {stats.activeHolds}
          </span>
        </div>
      </div>
    </div>
  );
});
