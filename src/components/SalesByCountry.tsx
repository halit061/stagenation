import { useState, useEffect } from 'react';
import { Globe, Download, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface SalesByCountryProps {
  eventId: string;
}

interface CountryRow {
  country: string | null;
  ticketCount: number;
  orderCount: number;
}

interface CityRow {
  city: string;
  country: string;
  ticketCount: number;
}

const FLAG_MAP: Record<string, string> = {
  BE: '\u{1F1E7}\u{1F1EA}',
  NL: '\u{1F1F3}\u{1F1F1}',
  FR: '\u{1F1EB}\u{1F1F7}',
  DE: '\u{1F1E9}\u{1F1EA}',
  LU: '\u{1F1F1}\u{1F1FA}',
  GB: '\u{1F1EC}\u{1F1E7}',
  US: '\u{1F1FA}\u{1F1F8}',
};

const NAME_MAP: Record<string, string> = {
  BE: 'Belgi\u00EB',
  NL: 'Nederland',
  FR: 'Frankrijk',
  DE: 'Duitsland',
  LU: 'Luxemburg',
  GB: 'Verenigd Koninkrijk',
  US: 'Verenigde Staten',
};

function getFlag(code: string | null): string {
  if (!code) return '\u2753';
  return FLAG_MAP[code.toUpperCase()] || '\u{1F3F3}\u{FE0F}';
}

function getName(code: string | null): string {
  if (!code) return 'Onbekend';
  const upper = code.toUpperCase();
  return NAME_MAP[upper] || upper;
}

export function SalesByCountry({ eventId }: SalesByCountryProps) {
  const [rows, setRows] = useState<CountryRow[]>([]);
  const [cityRows, setCityRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalTickets, setTotalTickets] = useState(0);
  const [showCities, setShowCities] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, billing_country, billing_city')
          .eq('event_id', eventId)
          .in('status', ['paid', 'comped'])
          .limit(10000);

        if (!orders || orders.length === 0) {
          setRows([]);
          setCityRows([]);
          setTotalTickets(0);
          setLoading(false);
          return;
        }

        const orderIds = orders.map((o) => o.id);

        const [ticketsRes, seatsRes] = await Promise.all([
          supabase
            .from('tickets')
            .select('id, order_id')
            .in('order_id', orderIds)
            .limit(10000),
          supabase
            .from('ticket_seats')
            .select('id, order_id')
            .in('order_id', orderIds)
            .limit(10000),
        ]);
        const tickets = [...(ticketsRes.data || []), ...(seatsRes.data || [])];

        const orderMap = new Map<string, { country: string | null; city: string | null }>();
        for (const o of orders) {
          orderMap.set(o.id, { country: o.billing_country, city: o.billing_city });
        }

        const grouped = new Map<string | null, { tickets: number; orderIds: Set<string> }>();
        const cityGrouped = new Map<string, { tickets: number; country: string }>();

        for (const t of tickets) {
          const info = orderMap.get(t.order_id);
          const country = info?.country?.toUpperCase() ?? null;
          const city = info?.city?.trim() || null;

          if (!grouped.has(country)) {
            grouped.set(country, { tickets: 0, orderIds: new Set() });
          }
          const entry = grouped.get(country)!;
          entry.tickets += 1;
          entry.orderIds.add(t.order_id);

          const cityKey = `${(city || 'Onbekend').toLowerCase()}|${country || 'XX'}`;
          if (!cityGrouped.has(cityKey)) {
            cityGrouped.set(cityKey, { tickets: 0, country: getName(country) });
          }
          cityGrouped.get(cityKey)!.tickets += 1;
        }

        const result: CountryRow[] = [];
        let total = 0;
        grouped.forEach((val, key) => {
          total += val.tickets;
          result.push({
            country: key,
            ticketCount: val.tickets,
            orderCount: val.orderIds.size,
          });
        });

        const cityResult: CityRow[] = [];
        cityGrouped.forEach((val, key) => {
          const cityName = key.split('|')[0];
          cityResult.push({
            city: cityName.charAt(0).toUpperCase() + cityName.slice(1),
            country: val.country,
            ticketCount: val.tickets,
          });
        });
        cityResult.sort((a, b) => b.ticketCount - a.ticketCount);

        result.sort((a, b) => b.ticketCount - a.ticketCount);
        setRows(result);
        setCityRows(cityResult);
        setTotalTickets(total);
      } catch (err) {
        console.error('Error fetching sales by country:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    const channel = supabase
      .channel(`country-sales-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  function downloadCSV() {
    const header = 'Gemeente,Land,Aantal Tickets\n';
    const csvRows = cityRows.map((r) => `"${r.city}","${r.country}",${r.ticketCount}`).join('\n');
    const blob = new Blob([header + csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `verkoop-per-gemeente-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <Globe className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm">Nog geen verkoopdata per land beschikbaar</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-red-400" />
          <h3 className="text-lg font-bold text-white">Verkoop per land</h3>
        </div>
        {cityRows.length > 0 && (
          <button
            onClick={downloadCSV}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-600/50">
              <th className="pb-3 pr-4 text-xs text-slate-400 uppercase tracking-wider font-medium" />
              <th className="pb-3 pr-4 text-xs text-slate-400 uppercase tracking-wider font-medium">Land</th>
              <th className="pb-3 pr-4 text-xs text-slate-400 uppercase tracking-wider font-medium text-right">Tickets</th>
              <th className="pb-3 pr-4 text-xs text-slate-400 uppercase tracking-wider font-medium text-right">Orders</th>
              <th className="pb-3 text-xs text-slate-400 uppercase tracking-wider font-medium text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const pct = totalTickets > 0 ? ((row.ticketCount / totalTickets) * 100).toFixed(1) : '0.0';
              return (
                <tr key={row.country ?? '_null'} className={i < rows.length - 1 ? 'border-b border-slate-700/40' : ''}>
                  <td className="py-3 pr-4 text-lg">{getFlag(row.country)}</td>
                  <td className="py-3 pr-4 text-sm font-medium text-white">{getName(row.country)}</td>
                  <td className="py-3 pr-4 text-sm text-slate-300 text-right font-mono">{row.ticketCount}</td>
                  <td className="py-3 pr-4 text-sm text-slate-300 text-right font-mono">{row.orderCount}</td>
                  <td className="py-3 text-sm text-right">
                    <span className="inline-block bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded text-xs font-mono">
                      {pct}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600/50">
              <td className="pt-3 pr-4" />
              <td className="pt-3 pr-4 text-sm font-bold text-white">Totaal</td>
              <td className="pt-3 pr-4 text-sm text-white text-right font-mono font-bold">{totalTickets}</td>
              <td className="pt-3 pr-4 text-sm text-white text-right font-mono font-bold">
                {rows.reduce((s, r) => s + r.orderCount, 0)}
              </td>
              <td className="pt-3 text-sm text-right">
                <span className="inline-block bg-slate-700/60 text-white px-2 py-0.5 rounded text-xs font-mono font-bold">
                  100%
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {cityRows.length > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-bold text-white">Verkoop per gemeente</h3>
            </div>
            <button
              onClick={() => setShowCities(!showCities)}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              {showCities ? 'Verbergen' : `Toon alle (${cityRows.length})`}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-600/50">
                  <th className="pb-3 pr-4 text-xs text-slate-400 uppercase tracking-wider font-medium">Gemeente</th>
                  <th className="pb-3 pr-4 text-xs text-slate-400 uppercase tracking-wider font-medium">Land</th>
                  <th className="pb-3 pr-4 text-xs text-slate-400 uppercase tracking-wider font-medium text-right">Tickets</th>
                  <th className="pb-3 text-xs text-slate-400 uppercase tracking-wider font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {(showCities ? cityRows : cityRows.slice(0, 10)).map((row, i) => {
                  const pct = totalTickets > 0 ? ((row.ticketCount / totalTickets) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={`${row.city}-${row.country}-${i}`} className="border-b border-slate-700/40">
                      <td className="py-2.5 pr-4 text-sm font-medium text-white">{row.city}</td>
                      <td className="py-2.5 pr-4 text-sm text-slate-400">{row.country}</td>
                      <td className="py-2.5 pr-4 text-sm text-slate-300 text-right font-mono">{row.ticketCount}</td>
                      <td className="py-2.5 text-sm text-right">
                        <span className="inline-block bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded text-xs font-mono">
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
