import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, CreditCard as Edit2, Trash2, Save, X, Package, DollarSign, Users } from 'lucide-react';

interface TablePackage {
  id: string;
  name: string;
  description: string | null;
  included_people: number | null;
  included_items: Array<{ label: string; qty: number }>;
  base_price: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PackageFormData {
  name: string;
  description: string;
  included_people: string;
  included_items: Array<{ label: string; qty: number }>;
  base_price: string;
  currency: string;
  is_active: boolean;
}

const emptyForm: PackageFormData = {
  name: '',
  description: '',
  included_people: '',
  included_items: [],
  base_price: '',
  currency: 'EUR',
  is_active: true,
};

export function TablePackagesManager() {
  const [packages, setPackages] = useState<TablePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PackageFormData>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadPackages();
  }, []);

  async function loadPackages() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('table_packages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10000);

      if (error) throw error;
      setPackages(data || []);
    } catch (error: any) {
      console.error('Load packages error:', error);
      showMessage('error', `Fout bij laden: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  function startCreate() {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  }

  function startEdit(pkg: TablePackage) {
    setEditingId(pkg.id);
    setFormData({
      name: pkg.name,
      description: pkg.description || '',
      included_people: pkg.included_people?.toString() || '',
      included_items: pkg.included_items || [],
      base_price: pkg.base_price.toString(),
      currency: pkg.currency,
      is_active: pkg.is_active,
    });
    setShowForm(true);
  }

  function cancelEdit() {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        included_people: formData.included_people ? parseInt(formData.included_people) : null,
        included_items: formData.included_items,
        base_price: parseFloat(formData.base_price) || 0,
        currency: formData.currency,
        is_active: formData.is_active,
      };

      if (editingId) {
        const { error } = await supabase
          .from('table_packages')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;
        showMessage('success', 'Pakket bijgewerkt!');
      } else {
        const { error } = await supabase
          .from('table_packages')
          .insert(payload);

        if (error) throw error;
        showMessage('success', 'Pakket aangemaakt!');
      }

      cancelEdit();
      await loadPackages();
    } catch (error: any) {
      console.error('Save package error:', error);
      showMessage('error', `Fout bij opslaan: ${error.message}`);
    }
  }

  async function handleToggleActive(pkg: TablePackage) {
    try {
      const { error } = await supabase
        .from('table_packages')
        .update({ is_active: !pkg.is_active })
        .eq('id', pkg.id);

      if (error) throw error;
      showMessage('success', pkg.is_active ? 'Pakket gedeactiveerd' : 'Pakket geactiveerd');
      await loadPackages();
    } catch (error: any) {
      console.error('Toggle active error:', error);
      showMessage('error', `Fout: ${error.message}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Weet je zeker dat je dit pakket wilt verwijderen?')) return;

    try {
      const { error } = await supabase
        .from('table_packages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showMessage('success', 'Pakket verwijderd');
      await loadPackages();
    } catch (error: any) {
      console.error('Delete package error:', error);
      showMessage('error', `Fout bij verwijderen: ${error.message}`);
    }
  }

  function addIncludedItem() {
    setFormData({
      ...formData,
      included_items: [...formData.included_items, { label: '', qty: 1 }],
    });
  }

  function updateIncludedItem(index: number, field: 'label' | 'qty', value: string | number) {
    const updated = [...formData.included_items];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, included_items: updated });
  }

  function removeIncludedItem(index: number) {
    setFormData({
      ...formData,
      included_items: formData.included_items.filter((_, i) => i !== index),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6" />
            Tafel Pakketten
          </h2>
          <p className="text-white/70 text-sm mt-1">
            Definieer herbruikbare pakketten voor tafelreserveringen
          </p>
        </div>
        {!showForm && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nieuw Pakket
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-4">
            {editingId ? 'Pakket Bewerken' : 'Nieuw Pakket'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2 text-white">
                  Naam *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white"
                  placeholder="VIP Tafel Pakket"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-white">
                  Aantal Personen
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.included_people}
                  onChange={(e) => setFormData({ ...formData, included_people: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white"
                  placeholder="8"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-white">
                Beschrijving
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white"
                placeholder="Volledig pakket met drank en snacks..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-white">
                  Inclusief Items
                </label>
                <button
                  type="button"
                  onClick={addIncludedItem}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Item
                </button>
              </div>

              {formData.included_items.length === 0 ? (
                <p className="text-white/50 text-sm italic">Geen items toegevoegd</p>
              ) : (
                <div className="space-y-2">
                  {formData.included_items.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => updateIncludedItem(index, 'label', e.target.value)}
                        placeholder="Fles drank"
                        className="flex-1 px-3 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white text-sm"
                      />
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => updateIncludedItem(index, 'qty', parseInt(e.target.value) || 1)}
                        className="w-20 px-3 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeIncludedItem(index)}
                        className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-semibold mb-2 text-white">
                  Basis Prijs (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.base_price}
                  onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white"
                  placeholder="250.00"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-white">
                  Valuta
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-5 h-5"
              />
              <label htmlFor="is_active" className="text-white font-medium">
                Actief (zichtbaar voor organisatoren)
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                <Save className="w-5 h-5" />
                Opslaan
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="flex items-center gap-2 px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
                Annuleren
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {packages.length === 0 ? (
          <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-xl p-8 text-center">
            <Package className="w-16 h-16 text-white/30 mx-auto mb-4" />
            <p className="text-white/70">Geen pakketten gevonden</p>
            <p className="text-white/50 text-sm mt-2">Maak je eerste pakket aan</p>
          </div>
        ) : (
          packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`bg-slate-800/80 backdrop-blur border-2 rounded-xl p-6 ${
                pkg.is_active ? 'border-slate-600' : 'border-slate-700 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-white">{pkg.name}</h3>
                    {!pkg.is_active && (
                      <span className="px-2 py-1 bg-slate-700 text-white/70 text-xs rounded">
                        Inactief
                      </span>
                    )}
                  </div>

                  {pkg.description && (
                    <p className="text-white/70 mb-3">{pkg.description}</p>
                  )}

                  <div className="flex flex-wrap gap-4 text-sm">
                    {pkg.included_people && (
                      <div className="flex items-center gap-2 text-white">
                        <Users className="w-4 h-4 text-cyan-400" />
                        <span>{pkg.included_people} personen</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-white">
                      <DollarSign className="w-4 h-4 text-green-400" />
                      <span>€{pkg.base_price.toFixed(2)}</span>
                    </div>
                  </div>

                  {pkg.included_items && pkg.included_items.length > 0 && (
                    <div className="mt-3">
                      <p className="text-white/70 text-sm font-semibold mb-2">Inclusief:</p>
                      <ul className="space-y-1">
                        {pkg.included_items.map((item, idx) => (
                          <li key={idx} className="text-white/70 text-sm flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                            {item.qty}x {item.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(pkg)}
                    className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                    title="Bewerken"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(pkg)}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      pkg.is_active
                        ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300'
                        : 'bg-green-500/20 hover:bg-green-500/30 text-green-300'
                    }`}
                    title={pkg.is_active ? 'Deactiveren' : 'Activeren'}
                  >
                    {pkg.is_active ? 'Deactiveren' : 'Activeren'}
                  </button>
                  <button
                    onClick={() => handleDelete(pkg.id)}
                    className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
                    title="Verwijderen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
