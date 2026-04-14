import { useState, useEffect } from 'react';
import { supabase, verifySession } from '../lib/supabaseClient';
import { callEdgeFunction } from '../lib/callEdge';
import { Plus, CreditCard as Edit2, Trash2, Save, X, Download, Wine, Grid2x2 as Grid, Package } from 'lucide-react';
import { useToast } from './Toast';

interface DrinkCategory {
  id: string;
  name_nl: string;
  name_tr: string;
  sort_order: number;
  is_active: boolean;
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

interface DrinkStock {
  id: string;
  event_id: string;
  drink_id: string;
  stock_initial: number;
  stock_current: number;
  drink?: Drink;
}

interface Event {
  id: string;
  name: string;
}

export function DrinksManager() {
  const { showToast } = useToast();
  const [view, setView] = useState<'categories' | 'drinks' | 'stock'>('categories');
  const [categories, setCategories] = useState<DrinkCategory[]>([]);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [stock, setStock] = useState<DrinkStock[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [, setLoading] = useState(false);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showDrinkForm, setShowDrinkForm] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingDrinkId, setEditingDrinkId] = useState<string | null>(null);

  const [categoryForm, setCategoryForm] = useState({
    name_nl: '',
    name_tr: '',
    sort_order: 0,
    is_active: true,
  });

  const [drinkForm, setDrinkForm] = useState({
    category_id: '',
    name: '',
    price: 0,
    sku: '',
    is_active: true,
    image_url: '',
  });

  const [stockForm, setStockForm] = useState<{ [key: string]: { stock_initial: number; stock_current: number } }>({});

  useEffect(() => {
    validateSession();
  }, []);

