import { useState, useEffect } from 'react';
import { Ticket, DollarSign, TrendingUp, RefreshCw, Receipt, Percent, Euro } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface LiveSalesCounterProps {
  eventId: string;
  eventName: string;
}

interface SalesData {
  totalTicketsSold: number;
  totalRevenueCents: number;
  totalTicketsRemaining: number;
}

interface FinancialBreakdown {
  ticketPriceCents: number;
  serviceFeeCents: number;
  omzetCents: number;
}

export function LiveSalesCounter({ eventId, eventName }: LiveSalesCounterProps) {
  const [sales, setSales] = useState<SalesData>({
    totalTicketsSold: 0,
    totalRevenueCents: 0,
    totalTicketsRemaining: 0,
  });
  const [breakdown, setBreakdown] = useState<FinancialBreakdown>({
    ticketPriceCents: 0,
    serviceFeeCents: 0,
    omzetCents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);

  async function fetchSalesData() {
    try {
      const [paidOrdersRes, allSoldOrdersRes, ticketTypesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, total_amount')
          .eq('event_id', eventId)
          .eq('status', 'paid')
          .limit(10000),
        supabase
          .from('orders')
          .select('id')
          .eq('event_id', eventId)
          .in('status', ['paid', 'comped'])
          .limit(10000),
        supabase
          .from('ticket_types')
          .select('id, quantity_total')
          .eq('event_id', eventId)
          .limit(10000),
      ]);

      const paidOrders = paidOrdersRes.data || [];
      const allSoldOrders = allSoldOrdersRes.data || [];
      const ticketTypes = ticketTypesRes.data || [];
      const totalCapacity = ticketTypes.reduce((sum, tt) => sum + tt.quantity_total, 0);
      const totalRevenueCents = paidOrders.reduce((sum, o) => sum + o.total_amount, 0);

      // Count tickets from paid + comped orders for accurate total
      const allSoldOrderIds = allSoldOrders.map(o => o.id);
      let totalTicketsSold = 0;
      if (allSoldOrderIds.length > 0) {
        const { data: ticketsData } = await supabase
          .from('tickets')
          .select('id')
          .in('order_id', allSoldOrderIds)
          .limit(10000);
        totalTicketsSold = ticketsData?.length || 0;
      }

      setSales({
        totalTicketsSold,
        totalRevenueCents,
        totalTicketsRemaining: totalCapacity - totalTicketsSold,
      });

      const { data: breakdownOrders } = await supabase
        .from('orders')
        .select('total_amount, service_fee_total_cents')
        .eq('event_id', eventId)
        .in('status', ['paid', 'comped'])
        .limit(10000);

      if (breakdownOrders) {
        const totalAmount = breakdownOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const serviceFee = breakdownOrders.reduce((sum, o) => sum + (o.service_fee_total_cents || 0), 0);
        setBreakdown({
          ticketPriceCents: totalAmount - serviceFee,
          serviceFeeCents: serviceFee,
          omzetCents: totalAmount,
        });
      }
    } catch (error) {
      console.error('Error fetching sales data:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSalesData();

    const channel = supabase
      .channel(`live-sales-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          setPulse(true);
          fetchSalesData();
          setTimeout(() => setPulse(false), 1000);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ticket_types',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          fetchSalesData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white">{eventName}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <span className="text-sm text-green-400 font-medium">Live</span>
          </div>
        </div>
        <button
          onClick={fetchSalesData}
          className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          title="Vernieuwen"
        >
          <RefreshCw className="w-4 h-4 text-slate-300" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-5 transition-all ${pulse ? 'ring-2 ring-cyan-400 scale-[1.02]' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <Ticket className="w-6 h-6 text-cyan-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">Verkocht</span>
          </div>
          <div className="text-3xl font-bold text-white">{sales.totalTicketsSold}</div>
          <div className="text-sm text-slate-400 mt-1">tickets verkocht</div>
        </div>

        <div className={`bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-5 transition-all ${pulse ? 'ring-2 ring-green-400 scale-[1.02]' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <Euro className="w-6 h-6 text-green-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">Omzet</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {'\u20AC'}{(sales.totalRevenueCents / 100).toFixed(2)}
          </div>
          <div className="text-sm text-slate-400 mt-1">totale omzet</div>
        </div>

        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-6 h-6 text-amber-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">Resterend</span>
          </div>
          <div className="text-3xl font-bold text-white">{sales.totalTicketsRemaining}</div>
          <div className="text-sm text-slate-400 mt-1">tickets beschikbaar</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <div className="bg-slate-700/40 border border-slate-600/40 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Receipt className="w-5 h-5 text-blue-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Ticket prijs</span>
          </div>
          <div className="text-xl font-bold text-white">
            {'\u20AC'}{(breakdown.ticketPriceCents / 100).toFixed(2)}
          </div>
        </div>

        <div className="bg-slate-700/40 border border-slate-600/40 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Percent className="w-5 h-5 text-orange-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Service fee</span>
          </div>
          <div className="text-xl font-bold text-white">
            {'\u20AC'}{(breakdown.serviceFeeCents / 100).toFixed(2)}
          </div>
        </div>

        <div className="bg-slate-700/40 border border-slate-600/40 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Euro className="w-5 h-5 text-emerald-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Omzet</span>
          </div>
          <div className="text-xl font-bold text-white">
            {'\u20AC'}{(breakdown.omzetCents / 100).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
