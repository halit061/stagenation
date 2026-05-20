import { useState, useEffect, useMemo } from 'react';
import { Download, Filter, BarChart3, TrendingUp, Globe, Search } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getReferrerSource } from '../lib/sourceTracking';

interface SourceOrder {
  id: string;
  order_number: string;
  payer_name: string;
  payer_email: string;
  total_amount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  landing_page: string | null;
  first_visit_at: string | null;
}

interface SourceGroup {
  source: string;
  medium: string;
  campaign: string;
  orders: number;
  revenue: number;
  avgOrder: number;
}

export function AdminSourceTracking() {
  const [orders, setOrders] = useState<SourceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSource, setFilterSource] = useState<string>('');
  const [filterCampaign, setFilterCampaign] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grouped'>('table');

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, payer_name, payer_email, total_amount, status, created_at, paid_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_page, first_visit_at')
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (!error && data) {
      setOrders(data as SourceOrder[]);
    }
    setLoading(false);
  }

  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    orders.forEach(o => {
      if (o.utm_source) sources.add(o.utm_source);
    });
    return Array.from(sources).sort();
  }, [orders]);

  const uniqueCampaigns = useMemo(() => {
    const campaigns = new Set<string>();
    orders.forEach(o => {
      if (o.utm_campaign) campaigns.add(o.utm_campaign);
    });
    return Array.from(campaigns).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (filterSource && o.utm_source !== filterSource) return false;
      if (filterCampaign && o.utm_campaign !== filterCampaign) return false;
      if (filterDateFrom && o.created_at < filterDateFrom) return false;
      if (filterDateTo && o.created_at > filterDateTo + 'T23:59:59') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = o.payer_name?.toLowerCase().includes(q);
        const matchesEmail = o.payer_email?.toLowerCase().includes(q);
        const matchesOrder = o.order_number?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesOrder) return false;
      }
      return true;
    });
  }, [orders, filterSource, filterCampaign, filterDateFrom, filterDateTo, searchQuery]);

  const ordersWithSource = useMemo(() => filteredOrders.filter(o => o.utm_source || o.referrer), [filteredOrders]);
  const ordersWithoutSource = useMemo(() => filteredOrders.filter(o => !o.utm_source && !o.referrer), [filteredOrders]);

  const topSourceThisWeek = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekOrders = orders.filter(o => new Date(o.created_at) >= weekAgo && o.utm_source);
    const counts: Record<string, number> = {};
    weekOrders.forEach(o => {
      const src = o.utm_source!;
      counts[src] = (counts[src] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return entries[0] ? entries[0][0] : '-';
  }, [orders]);

  const topCampaignThisWeek = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekOrders = orders.filter(o => new Date(o.created_at) >= weekAgo && o.utm_campaign);
    const counts: Record<string, number> = {};
    weekOrders.forEach(o => {
      const c = o.utm_campaign!;
      counts[c] = (counts[c] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return entries[0] ? entries[0][0] : '-';
  }, [orders]);

  const groupedData = useMemo((): SourceGroup[] => {
    const groups: Record<string, { orders: number; revenue: number }> = {};
    filteredOrders.forEach(o => {
      const source = o.utm_source || getReferrerSource(o.referrer);
      const medium = o.utm_medium || '-';
      const campaign = o.utm_campaign || '-';
      const key = `${source}|${medium}|${campaign}`;
      if (!groups[key]) groups[key] = { orders: 0, revenue: 0 };
      groups[key].orders++;
      groups[key].revenue += o.total_amount || 0;
    });
    return Object.entries(groups)
      .map(([key, val]) => {
        const [source, medium, campaign] = key.split('|');
        return {
          source,
          medium,
          campaign,
          orders: val.orders,
          revenue: val.revenue,
          avgOrder: val.orders > 0 ? val.revenue / val.orders : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  function downloadCSV() {
    const headers = [
      'Order Number', 'Customer Name', 'Email', 'Total Amount (EUR)',
      'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Content',
      'UTM Term', 'Referrer', 'Referrer Category', 'Landing Page',
      'First Visit', 'Created At', 'Paid At'
    ];

    const escape = (val: unknown) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filteredOrders.map(o => [
      o.order_number,
      o.payer_name,
      o.payer_email,
      ((o.total_amount || 0) / 100).toFixed(2),
      o.utm_source || '',
      o.utm_medium || '',
      o.utm_campaign || '',
      o.utm_content || '',
      o.utm_term || '',
      o.referrer || '',
      getReferrerSource(o.referrer),
      o.landing_page ? extractPath(o.landing_page) : '',
      o.first_visit_at || '',
      o.created_at,
      o.paid_at || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(escape).join(','))
    ].join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `stagenation_sources_${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function extractPath(url: string): string {
    try {
      return new URL(url).pathname + new URL(url).search;
    } catch {
      return url;
    }
  }

  function formatAmount(cents: number): string {
    return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-3xl font-bold mb-2 text-white">
        Bron<span className="text-red-400"> Tracking</span>
      </h2>
      <p className="text-slate-400 mb-8">Bekijk waar je bezoekers en kopers vandaan komen</p>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-sm text-slate-400">Met bron-data</span>
          </div>
          <p className="text-2xl font-bold text-white">{ordersWithSource.length}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-slate-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-slate-400" />
            </div>
            <span className="text-sm text-slate-400">Zonder bron-data</span>
          </div>
          <p className="text-2xl font-bold text-white">{ordersWithoutSource.length}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-sm text-slate-400">Top bron (7d)</span>
          </div>
          <p className="text-lg font-bold text-white truncate">{topSourceThisWeek}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Filter className="w-5 h-5 text-orange-400" />
            </div>
            <span className="text-sm text-slate-400">Top campagne (7d)</span>
          </div>
          <p className="text-lg font-bold text-white truncate">{topCampaignThisWeek}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-slate-400 mb-1 block">Zoeken</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Naam, email, ordernr..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs text-slate-400 mb-1 block">Bron</label>
            <select
              value={filterSource}
              onChange={e => setFilterSource(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Alle bronnen</option>
              {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs text-slate-400 mb-1 block">Campagne</label>
            <select
              value={filterCampaign}
              onChange={e => setFilterCampaign(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Alle campagnes</option>
              {uniqueCampaigns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="text-xs text-slate-400 mb-1 block">Vanaf</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="min-w-[130px]">
            <label className="text-xs text-slate-400 mb-1 block">Tot</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            onClick={() => { setFilterSource(''); setFilterCampaign(''); setFilterDateFrom(''); setFilterDateTo(''); setSearchQuery(''); }}
            className="px-3 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* View Toggle + Download */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('table')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'table' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Tabel
          </button>
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'grouped' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Gegroepeerd
          </button>
        </div>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </button>
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Order</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Klant</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Bedrag</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Bron</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Medium</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Campagne</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Referrer</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Landing</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Datum</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.slice(0, 200).map(o => (
                  <tr key={o.id} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-cyan-400 text-xs">{o.order_number}</td>
                    <td className="px-4 py-3">
                      <div className="text-white text-sm">{o.payer_name}</div>
                      <div className="text-slate-500 text-xs">{o.payer_email}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-medium">{formatAmount(o.total_amount)}</td>
                    <td className="px-4 py-3">
                      {o.utm_source ? (
                        <span className="inline-flex px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded text-xs font-medium">{o.utm_source}</span>
                      ) : (
                        <span className="text-slate-600 text-xs">{getReferrerSource(o.referrer)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{o.utm_medium || '-'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[120px] truncate">{o.utm_campaign || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[150px] truncate" title={o.referrer || ''}>
                      {o.referrer ? getReferrerSource(o.referrer) : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[120px] truncate" title={o.landing_page || ''}>
                      {o.landing_page ? extractPath(o.landing_page) : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredOrders.length > 200 && (
            <div className="px-4 py-3 text-center text-sm text-slate-500 border-t border-slate-700/50">
              Toont 200 van {filteredOrders.length} orders. Gebruik filters of download CSV voor alle data.
            </div>
          )}
          {filteredOrders.length === 0 && (
            <div className="px-4 py-12 text-center text-slate-500">
              Geen orders gevonden met huidige filters.
            </div>
          )}
        </div>
      )}

      {/* Grouped View */}
      {viewMode === 'grouped' && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Bron</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Medium</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Campagne</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Orders</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Totaal omzet</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Gem. order</th>
                </tr>
              </thead>
              <tbody>
                {groupedData.map((g, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded text-xs font-medium">{g.source}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-sm">{g.medium}</td>
                    <td className="px-4 py-3 text-slate-300 text-sm">{g.campaign}</td>
                    <td className="px-4 py-3 text-right text-white font-bold">{g.orders}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-medium">{formatAmount(g.revenue)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatAmount(g.avgOrder)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {groupedData.length === 0 && (
            <div className="px-4 py-12 text-center text-slate-500">
              Geen gegroepeerde data beschikbaar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
