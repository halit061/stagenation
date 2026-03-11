import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Check, Loader2, DoorOpen, Tag, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface Entrance {
  id: string;
  event_id: string;
  name: string;
  created_at: string;
}

interface TicketTypeRow {
  id: string;
  event_id: string;
  name: string;
  entrance_id: string | null;
  color: string | null;
  phase_group: string | null;
  phase_order: number;
  created_at: string;
}

interface Event {
  id: string;
  name: string;
}

interface Props {
  events: Event[];
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#64748b', '#ffffff',
];

export function EntrancesTicketTypesManager({ events }: Props) {
  const [selectedEventId, setSelectedEventId] = useState('');
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [entranceForm, setEntranceForm] = useState({ name: '' });
  const [editingEntrance, setEditingEntrance] = useState<Entrance | null>(null);
  const [showEntranceForm, setShowEntranceForm] = useState(false);
  const [savingEntrance, setSavingEntrance] = useState(false);
  const [deletingEntranceId, setDeletingEntranceId] = useState<string | null>(null);

  const [ttForm, setTtForm] = useState({ name: '', entrance_id: '', color: '', phase_group: '', phase_order: 0 });
  const [editingTt, setEditingTt] = useState<TicketTypeRow | null>(null);
  const [showTtForm, setShowTtForm] = useState(false);
  const [savingTt, setSavingTt] = useState(false);
  const [deletingTtId, setDeletingTtId] = useState<string | null>(null);

  const loadData = useCallback(async (eventId: string) => {
    if (!eventId) return;
    setLoading(true);
    setError('');
    try {
      const [{ data: ents, error: e1 }, { data: tts, error: e2 }] = await Promise.all([
        supabase.from('entrances').select('*').eq('event_id', eventId).order('created_at'),
        supabase.from('ticket_types').select('id, event_id, name, entrance_id, color, phase_group, phase_order, created_at').eq('event_id', eventId).order('phase_group', { ascending: true, nullsFirst: true }).order('phase_order').order('created_at'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setEntrances(ents || []);
      setTicketTypes(tts || []);
    } catch (err: any) {
      setError(err.message || 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId) loadData(selectedEventId);
    else { setEntrances([]); setTicketTypes([]); }
  }, [selectedEventId, loadData]);

  function openAddEntrance() {
    setEditingEntrance(null);
    setEntranceForm({ name: '' });
    setShowEntranceForm(true);
  }

  function openEditEntrance(e: Entrance) {
    setEditingEntrance(e);
    setEntranceForm({ name: e.name });
    setShowEntranceForm(true);
  }

  async function saveEntrance() {
    if (!entranceForm.name.trim()) return;
    setSavingEntrance(true);
    setError('');
    try {
      if (editingEntrance) {
        const { error } = await supabase
          .from('entrances')
          .update({ name: entranceForm.name.trim() })
          .eq('id', editingEntrance.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('entrances')
          .insert({ event_id: selectedEventId, name: entranceForm.name.trim() });
        if (error) throw error;
      }
      setShowEntranceForm(false);
      setEditingEntrance(null);
      await loadData(selectedEventId);
    } catch (err: any) {
      setError(err.message || 'Opslaan mislukt');
    } finally {
      setSavingEntrance(false);
    }
  }

  async function deleteEntrance(id: string) {
    setDeletingEntranceId(id);
    setError('');
    try {
      const { error } = await supabase.from('entrances').delete().eq('id', id);
      if (error) throw error;
      await loadData(selectedEventId);
    } catch (err: any) {
      setError(err.message || 'Verwijderen mislukt');
    } finally {
      setDeletingEntranceId(null);
    }
  }

  function openAddTt() {
    setEditingTt(null);
    setTtForm({ name: '', entrance_id: '', color: '', phase_group: '', phase_order: 0 });
    setShowTtForm(true);
  }

  function openEditTt(tt: TicketTypeRow) {
    setEditingTt(tt);
    setTtForm({ name: tt.name, entrance_id: tt.entrance_id || '', color: tt.color || '', phase_group: tt.phase_group || '', phase_order: tt.phase_order || 0 });
    setShowTtForm(true);
  }

  async function saveTt() {
    if (!ttForm.name.trim()) return;
    setSavingTt(true);
    setError('');
    try {
      const payload = {
        name: ttForm.name.trim(),
        entrance_id: ttForm.entrance_id || null,
        color: ttForm.color || null,
        phase_group: ttForm.phase_group.trim() || null,
        phase_order: ttForm.phase_group.trim() ? ttForm.phase_order : 0,
      };
      if (editingTt) {
        const { error } = await supabase.from('ticket_types').update(payload).eq('id', editingTt.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ticket_types')
          .insert({ ...payload, event_id: selectedEventId });
        if (error) throw error;
      }
      setShowTtForm(false);
      setEditingTt(null);
      await loadData(selectedEventId);
    } catch (err: any) {
      setError(err.message || 'Opslaan mislukt');
    } finally {
      setSavingTt(false);
    }
  }

  async function deleteTt(id: string) {
    setDeletingTtId(id);
    setError('');
    try {
      // Check if tickets exist for this type before deleting
      const { data: existingTickets } = await supabase
        .from('tickets')
        .select('id')
        .eq('ticket_type_id', id)
        .limit(1);

      if (existingTickets && existingTickets.length > 0) {
        setError('Dit tickettype kan niet worden verwijderd omdat er al tickets voor verkocht zijn.');
        setDeletingTtId(null);
        return;
      }

      const { error } = await supabase.from('ticket_types').delete().eq('id', id);
      if (error) throw error;
      await loadData(selectedEventId);
    } catch (err: any) {
      setError(err.message || 'Verwijderen mislukt');
    } finally {
      setDeletingTtId(null);
    }
  }

  function getEntranceName(id: string | null) {
    if (!id) return <span className="text-slate-500 italic">—</span>;
    const e = entrances.find(e => e.id === id);
    return e ? e.name : <span className="text-slate-500 italic">Onbekend</span>;
  }

  return (
    <div>
      <h2 className="text-3xl font-bold mb-2 text-white">
        Ingangen &amp; <span className="text-red-400">Tickettypen</span>
      </h2>
      <p className="text-slate-400 mb-8">Beheer ingangen en tickettypen per evenement</p>

      <div className="mb-8">
        <label className="block text-sm font-medium text-slate-300 mb-2">Selecteer evenement</label>
        <select
          value={selectedEventId}
          onChange={e => setSelectedEventId(e.target.value)}
          className="bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 min-w-64"
        >
          <option value="">— Kies een evenement —</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {!selectedEventId && (
        <div className="text-center py-16 text-slate-500">
          Selecteer een evenement om te beginnen
        </div>
      )}

      {selectedEventId && loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-red-400" />
        </div>
      )}

      {selectedEventId && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ── ENTRANCES PANEL ── */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <DoorOpen className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-white">Ingangen</h3>
                <span className="text-xs bg-slate-700 text-slate-300 rounded-full px-2 py-0.5">{entrances.length}</span>
              </div>
              <button
                onClick={openAddEntrance}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Toevoegen
              </button>
            </div>

            {showEntranceForm && (
              <div className="px-6 py-4 bg-slate-700/40 border-b border-slate-700">
                <p className="text-sm font-medium text-slate-200 mb-3">
                  {editingEntrance ? 'Ingang bewerken' : 'Nieuwe ingang'}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Naam ingang (bijv. Hoofdingang)"
                    value={entranceForm.name}
                    onChange={e => setEntranceForm({ name: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && saveEntrance()}
                    className="flex-1 bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    autoFocus
                  />
                  <button
                    onClick={saveEntrance}
                    disabled={savingEntrance || !entranceForm.name.trim()}
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {savingEntrance ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => { setShowEntranceForm(false); setEditingEntrance(null); }}
                    className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {entrances.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-500 text-sm">
                Nog geen ingangen. Voeg er een toe.
              </div>
            ) : (
              <ul className="divide-y divide-slate-700">
                {entrances.map(ent => (
                  <li key={ent.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span className="text-white text-sm font-medium">{ent.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditEntrance(ent)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                        title="Bewerken"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteEntrance(ent.id)}
                        disabled={deletingEntranceId === ent.id}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                        title="Verwijderen"
                      >
                        {deletingEntranceId === ent.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── TICKET TYPES PANEL ── */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <Tag className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-white">Tickettypen</h3>
                <span className="text-xs bg-slate-700 text-slate-300 rounded-full px-2 py-0.5">{ticketTypes.length}</span>
              </div>
              <button
                onClick={openAddTt}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Toevoegen
              </button>
            </div>

            {showTtForm && (
              <div className="px-6 py-4 bg-slate-700/40 border-b border-slate-700 space-y-3">
                <p className="text-sm font-medium text-slate-200">
                  {editingTt ? 'Tickettype bewerken' : 'Nieuw tickettype'}
                </p>
                <input
                  type="text"
                  placeholder="Naam (bijv. VIP, Regular)"
                  value={ttForm.name}
                  onChange={e => setTtForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  autoFocus
                />
                <select
                  value={ttForm.entrance_id}
                  onChange={e => setTtForm(f => ({ ...f, entrance_id: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">— Geen ingang gekoppeld —</option>
                  {entrances.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.name}</option>
                  ))}
                </select>
                <div>
                  <p className="text-xs text-slate-400 mb-2">Kleur (optioneel)</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setTtForm(f => ({ ...f, color: f.color === c ? '' : c }))}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${
                          ttForm.color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                    {ttForm.color && !PRESET_COLORS.includes(ttForm.color) && (
                      <div
                        className="w-7 h-7 rounded-full border-2 border-white"
                        style={{ backgroundColor: ttForm.color }}
                      />
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="#hex of naam"
                    value={ttForm.color}
                    onChange={e => setTtForm(f => ({ ...f, color: e.target.value }))}
                    className="mt-2 w-full bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-2">Fase Groep (optioneel)</p>
                  <input
                    type="text"
                    placeholder="bijv. golden_circle, regular"
                    value={ttForm.phase_group}
                    onChange={e => setTtForm(f => ({ ...f, phase_group: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Leeg = altijd beschikbaar. Zelfde groep = sequentieel ontgrendelen.</p>
                </div>
                {ttForm.phase_group.trim() && (
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Fase Volgorde</p>
                    <input
                      type="number"
                      min="0"
                      value={ttForm.phase_order}
                      onChange={e => setTtForm(f => ({ ...f, phase_order: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">0 = altijd beschikbaar in groep. 1 = eerste fase (early bird), 2 = tweede fase, etc.</p>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveTt}
                    disabled={savingTt || !ttForm.name.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {savingTt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Opslaan
                  </button>
                  <button
                    onClick={() => { setShowTtForm(false); setEditingTt(null); }}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            )}

            {ticketTypes.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-500 text-sm">
                Nog geen tickettypen. Voeg er een toe.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700">
                      <th className="px-6 py-3 font-medium">Naam</th>
                      <th className="px-4 py-3 font-medium">Ingang</th>
                      <th className="px-4 py-3 font-medium">Kleur</th>
                      <th className="px-4 py-3 font-medium">Fase</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {ticketTypes.map(tt => (
                      <tr key={tt.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-6 py-3 text-white font-medium">{tt.name}</td>
                        <td className="px-4 py-3 text-slate-300">{getEntranceName(tt.entrance_id)}</td>
                        <td className="px-4 py-3">
                          {tt.color ? (
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block w-4 h-4 rounded-full border border-slate-600"
                                style={{ backgroundColor: tt.color }}
                              />
                              <span className="text-slate-400 text-xs">{tt.color}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {tt.phase_group ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs bg-slate-600 px-1.5 py-0.5 rounded">{tt.phase_group}</span>
                              <span className="text-xs text-slate-500">#{tt.phase_order}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => openEditTt(tt)}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                              title="Bewerken"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteTt(tt.id)}
                              disabled={deletingTtId === tt.id}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                              title="Verwijderen"
                            >
                              {deletingTtId === tt.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
