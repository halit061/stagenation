import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Wine, Clock, CheckCircle, Package, Truck, User, QrCode, Loader, RefreshCw, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { localeMap, txt } from '../lib/translations';
import { useToast } from '../components/Toast';

interface DrinkOrder {
  id: string;
  event_id: string;
  display_code: string;
  status: string;
  fulfillment_type: 'DELIVERY' | 'PICKUP';
  pickup_bar: string | null;
  total_amount: number;
  customer_name: string | null;
  paid_at: string;
  created_at: string;
  table_bookings: {
    table_number: string;
  } | null;
}

interface DrinkOrderItem {
  id: string;
  drink_id: string;
  quantity: number;
  unit_price: number;
  drinks: {
    name: string;
    sku: string;
  };
}

interface Event {
  id: string;
  name: string;
}

export function BarOrders() {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [orders, setOrders] = useState<DrinkOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<DrinkOrder | null>(null);
  const [orderItems, setOrderItems] = useState<DrinkOrderItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'delivery' | 'pickup'>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'delivered'>('active');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authorized && selectedEventId) {
      loadOrders();
      subscribeToOrders();
    }
  }, [authorized, selectedEventId, statusFilter]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['SUPER_ADMIN', 'ADMIN', 'SCANNER'])
        .maybeSingle();

      if (!userRole) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      setAuthorized(true);

      const { data: eventsData } = await supabase
        .from('events')
        .select('id, name')
        .order('start_date', { ascending: false })
        .limit(10000);

      setEvents(eventsData || []);
      if (eventsData && eventsData.length > 0) {
        setSelectedEventId(eventsData[0].id);
      }

      setLoading(false);
    } catch (error: any) {
      console.error('Auth check error:', error);
      setAuthorized(false);
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      const statusFilters = statusFilter === 'active'
        ? ['PAID', 'IN_PROGRESS', 'READY']
        : ['DELIVERED'];

      const { data, error } = await supabase
        .from('drink_orders')
        .select('*, table_bookings(table_number)')
        .eq('event_id', selectedEventId)
        .in('status', statusFilters)
        .order('paid_at', { ascending: true })
        .limit(10000);

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      console.error('Error loading orders:', error);
    }
  };

  const subscribeToOrders = () => {
    const channel = supabase
      .channel('drink-orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drink_orders',
          filter: `event_id=eq.${selectedEventId}`
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const loadOrderItems = async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .from('drink_order_items')
        .select('*, drinks(name, sku)')
        .eq('drink_order_id', orderId)
        .limit(10000);

      if (error) throw error;
      setOrderItems(data || []);
    } catch (error: any) {
      console.error('Error loading order items:', error);
    }
  };

  const handleSelectOrder = (order: DrinkOrder) => {
    setSelectedOrder(order);
    loadOrderItems(order.id);
  };

  const handleUpdateStatus = async (orderId: string, action: 'in_progress' | 'ready' | 'deliver') => {
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/deliver-drink-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order_id: orderId, action }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update order');
      }

      showToast(txt(language, { nl: 'Status bijgewerkt!', tr: 'Durum güncellendi!', fr: 'Statut mis à jour !', de: 'Status aktualisiert!' }), 'success');
      setSelectedOrder(null);
      loadOrders();
    } catch (error: any) {
      console.error('Update error:', error);
      showToast(txt(language, { nl: `Fout: ${error.message}`, tr: `Hata: ${error.message}`, fr: `Erreur : ${error.message}`, de: `Fehler: ${error.message}` }), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'IN_PROGRESS':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'READY':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'DELIVERED':
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: { nl: string; tr: string; fr: string; de: string } } = {
      PAID: { nl: 'Nieuw', tr: 'Yeni', fr: 'Nouveau', de: 'Neu' },
      IN_PROGRESS: { nl: 'Bezig', tr: 'İşlemde', fr: 'En cours', de: 'In Bearbeitung' },
      READY: { nl: 'Klaar', tr: 'Hazır', fr: 'Prêt', de: 'Fertig' },
      DELIVERED: { nl: 'Geleverd', tr: 'Teslim Edildi', fr: 'Livré', de: 'Geliefert' },
    };
    return labels[status]?.[language || 'nl'];
  };

  const filteredOrders = orders.filter(order => {
    if (filter === 'delivery') return order.fulfillment_type === 'DELIVERY';
    if (filter === 'pickup') return order.fulfillment_type === 'PICKUP';
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            {txt(language, { nl: 'Geen Toegang', tr: 'Erişim Yok', fr: 'Accès Refusé', de: 'Kein Zugang' })}
          </h2>
          <p className="text-slate-300">
            {txt(language, { nl: 'Je hebt geen toestemming om deze pagina te bekijken.', tr: 'Bu sayfayı görüntüleme izniniz yok.', fr: 'Vous n\'avez pas la permission de voir cette page.', de: 'Sie haben keine Berechtigung, diese Seite anzuzeigen.' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">
            <span className="text-white">{txt(language, { nl: 'Bar', tr: 'Bar', fr: 'Bar', de: 'Bar' })}</span>
            <span className="text-red-400">{txt(language, { nl: 'bestellingen', tr: 'Siparişler', fr: 'commandes', de: 'bestellungen' })}</span>
          </h1>
          <p className="text-slate-300">
            {txt(language, { nl: 'Beheer drankenbestellingen', tr: 'İçecek siparişlerini yönetin', fr: 'Gérer les commandes de boissons', de: 'Getränkebestellungen verwalten' })}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              {txt(language, { nl: 'Event', tr: 'Etkinlik', fr: 'Événement', de: 'Veranstaltung' })}
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white"
            >
              {events.map(event => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              {txt(language, { nl: 'Status Filter', tr: 'Durum Filtresi', fr: 'Filtre de statut', de: 'Statusfilter' })}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setStatusFilter('active')}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
                  statusFilter === 'active'
                    ? 'bg-red-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {txt(language, { nl: 'Actief', tr: 'Aktif', fr: 'Actif', de: 'Aktiv' })}
              </button>
              <button
                onClick={() => setStatusFilter('delivered')}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
                  statusFilter === 'delivered'
                    ? 'bg-red-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {txt(language, { nl: 'Geleverd', tr: 'Teslim Edildi', fr: 'Livré', de: 'Geliefert' })}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              filter === 'all'
                ? 'bg-red-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {txt(language, { nl: 'Alles', tr: 'Hepsi', fr: 'Tout', de: 'Alle' })} ({filteredOrders.length})
          </button>
          <button
            onClick={() => setFilter('delivery')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
              filter === 'delivery'
                ? 'bg-red-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Truck className="w-5 h-5" />
            {txt(language, { nl: 'Levering', tr: 'Teslimat', fr: 'Livraison', de: 'Lieferung' })} ({orders.filter(o => o.fulfillment_type === 'DELIVERY').length})
          </button>
          <button
            onClick={() => setFilter('pickup')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
              filter === 'pickup'
                ? 'bg-red-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Package className="w-5 h-5" />
            {txt(language, { nl: 'Ophalen', tr: 'Teslim Alma', fr: 'Retrait', de: 'Abholung' })} ({orders.filter(o => o.fulfillment_type === 'PICKUP').length})
          </button>
          <button
            onClick={loadOrders}
            className="ml-auto flex items-center gap-2 px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {txt(language, { nl: 'Ververs', tr: 'Yenile', fr: 'Actualiser', de: 'Aktualisieren' })}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
                <Wine className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">
                  {txt(language, { nl: 'Geen bestellingen', tr: 'Sipariş yok', fr: 'Aucune commande', de: 'Keine Bestellungen' })}
                </p>
              </div>
            ) : (
              filteredOrders.map(order => (
                <div
                  key={order.id}
                  onClick={() => handleSelectOrder(order)}
                  className={`bg-slate-800 border rounded-xl p-6 cursor-pointer transition-all ${
                    selectedOrder?.id === order.id
                      ? 'border-red-500 shadow-lg shadow-red-500/20'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-3xl font-bold text-white mb-1">
                        #{order.display_code}
                      </div>
                      <div className="text-sm text-slate-400">
                        {new Date(order.paid_at).toLocaleTimeString(language ? localeMap[language] : 'nl-BE', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-lg border text-sm font-semibold ${getStatusColor(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-300">
                      {order.fulfillment_type === 'DELIVERY' ? (
                        <>
                          <Truck className="w-4 h-4" />
                          <span>{txt(language, { nl: 'Levering', tr: 'Teslimat', fr: 'Livraison', de: 'Lieferung' })}</span>
                          {order.table_bookings && (
                            <span className="ml-2 px-2 py-1 bg-slate-700 rounded text-xs">
                              {txt(language, { nl: 'Tafel', tr: 'Masa', fr: 'Table', de: 'Tisch' })} {order.table_bookings.table_number}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Package className="w-4 h-4" />
                          <span>{txt(language, { nl: 'Ophalen', tr: 'Teslim Alma', fr: 'Retrait', de: 'Abholung' })}</span>
                          <span className="ml-2 px-2 py-1 bg-slate-700 rounded text-xs">
                            {order.pickup_bar?.replace('BAR_', '')}
                          </span>
                        </>
                      )}
                    </div>
                    {order.customer_name && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <User className="w-4 h-4" />
                        <span>{order.customer_name}</span>
                      </div>
                    )}
                    <div className="text-2xl font-bold text-red-400">
                      €{order.total_amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div>
            {selectedOrder ? (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 sticky top-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-white">
                    {txt(language, { nl: 'Bestelling', tr: 'Sipariş', fr: 'Commande', de: 'Bestellung' })} #{selectedOrder.display_code}
                  </h3>
                  <div className={`px-3 py-1 rounded-lg border text-sm font-semibold ${getStatusColor(selectedOrder.status)}`}>
                    {getStatusLabel(selectedOrder.status)}
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <h4 className="font-semibold text-white">{txt(language, { nl: 'Items', tr: 'Ürünler', fr: 'Articles', de: 'Artikel' })}</h4>
                  {orderItems.map(item => (
                    <div key={item.id} className="flex justify-between items-center py-2 border-b border-slate-700">
                      <div>
                        <div className="text-white">
                          {item.drinks.name}
                        </div>
                        <div className="text-sm text-slate-400">
                          {item.quantity} x €{item.unit_price.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-white font-semibold">
                        €{(item.unit_price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-xl font-bold pt-2">
                    <span className="text-white">{txt(language, { nl: 'Totaal', tr: 'Toplam', fr: 'Total', de: 'Gesamt' })}</span>
                    <span className="text-red-400">€{selectedOrder.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedOrder.status === 'PAID' && (
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'in_progress')}
                      disabled={processing}
                      className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-bold disabled:opacity-50"
                    >
                      <Clock className="w-5 h-5" />
                      {txt(language, { nl: 'Start Maken', tr: 'Yapımına Başla', fr: 'Commencer', de: 'Zubereitung starten' })}
                    </button>
                  )}
                  {selectedOrder.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'ready')}
                      disabled={processing}
                      className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-bold disabled:opacity-50"
                    >
                      <CheckCircle className="w-5 h-5" />
                      {txt(language, { nl: 'Markeer als Klaar', tr: 'Hazır Olarak İşaretle', fr: 'Marquer comme prêt', de: 'Als fertig markieren' })}
                    </button>
                  )}
                  {(selectedOrder.status === 'READY' || selectedOrder.status === 'IN_PROGRESS' || selectedOrder.status === 'PAID') && (
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'deliver')}
                      disabled={processing}
                      className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-bold disabled:opacity-50"
                    >
                      <Package className="w-5 h-5" />
                      {txt(language, { nl: 'Geleverd', tr: 'Teslim Edildi', fr: 'Livré', de: 'Geliefert' })}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
                <QrCode className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">
                  {txt(language, { nl: 'Selecteer een bestelling om details te zien', tr: 'Ayrıntıları görmek için bir sipariş seçin', fr: 'Sélectionnez une commande pour voir les détails', de: 'Wählen Sie eine Bestellung, um Details anzuzeigen' })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
