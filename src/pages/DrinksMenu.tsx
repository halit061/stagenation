import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Wine, Plus, Minus, ShoppingCart, Check, Loader, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { txt } from '../lib/translations';
import { useToast } from '../components/Toast';

interface DrinkCategory {
  id: string;
  name_nl: string;
  name_tr: string;
  sort_order: number;
}

interface Drink {
  id: string;
  category_id: string;
  name: string;
  price: number;
  sku: string;
  is_active: boolean;
  image_url: string | null;
}

interface CartItem {
  drink: Drink;
  quantity: number;
}

interface Event {
  id: string;
  name: string;
  slug: string;
}

export function DrinksMenu() {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [categories, setCategories] = useState<DrinkCategory[]>([]);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [stock, setStock] = useState<Map<string, number>>(new Map());
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [fulfillmentType, setFulfillmentType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [pickupBar, setPickupBar] = useState<'BAR_MAIN' | 'BAR_PICKUP' | 'BAR_LOUNGE'>('BAR_MAIN');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadData();
      subscribeToStock();
    }
  }, [selectedEventId]);

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, name, slug')
        .eq('is_active', true)
        .gte('end_date', new Date().toISOString())
        .order('start_date')
        .limit(10000);

      if (error) throw error;
      setEvents(data || []);
      if (data && data.length > 0) {
        setSelectedEventId(data[0].id);
      }
    } catch (error: any) {
      console.error('Error loading events:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: categoriesData, error: catError } = await supabase
        .from('drink_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .limit(10000);

      if (catError) throw catError;
      setCategories(categoriesData || []);

      const { data: drinksData, error: drinksError } = await supabase
        .from('drinks')
        .select('*')
        .eq('is_active', true)
        .order('name')
        .limit(10000);

      if (drinksError) throw drinksError;
      setDrinks(drinksData || []);

      const { data: stockData, error: stockError } = await supabase
        .from('drink_stock')
        .select('drink_id, stock_current')
        .eq('event_id', selectedEventId)
        .limit(10000);

      if (stockError) throw stockError;

      const stockMap = new Map<string, number>();
      stockData?.forEach(s => stockMap.set(s.drink_id, s.stock_current));
      setStock(stockMap);
    } catch (error: any) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToStock = () => {
    const channel = supabase
      .channel('drink-stock-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drink_stock',
          filter: `event_id=eq.${selectedEventId}`
        },
        (payload: any) => {
          if (payload.new) {
            setStock(prev => new Map(prev).set(payload.new.drink_id, payload.new.stock_current));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const addToCart = (drink: Drink) => {
    const availableStock = stock.get(drink.id) || 0;
    const currentInCart = cart.find(item => item.drink.id === drink.id)?.quantity || 0;

    if (currentInCart >= availableStock) {
      showToast(txt(language, { nl: 'Niet genoeg voorraad beschikbaar', tr: 'Yeterli stok yok', fr: 'Stock insuffisant', de: 'Nicht genügend Vorrat verfügbar' }), 'error');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.drink.id === drink.id);
      if (existing) {
        return prev.map(item =>
          item.drink.id === drink.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { drink, quantity: 1 }];
    });
  };

  const removeFromCart = (drinkId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.drink.id === drinkId);
      if (existing && existing.quantity > 1) {
        return prev.map(item =>
          item.drink.id === drinkId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }
      return prev.filter(item => item.drink.id !== drinkId);
    });
  };

  const getTotalAmount = () => {
    return cart.reduce((sum, item) => sum + (item.drink.price * item.quantity), 0);
  };

  const handleCheckout = async () => {
    if (!customerEmail || !customerName) {
      showToast(txt(language, { nl: 'Vul je naam en e-mail in', tr: 'Adınızı ve e-postanızı girin', fr: 'Veuillez entrer votre nom et e-mail', de: 'Bitte geben Sie Ihren Namen und Ihre E-Mail ein' }), 'error');
      return;
    }

    if (cart.length === 0) {
      showToast(txt(language, { nl: 'Je winkelwagen is leeg', tr: 'Sepetiniz boş', fr: 'Votre panier est vide', de: 'Ihr Warenkorb ist leer' }), 'error');
      return;
    }

    setProcessing(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/create-drink-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_id: selectedEventId,
          items: cart.map(item => ({
            drink_id: item.drink.id,
            quantity: item.quantity,
          })),
          fulfillment_type: fulfillmentType,
          pickup_bar: fulfillmentType === 'PICKUP' ? pickupBar : undefined,
          customer_email: customerEmail,
          customer_name: customerName,
          redirect_url: window.location.origin,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create order');
      }

      const data = await response.json();
      window.location.href = data.payment_url;
    } catch (error: any) {
      console.error('Checkout error:', error);
      showToast(txt(language, { nl: 'Er ging iets mis. Probeer het opnieuw.', tr: 'Bir hata oluştu. Tekrar deneyin.', fr: 'Une erreur est survenue. Veuillez réessayer.', de: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' }), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const filteredDrinks = selectedCategory === 'all'
    ? drinks
    : drinks.filter(d => d.category_id === selectedCategory);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="text-white">{txt(language, { nl: 'Dranken', tr: 'İçecekler', fr: 'Boissons', de: 'Getränke' })}</span>
            <span className="text-red-400">menu</span>
          </h1>
          <p className="text-slate-300 text-lg">
            {txt(language, { nl: 'Bestel je drankjes voor levering of ophalen', tr: 'Teslimat veya teslim alma için içeceklerinizi sipariş edin', fr: 'Commandez vos boissons pour livraison ou retrait', de: 'Bestellen Sie Ihre Getränke zur Lieferung oder Abholung' })}
          </p>
        </div>

        {events.length > 1 && (
          <div className="mb-8 max-w-md mx-auto">
            <label className="block text-sm font-medium mb-2 text-slate-300">
              {txt(language, { nl: 'Selecteer Event', tr: 'Etkinlik Seçin', fr: 'Sélectionner un événement', de: 'Veranstaltung auswählen' })}
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
        )}

        <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-6 py-3 rounded-lg font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-red-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {txt(language, { nl: 'Alles', tr: 'Hepsi', fr: 'Tout', de: 'Alle' })}
          </button>
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-6 py-3 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === category.id
                  ? 'bg-red-500 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {txt(language, { nl: category.name_nl, tr: category.name_tr })}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {filteredDrinks.map(drink => {
            const availableStock = stock.get(drink.id) || 0;
            const inCart = cart.find(item => item.drink.id === drink.id)?.quantity || 0;
            const isOutOfStock = availableStock === 0;

            return (
              <div
                key={drink.id}
                className={`bg-slate-800 border border-slate-700 rounded-xl overflow-hidden ${
                  isOutOfStock ? 'opacity-50' : ''
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className={`text-xl font-bold mb-1 ${isOutOfStock ? 'text-slate-500 line-through' : 'text-white'}`}>
                        {drink.name}
                      </h3>
                      <p className={`text-2xl font-bold ${isOutOfStock ? 'text-slate-500 line-through' : 'text-red-400'}`}>
                        €{drink.price.toFixed(2)}
                      </p>
                    </div>
                    <Wine className="w-8 h-8 text-slate-600" />
                  </div>

                  {isOutOfStock ? (
                    <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-center">
                      <p className="text-red-400 font-semibold">
                        {txt(language, { nl: 'Uitverkocht', tr: 'Tükendi', fr: 'Épuisé', de: 'Ausverkauft' })}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-slate-400 mb-4">
                        {txt(language, { nl: 'Voorraad', tr: 'Stok', fr: 'Stock', de: 'Vorrat' })}: {availableStock}
                      </div>
                      {inCart > 0 ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => removeFromCart(drink.id)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <div className="px-6 py-3 bg-red-500 text-white rounded-lg font-bold text-center min-w-[60px]">
                            {inCart}
                          </div>
                          <button
                            onClick={() => addToCart(drink)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(drink)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-semibold"
                        >
                          <Plus className="w-5 h-5" />
                          {txt(language, { nl: 'Toevoegen', tr: 'Ekle', fr: 'Ajouter', de: 'Hinzufügen' })}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-4 shadow-2xl z-50">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-slate-400">
                  {cart.length} {txt(language, { nl: 'items', tr: 'ürün', fr: 'articles', de: 'Artikel' })}
                </div>
                <div className="text-2xl font-bold text-white">
                  €{getTotalAmount().toFixed(2)}
                </div>
              </div>
              <button
                onClick={() => setShowCheckout(true)}
                className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-bold"
              >
                <ShoppingCart className="w-5 h-5" />
                {txt(language, { nl: 'Afrekenen', tr: 'Ödeme', fr: 'Payer', de: 'Zur Kasse' })}
              </button>
            </div>
          </div>
        )}

        {showCheckout && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">
                  {txt(language, { nl: 'Bestelling Afronden', tr: 'Siparişi Tamamla', fr: 'Finaliser la commande', de: 'Bestellung abschließen' })}
                </h2>
                <button
                  onClick={() => setShowCheckout(false)}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h3 className="font-semibold text-white mb-4">
                    {txt(language, { nl: 'Je Bestelling', tr: 'Siparişiniz', fr: 'Votre commande', de: 'Ihre Bestellung' })}
                  </h3>
                  {cart.map(item => (
                    <div key={item.drink.id} className="flex justify-between items-center py-2">
                      <div>
                        <div className="text-white">
                          {item.drink.name}
                        </div>
                        <div className="text-sm text-slate-400">
                          {item.quantity} x €{item.drink.price.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-white font-semibold">
                        €{(item.drink.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-slate-700 pt-2 mt-2">
                    <div className="flex justify-between items-center text-xl font-bold">
                      <span className="text-white">{txt(language, { nl: 'Totaal', tr: 'Toplam', fr: 'Total', de: 'Gesamt' })}</span>
                      <span className="text-red-400">€{getTotalAmount().toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">
                    {txt(language, { nl: 'Naam', tr: 'Ad', fr: 'Nom', de: 'Name' })}
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    placeholder={txt(language, { nl: 'Jouw naam', tr: 'Adınız', fr: 'Votre nom', de: 'Ihr Name' })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">
                    {txt(language, { nl: 'E-mail', tr: 'E-posta', fr: 'E-mail', de: 'E-Mail' })}
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">
                    {txt(language, { nl: 'Levering Type', tr: 'Teslimat Türü', fr: 'Type de livraison', de: 'Lieferart' })}
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setFulfillmentType('DELIVERY')}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        fulfillmentType === 'DELIVERY'
                          ? 'border-red-500 bg-red-500/10'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-white font-semibold">
                        {txt(language, { nl: 'Levering', tr: 'Teslimat', fr: 'Livraison', de: 'Lieferung' })}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {txt(language, { nl: 'Naar je tafel', tr: 'Masanıza', fr: 'À votre table', de: 'An Ihren Tisch' })}
                      </div>
                    </button>
                    <button
                      onClick={() => setFulfillmentType('PICKUP')}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        fulfillmentType === 'PICKUP'
                          ? 'border-red-500 bg-red-500/10'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-white font-semibold">
                        {txt(language, { nl: 'Ophalen', tr: 'Teslim Alma', fr: 'Retrait', de: 'Abholung' })}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {txt(language, { nl: 'Bij de bar', tr: 'Bardan', fr: 'Au bar', de: 'An der Bar' })}
                      </div>
                    </button>
                  </div>
                </div>

                {fulfillmentType === 'PICKUP' && (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      {txt(language, { nl: 'Ophaal Locatie', tr: 'Teslim Alma Yeri', fr: 'Lieu de retrait', de: 'Abholort' })}
                    </label>
                    <select
                      value={pickupBar}
                      onChange={(e) => setPickupBar(e.target.value as any)}
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    >
                      <option value="BAR_MAIN">{txt(language, { nl: 'Hoofd Bar', tr: 'Ana Bar', fr: 'Bar principal', de: 'Hauptbar' })}</option>
                      <option value="BAR_PICKUP">{txt(language, { nl: 'Ophaal Bar', tr: 'Teslim Alma Barı', fr: 'Bar de retrait', de: 'Abholbar' })}</option>
                      <option value="BAR_LOUNGE">{txt(language, { nl: 'Lounge Bar', tr: 'Lounge Bar', fr: 'Bar lounge', de: 'Lounge-Bar' })}</option>
                    </select>
                  </div>
                )}

                <button
                  onClick={handleCheckout}
                  disabled={processing}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      {txt(language, { nl: 'Verwerken...', tr: 'İşleniyor...', fr: 'Traitement...', de: 'Verarbeitung...' })}
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      {txt(language, { nl: 'Betalen', tr: 'Ödeme Yap', fr: 'Payer', de: 'Bezahlen' })}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
