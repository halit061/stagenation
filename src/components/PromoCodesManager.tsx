import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, Percent, Tag, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import type { Database } from '../lib/supabaseClient';

type PromoCode = Database['public']['Tables']['promo_codes']['Row'];
type TicketType = Database['public']['Tables']['ticket_types']['Row'];
type Event = Database['public']['Tables']['events']['Row'];

interface PromoCodesManagerProps {
  events: Event[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

interface PromoFormData {
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: string;
  ticket_type_id: string;
  valid_from: string;
  valid_until: string;
  max_uses: string;
  is_active: boolean;
}

const EMPTY_FORM: PromoFormData = {
  code: '',
  discount_type: 'percentage',
  discount_value: '',
  ticket_type_id: '',
  valid_from: '',
  valid_until: '',
  max_uses: '',
  is_active: true,
};

export function PromoCodesManager({ events, showToast }: PromoCodesManagerProps) {
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<PromoFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadPromoCodes = useCallback(async (eventId: string) => {
    if (!eventId) {
      setPromoCodes([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) {
      showToast(`Fout bij laden promo codes: ${error.message}`, 'error');
    } else {
      setPromoCodes((data ?? []) as PromoCode[]);
    }
    setLoading(false);
  }, [showToast]);

  const loadTicketTypes = useCallback(async (eventId: string) => {
    if (!eventId) {
      setTicketTypes([]);
      return;
    }
    const { data } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('name');
    setTicketTypes((data ?? []) as TicketType[]);
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadPromoCodes(selectedEventId);
      loadTicketTypes(selectedEventId);
    } else {
      setPromoCodes([]);
      setTicketTypes([]);
    }
  }, [selectedEventId, loadPromoCodes, loadTicketTypes]);

  const handleCreate = async () => {
    if (!selectedEventId) return;
    if (!formData.code.trim()) {
      showToast('Voer een promo code in', 'error');
      return;
    }
    if (!formData.discount_value || Number(formData.discount_value) <= 0) {
      showToast('Voer een geldige kortingswaarde in', 'error');
      return;
    }
    if (formData.discount_type === 'percentage' && Number(formData.discount_value) > 100) {
      showToast('Percentage mag niet hoger zijn dan 100', 'error');
      return;
    }

    setSaving(true);
    const row: Record<string, unknown> = {
      event_id: selectedEventId,
      code: formData.code.trim().toUpperCase(),
      discount_type: formData.discount_type,
      discount_value: Number(formData.discount_value),
      is_active: formData.is_active,
      used_count: 0,
    };
    if (formData.ticket_type_id) row.ticket_type_id = formData.ticket_type_id;
    if (formData.valid_from) row.valid_from = new Date(formData.valid_from).toISOString();
    if (formData.valid_until) row.valid_until = new Date(formData.valid_until).toISOString();
    if (formData.max_uses) row.max_uses = Number(formData.max_uses);

    const { error } = await supabase.from('promo_codes').insert(row);
    if (error) {
      showToast(`Fout: ${error.message}`, 'error');
    } else {
      showToast('Promo code aangemaakt', 'success');
      setShowModal(false);
      setFormData(EMPTY_FORM);
      loadPromoCodes(selectedEventId);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from('promo_codes').delete().eq('id', id);
    if (error) {
      showToast(`Fout bij verwijderen: ${error.message}`, 'error');
    } else {
      showToast('Promo code verwijderd', 'success');
      setPromoCodes(prev => prev.filter(p => p.id !== id));
    }
    setDeletingId(null);
  };

  const handleToggleActive = async (promo: PromoCode) => {
    setTogglingId(promo.id);
    const { error } = await supabase
      .from('promo_codes')
      .update({ is_active: !promo.is_active })
      .eq('id', promo.id);
    if (error) {
      showToast(`Fout: ${error.message}`, 'error');
    } else {
      setPromoCodes(prev =>
        prev.map(p => p.id === promo.id ? { ...p, is_active: !p.is_active } : p)
      );
    }
    setTogglingId(null);
  };

  const getTicketTypeName = (ttId: string | null) => {
    if (!ttId) return 'Alle tickets';
    const tt = ticketTypes.find(t => t.id === ttId);
    return tt ? tt.name : 'Onbekend';
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDiscount = (promo: PromoCode) => {
    if (promo.discount_type === 'percentage') return `${promo.discount_value}%`;
    return `\u20AC${(promo.discount_value / 100).toFixed(2)}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold mb-2 text-white">
            Promo<span className="text-red-400">codes</span>
          </h2>
          <p className="text-slate-400">Beheer kortingscodes per event</p>
        </div>
      </div>

      <div className="mb-6 bg-slate-800/60 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="flex-1 w-full">
            <label className="block text-sm font-semibold mb-2 text-white">Selecteer Event</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-white"
            >
              <option value="">-- Kies een event --</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>
          {selectedEventId && (
            <button
              onClick={() => { setFormData(EMPTY_FORM); setShowModal(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg font-semibold transition-colors text-white whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Nieuwe promo code
            </button>
          )}
        </div>
      </div>

      {!selectedEventId && (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <Tag className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-500">Selecteer een event om promo codes te beheren</p>
          </div>
        </div>
      )}

      {selectedEventId && loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-red-400" />
        </div>
      )}

      {selectedEventId && !loading && promoCodes.length === 0 && (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <Tag className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-500 mb-2">Nog geen promo codes voor dit event</p>
            <button
              onClick={() => { setFormData(EMPTY_FORM); setShowModal(true); }}
              className="text-red-400 hover:text-red-300 font-medium text-sm transition-colors"
            >
              Maak je eerste promo code aan
            </button>
          </div>
        </div>
      )}

      {selectedEventId && !loading && promoCodes.length > 0 && (
        <div className="bg-slate-800/60 backdrop-blur border-2 border-slate-600 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold">Code</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold">Type</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold">Korting</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold">Ticket type</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold">Geldig van</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold">Geldig tot</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-semibold">Gebruik</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-semibold">Status</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-semibold">Actie</th>
                </tr>
              </thead>
              <tbody>
                {promoCodes.map(promo => (
                  <tr key={promo.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-white bg-slate-700 px-2 py-0.5 rounded text-xs tracking-wider">
                        {promo.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <span className="flex items-center gap-1.5">
                        {promo.discount_type === 'percentage'
                          ? <><Percent className="w-3.5 h-3.5 text-blue-400" /> Percentage</>
                          : <><Tag className="w-3.5 h-3.5 text-emerald-400" /> Vast bedrag</>
                        }
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white font-semibold">
                      {formatDiscount(promo)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {getTicketTypeName(promo.ticket_type_id)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {formatDate(promo.valid_from)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {formatDate(promo.valid_until)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <span className="font-mono">
                        {promo.used_count}{promo.max_uses ? `/${promo.max_uses}` : ''}
                      </span>
                      {!promo.max_uses && (
                        <span className="text-slate-500 text-xs ml-1">onbeperkt</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(promo)}
                        disabled={togglingId === promo.id}
                        className="inline-flex items-center"
                      >
                        {togglingId === promo.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        ) : (
                          <span
                            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                              promo.is_active ? 'bg-emerald-500' : 'bg-slate-600'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 mt-0.5 ${
                                promo.is_active ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
                              }`}
                            />
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(promo.id)}
                        disabled={deletingId === promo.id}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-slate-700/50"
                      >
                        {deletingId === promo.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />
                        }
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border-2 border-slate-600 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-6">Nieuwe Promo Code</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5 text-white">Code</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="bv. ZOMER2026"
                  className="w-full px-4 py-2.5 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-white font-mono tracking-wider uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-white">Korting type</label>
                  <select
                    value={formData.discount_type}
                    onChange={(e) => setFormData({ ...formData, discount_type: e.target.value as 'percentage' | 'fixed' })}
                    className="w-full px-4 py-2.5 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-white"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Vast bedrag</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-white">
                    Waarde {formData.discount_type === 'percentage' ? '(%)' : '(centen)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={formData.discount_type === 'percentage' ? 100 : undefined}
                    value={formData.discount_value}
                    onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                    placeholder={formData.discount_type === 'percentage' ? '10' : '500'}
                    className="w-full px-4 py-2.5 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-white"
                  />
                  {formData.discount_type === 'fixed' && formData.discount_value && (
                    <p className="text-xs text-slate-500 mt-1">
                      = {'\u20AC'}{(Number(formData.discount_value) / 100).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 text-white">Ticket type</label>
                <select
                  value={formData.ticket_type_id}
                  onChange={(e) => setFormData({ ...formData, ticket_type_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-white"
                >
                  <option value="">Alle tickets</option>
                  {ticketTypes.map(tt => (
                    <option key={tt.id} value={tt.id}>{tt.name} - {'\u20AC'}{(tt.price / 100).toFixed(2)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-white">Geldig van</label>
                  <input
                    type="datetime-local"
                    value={formData.valid_from}
                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-white">Geldig tot</label>
                  <input
                    type="datetime-local"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 text-white">Max gebruik</label>
                <input
                  type="number"
                  min={1}
                  value={formData.max_uses}
                  onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                  placeholder="Leeg = onbeperkt"
                  className="w-full px-4 py-2.5 bg-slate-900/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-white"
                />
              </div>

              <div className="flex items-center justify-between bg-slate-700/30 rounded-lg px-4 py-3">
                <span className="text-sm font-semibold text-white">Direct actief</span>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                    formData.is_active ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 mt-0.5 ${
                      formData.is_active ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {formData.discount_type === 'percentage' && Number(formData.discount_value) > 50 && (
                <div className="flex items-start gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-400">
                    Let op: een korting van meer dan 50% is ongebruikelijk.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors text-white"
              >
                Annuleren
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg font-semibold transition-colors text-white flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Opslaan...</>
                ) : (
                  <><Plus className="w-4 h-4" /> Aanmaken</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
