import { useMemo } from 'react';
import { TrendingUp, ShoppingCart, Clock, Armchair } from 'lucide-react';
import type { SalesStats } from '../hooks/useAdminSeatRealtime';

interface Props {
  stats: SalesStats;
}

export function AdminSalesWidget({ stats }: Props) {
  const pctSold = stats.seatsTotal > 0
    ? Math.round((stats.seatsSold / stats.seatsTotal) * 100)
    : 0;

  return (
    <div className="bg-slate-800 rounded-lg p-3 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Verkoop</p>

      <div className="space-y-2">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Armchair className="w-3 h-3 text-emerald-400" />
              Verkocht
            </span>
            <span className="text-white font-semibold tabular-nums">
              {stats.seatsSold} / {stats.seatsTotal}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(pctSold, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 text-right">{pctSold}%</p>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-blue-400" />
            Omzet
          </span>
          <span className="text-white font-semibold tabular-nums">
            EUR {stats.revenue.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <ShoppingCart className="w-3 h-3 text-amber-400" />
            Bestellingen
          </span>
          <span className="text-white font-semibold tabular-nums">
            {stats.orderCount}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-orange-400" />
            Gereserveerd nu
          </span>
          <span className="text-white font-semibold tabular-nums">
            {stats.activeHolds}
          </span>
        </div>
      </div>
    </div>
  );
}
