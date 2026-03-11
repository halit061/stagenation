import { useState, useEffect, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface HourlySalesChartProps {
  eventId: string;
}

interface HourlyData {
  hour: string;
  label: string;
  ticketsSold: number;
  revenueCents: number;
}

export function HourlySalesChart({ eventId }: HourlySalesChartProps) {
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHourlyData();
  }, [eventId]);

  async function fetchHourlyData() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('created_at, total_amount, status')
        .eq('event_id', eventId)
        .eq('status', 'paid')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const hourMap = new Map<string, { ticketsSold: number; revenueCents: number }>();

      for (const order of data || []) {
        const date = new Date(order.created_at);
        const hourKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}`;

        if (!hourMap.has(hourKey)) {
          hourMap.set(hourKey, { ticketsSold: 0, revenueCents: 0 });
        }
        const entry = hourMap.get(hourKey)!;
        entry.ticketsSold += 1;
        entry.revenueCents += order.total_amount;
      }

      const sorted = Array.from(hourMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([hour, data]) => {
          const date = new Date(hour + ':00');
          const label = date.toLocaleString('nl-BE', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Brussels',
          });
          return { hour, label, ...data };
        });

      setHourlyData(sorted);
    } catch (error) {
      console.error('Error fetching hourly data:', error);
    } finally {
      setLoading(false);
    }
  }

  const maxTickets = useMemo(
    () => Math.max(...hourlyData.map((d) => d.ticketsSold), 1),
    [hourlyData]
  );

  const maxRevenue = useMemo(
    () => Math.max(...hourlyData.map((d) => d.revenueCents), 1),
    [hourlyData]
  );

  const totalTickets = useMemo(
    () => hourlyData.reduce((sum, d) => sum + d.ticketsSold, 0),
    [hourlyData]
  );

  const totalRevenue = useMemo(
    () => hourlyData.reduce((sum, d) => sum + d.revenueCents, 0),
    [hourlyData]
  );

  const [viewMode, setViewMode] = useState<'tickets' | 'revenue'>('tickets');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (hourlyData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <BarChart3 className="w-12 h-12 mb-3 opacity-50" />
        <p>Nog geen verkoopdata beschikbaar</p>
      </div>
    );
  }

  const displayData = hourlyData.slice(-48);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-red-400" />
          <h4 className="text-lg font-bold text-white">Verkoop per uur</h4>
        </div>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode('tickets')}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              viewMode === 'tickets'
                ? 'bg-red-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Tickets
          </button>
          <button
            onClick={() => setViewMode('revenue')}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              viewMode === 'revenue'
                ? 'bg-red-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Omzet
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-sm text-slate-400">Totaal tickets</div>
          <div className="text-xl font-bold text-white">{totalTickets}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-sm text-slate-400">Totale omzet</div>
          <div className="text-xl font-bold text-white">{'\u20AC'}{(totalRevenue / 100).toFixed(2)}</div>
        </div>
      </div>

      <div className="relative">
        <div className="flex items-end gap-1 h-48 overflow-x-auto pb-8">
          {displayData.map((d, i) => {
            const value = viewMode === 'tickets' ? d.ticketsSold : d.revenueCents;
            const max = viewMode === 'tickets' ? maxTickets : maxRevenue;
            const heightPercent = (value / max) * 100;
            const displayValue = viewMode === 'tickets'
              ? d.ticketsSold
              : `\u20AC${(d.revenueCents / 100).toFixed(0)}`;

            return (
              <div key={d.hour} className="flex flex-col items-center flex-shrink-0 group" style={{ minWidth: '32px' }}>
                <div className="relative w-full flex flex-col items-center">
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-slate-700 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 transition-opacity">
                    {displayValue}
                  </div>
                  <div
                    className="w-6 rounded-t transition-all duration-300 hover:opacity-80"
                    style={{
                      height: `${Math.max(heightPercent, 2)}%`,
                      minHeight: '4px',
                      background: viewMode === 'tickets'
                        ? 'linear-gradient(to top, #06b6d4, #22d3ee)'
                        : 'linear-gradient(to top, #22c55e, #4ade80)',
                    }}
                  />
                </div>
                {i % Math.max(1, Math.floor(displayData.length / 8)) === 0 && (
                  <div className="absolute bottom-0 text-[10px] text-slate-500 whitespace-nowrap transform rotate-[-45deg] origin-top-left mt-1">
                    {d.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