  useEffect(() => {
    loadData();
  }, [view, selectedEventId]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async () => {
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const validateSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Session error:', error);
        showToast('Sessie verlopen, ververs de pagina en log opnieuw in', 'error');
        return;
      }
      if (!session) {
        showToast('Geen actieve sessie, log opnieuw in', 'error');
        return;
      }
    } catch (error) {
      console.error('Session validation error:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (view === 'categories') {
        const { data, error } = await supabase
          .from('drink_categories')
          .select('*')
          .order('sort_order')
          .limit(10000);
        if (error) throw error;
        setCategories(data || []);
      } else if (view === 'drinks') {
        const { data, error } = await supabase
          .from('drinks')
          .select('*')
          .order('name')
          .limit(10000);
        if (error) throw error;
        setDrinks(data || []);

        const { data: categoriesData } = await supabase
          .from('drink_categories')
          .select('*')
          .order('sort_order')
          .limit(10000);
        setCategories(categoriesData || []);
      } else if (view === 'stock') {
        const { data: eventsData } = await supabase
          .from('events')
          .select('id, name')
          .order('start_date', { ascending: false })
          .limit(10000);
        setEvents(eventsData || []);

        if (selectedEventId) {
          const { data: stockData, error: stockError } = await supabase
            .from('drink_stock')
            .select('*, drinks(*)')
            .eq('event_id', selectedEventId)
            .limit(10000);
          if (stockError) throw stockError;
          setStock(stockData || []);
        }

        const { data: drinksData } = await supabase
          .from('drinks')
          .select('*')
          .eq('is_active', true)
          .order('name')
          .limit(10000);
        setDrinks(drinksData || []);
      }
    } catch (error: any) {
      console.error('Error loading data:', error);
      showToast(`Error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCategory = async () => {
    try {
      const sessionCheck = await verifySession();

      if (!sessionCheck.valid || !sessionCheck.session) {
        throw new Error(
          `Sessie ongeldig: ${sessionCheck.error}\n\n` +
          `Ververs de pagina en log opnieuw in.`
        );
      }

      const endpoint = editingCategoryId
        ? 'admin-update-drink-category'
        : 'admin-create-drink-category';

      const body = editingCategoryId
        ? { ...categoryForm, id: editingCategoryId }
        : categoryForm;

      const result = await callEdgeFunction({
        functionName: endpoint,
        body,
      });

      if (!result.ok) {
        console.error('[DrinksManager] Category save error:', result.status, result.code, result.error);
        throw new Error(result.error || 'Failed to save category');
      }

      showToast('Categorie opgeslagen!', 'success');
      setShowCategoryForm(false);
      setEditingCategoryId(null);
      setCategoryForm({ name_nl: '', name_tr: '', sort_order: 0, is_active: true });
      loadData();
    } catch (error: any) {
      console.error('[DrinksManager] Error saving category:', error);
      showToast('Fout bij opslaan categorie. Probeer het opnieuw.', 'error');
    }
  };

  const handleSaveDrink = async () => {
    try {
      const endpoint = editingDrinkId
        ? 'admin-update-drink'
        : 'admin-create-drink';

      const body = editingDrinkId
        ? { ...drinkForm, id: editingDrinkId }
        : drinkForm;

      const result = await callEdgeFunction({
        functionName: endpoint,
        body,
      });

      if (!result.ok) {
        console.error('[DrinksManager] Drink save error:', result.status, result.code, result.error);
        throw new Error(result.error || 'Failed to save drink');
      }

      showToast('Drankje opgeslagen!', 'success');
      setShowDrinkForm(false);
      setEditingDrinkId(null);
      setDrinkForm({ category_id: '', name: '', price: 0, sku: '', is_active: true, image_url: '' });
      loadData();
    } catch (error: any) {
      console.error('Error saving drink:', error);
      showToast('Fout bij opslaan drankje. Probeer het opnieuw.', 'error');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze categorie wilt verwijderen?')) return;
    try {
      const result = await callEdgeFunction({
        functionName: 'admin-delete-drink-category',
        body: { id },
      });

      if (!result.ok) {
        throw new Error(result.error || 'Failed to delete category');
      }

      showToast('Categorie verwijderd!', 'success');
      loadData();
    } catch (error: any) {
      console.error('Error deleting category:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  };

  const handleDeleteDrink = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit drankje wilt verwijderen?')) return;
    try {
      const result = await callEdgeFunction({
        functionName: 'admin-delete-drink',
        body: { id },
      });

      if (!result.ok) {
        throw new Error(result.error || 'Failed to delete drink');
      }

      showToast('Drankje verwijderd!', 'success');
      loadData();
    } catch (error: any) {
      console.error('Error deleting drink:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  };

  const handleUpdateStock = async () => {
    if (!selectedEventId) {
      showToast('Selecteer eerst een event', 'error');
      return;
    }

    try {
      for (const drinkId in stockForm) {
        const formData = stockForm[drinkId];

        const result = await callEdgeFunction({
          functionName: 'admin-update-drink-stock',
          body: {
            event_id: selectedEventId,
            drink_id: drinkId,
            stock_initial: formData.stock_initial,
            stock_current: formData.stock_current,
          },
        });

        if (!result.ok) {
          throw new Error(result.error || 'Failed to update stock');
        }
      }

      showToast('Voorraad bijgewerkt!', 'success');
      setStockForm({});
      loadData();
    } catch (error: any) {
      console.error('Error updating stock:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  };

  const exportCatalog = () => {
    const csv = [
      'category_nl,category_tr,name,price,sku,active',
      ...drinks.map(drink => {
        const category = categories.find(c => c.id === drink.category_id);
        return `"${category?.name_nl || ''}","${category?.name_tr || ''}","${drink.name}",${drink.price},"${drink.sku}",${drink.is_active ? 'yes' : 'no'}`;
      })
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drinks-catalog-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportStock = () => {
    if (!selectedEventId) {
      showToast('Selecteer eerst een event', 'error');
      return;
    }

    const csv = [
      'drink_sku,drink_name,stock_initial,stock_current',
      ...stock.map(s => {
        const drink = drinks.find(d => d.id === s.drink_id);
        return `"${drink?.sku || ''}","${drink?.name || ''}",${s.stock_initial},${s.stock_current}`;
      })
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drinks-stock-${selectedEventId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Drankenbeheer</h2>
        <div className="flex gap-2">
          {view === 'drinks' && (
            <button
              onClick={exportCatalog}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Catalogus
            </button>
          )}
          {view === 'stock' && selectedEventId && (
            <button
              onClick={exportStock}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Voorraad
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setView('categories')}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
            view === 'categories'
              ? 'bg-red-500 text-white'
              : 'bg-slate-800 text-white hover:bg-slate-700'
          }`}
        >
          <Grid className="w-5 h-5" />
          Categorieën
        </button>
        <button
          onClick={() => setView('drinks')}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
            view === 'drinks'
              ? 'bg-red-500 text-white'
              : 'bg-slate-800 text-white hover:bg-slate-700'
          }`}
        >
          <Wine className="w-5 h-5" />
          Drankjes
        </button>
        <button
          onClick={() => setView('stock')}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
            view === 'stock'
              ? 'bg-red-500 text-white'
              : 'bg-slate-800 text-white hover:bg-slate-700'
          }`}
        >
          <Package className="w-5 h-5" />
          Voorraad per Event
        </button>
      </div>

      {view === 'categories' && (
        <div>
          <div className="mb-4">
            <button
              onClick={() => {
                setCategoryForm({ name_nl: '', name_tr: '', sort_order: categories.length, is_active: true });
                setEditingCategoryId(null);
                setShowCategoryForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nieuwe Categorie
            </button>
          </div>

          {showCategoryForm && (
            <div className="bg-slate-800 rounded-xl p-6 mb-6">
              <h3 className="text-xl font-bold mb-4 text-white">{editingCategoryId ? 'Categorie Bewerken' : 'Nieuwe Categorie'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Naam (NL)</label>
                  <input
                    type="text"
                    value={categoryForm.name_nl}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name_nl: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">İsim (TR)</label>
                  <input
                    type="text"
                    value={categoryForm.name_tr}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name_tr: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Sorteervolgorde</label>
                  <input
                    type="number"
                    value={categoryForm.sort_order}
                    onChange={(e) => setCategoryForm({ ...categoryForm, sort_order: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Actief</label>
                  <input
                    type="checkbox"
                    checked={categoryForm.is_active}
                    onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })}
                    className="w-5 h-5"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveCategory}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                >
                  <Save className="w-4 h-4" />
                  Opslaan
                </button>
                <button
                  onClick={() => {
                    setShowCategoryForm(false);
                    setEditingCategoryId(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
                >
                  <X className="w-4 h-4" />
                  Annuleren
                </button>
              </div>
            </div>
          )}

          <div className="bg-slate-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="text-left p-4 text-white font-semibold">Naam (NL)</th>
                  <th className="text-left p-4 text-white font-semibold">İsim (TR)</th>
                  <th className="text-left p-4 text-white font-semibold">Volgorde</th>
                  <th className="text-left p-4 text-white font-semibold">Status</th>
                  <th className="text-left p-4 text-white font-semibold">Acties</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-t border-slate-700">
                    <td className="p-4 text-white">{category.name_nl}</td>
                    <td className="p-4 text-white">{category.name_tr}</td>
                    <td className="p-4 text-white">{category.sort_order}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs ${category.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                        {category.is_active ? 'Actief' : 'Inactief'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setCategoryForm(category);
                            setEditingCategoryId(category.id);
                            setShowCategoryForm(true);
                          }}
                          className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          className="p-2 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'drinks' && (
        <div>
          <div className="mb-4">
            <button
              onClick={() => {
                setDrinkForm({ category_id: '', name: '', price: 0, sku: '', is_active: true, image_url: '' });
                setEditingDrinkId(null);
                setShowDrinkForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nieuw Drankje
            </button>
          </div>

          {showDrinkForm && (
            <div className="bg-slate-800 rounded-xl p-6 mb-6">
              <h3 className="text-xl font-bold mb-4 text-white">{editingDrinkId ? 'Drankje Bewerken' : 'Nieuw Drankje'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Categorie</label>
                  <select
                    value={drinkForm.category_id}
                    onChange={(e) => setDrinkForm({ ...drinkForm, category_id: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                  >
                    <option value="">Selecteer categorie</option>
                    {categories.filter(c => c.is_active).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name_nl}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">SKU (uniek)</label>
                  <input
                    type="text"
                    value={drinkForm.sku}
                    onChange={(e) => setDrinkForm({ ...drinkForm, sku: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-white/50"
                    placeholder="bijv: BEER001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Naam (identiek in alle talen)</label>
                  <input
                    type="text"
                    value={drinkForm.name}
                    onChange={(e) => setDrinkForm({ ...drinkForm, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-white/50"
                    placeholder="bijv: Heineken, Coca-Cola, Vodka Red Bull"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Prijs (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={drinkForm.price}
                    onChange={(e) => setDrinkForm({ ...drinkForm, price: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Actief</label>
                  <input
                    type="checkbox"
                    checked={drinkForm.is_active}
                    onChange={(e) => setDrinkForm({ ...drinkForm, is_active: e.target.checked })}
                    className="w-5 h-5"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveDrink}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                >
                  <Save className="w-4 h-4" />
                  Opslaan
                </button>
                <button
                  onClick={() => {
                    setShowDrinkForm(false);
                    setEditingDrinkId(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
                >
                  <X className="w-4 h-4" />
                  Annuleren
                </button>
              </div>
            </div>
          )}

          <div className="bg-slate-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="text-left p-4 text-white font-semibold">SKU</th>
                  <th className="text-left p-4 text-white font-semibold">Naam</th>
                  <th className="text-left p-4 text-white font-semibold">Categorie</th>
                  <th className="text-left p-4 text-white font-semibold">Prijs</th>
                  <th className="text-left p-4 text-white font-semibold">Status</th>
                  <th className="text-left p-4 text-white font-semibold">Acties</th>
                </tr>
              </thead>
              <tbody>
                {drinks.map((drink) => {
                  const category = categories.find(c => c.id === drink.category_id);
                  return (
                    <tr key={drink.id} className="border-t border-slate-700">
                      <td className="p-4 font-mono text-sm text-white">{drink.sku}</td>
                      <td className="p-4 text-white">{drink.name}</td>
                      <td className="p-4 text-white">{category?.name_nl || '-'}</td>
                      <td className="p-4 text-white">€{drink.price.toFixed(2)}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs ${drink.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                          {drink.is_active ? 'Actief' : 'Inactief'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setDrinkForm({ ...drink, image_url: drink.image_url || '' });
                              setEditingDrinkId(drink.id);
                              setShowDrinkForm(true);
                            }}
                            className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDrink(drink.id)}
                            className="p-2 bg-red-500 text-white rounded hover:bg-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'stock' && (
        <div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-white">Selecteer Event</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full md:w-96 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
            >
              <option value="">Kies een event...</option>
              {events.map(event => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>
          </div>

          {selectedEventId && (
            <>
              <div className="bg-slate-800 rounded-xl p-6 mb-6">
                <h3 className="text-xl font-bold mb-4 text-white">Voorraad Beheren</h3>
                <div className="space-y-4">
                  {drinks.map(drink => {
                    const currentStock = stock.find(s => s.drink_id === drink.id);
                    const formValue = stockForm[drink.id] || {
                      stock_initial: currentStock?.stock_initial || 0,
                      stock_current: currentStock?.stock_current || 0,
                    };

                    return (
                      <div key={drink.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center p-4 bg-slate-900 rounded-lg">
                        <div>
                          <div className="font-medium text-white">{drink.name}</div>
                          <div className="text-sm text-white/75">{drink.sku}</div>
                        </div>
                        <div>
                          <label className="block text-xs text-white mb-1">Initiële Voorraad</label>
                          <input
                            type="number"
                            value={formValue.stock_initial}
                            onChange={(e) => setStockForm({
                              ...stockForm,
                              [drink.id]: { ...formValue, stock_initial: parseInt(e.target.value) || 0 }
                            })}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white placeholder:text-white/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-white mb-1">Huidige Voorraad</label>
                          <input
                            type="number"
                            value={formValue.stock_current}
                            onChange={(e) => setStockForm({
                              ...stockForm,
                              [drink.id]: { ...formValue, stock_current: parseInt(e.target.value) || 0 }
                            })}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white placeholder:text-white/50"
                          />
                        </div>
                        <div>
                          {currentStock && (
                            <div className="text-sm">
                              <div className="text-white">Verkocht:</div>
                              <div className="text-xl font-bold text-red-400">
                                {currentStock.stock_initial - currentStock.stock_current}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={handleUpdateStock}
                  className="mt-4 flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  <Save className="w-5 h-5" />
                  Voorraad Bijwerken
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
