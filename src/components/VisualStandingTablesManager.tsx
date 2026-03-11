import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Trash2, Eye, EyeOff, Circle } from 'lucide-react';

interface VisualStandingTable {
  id: string;
  event_id: string;
  position_x: number;
  position_y: number;
  radius: number;
  label: string | null;
  is_visible: boolean;
  created_at: string;
}

interface Event {
  id: string;
  name: string;
  slug: string;
  start_date: string;
}

export function VisualStandingTablesManager() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [visualTables, setVisualTables] = useState<VisualStandingTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAddMode, setShowAddMode] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadVisualTables(selectedEventId);
    }
  }, [selectedEventId]);

  async function loadEvents() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('id, name, slug, start_date')
        .order('start_date', { ascending: false });

      if (error) throw error;
      setEvents(data || []);

      if (data && data.length > 0) {
        setSelectedEventId(data[0].id);
      }
    } catch (error: any) {
      console.error('Load events error:', error);
      showMessage('error', `Fout bij laden: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadVisualTables(eventId: string) {
    try {
      const { data, error } = await supabase
        .from('visual_standing_tables')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setVisualTables(data || []);
    } catch (error: any) {
      console.error('Load visual tables error:', error);
      showMessage('error', `Fout bij laden: ${error.message}`);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleAddTable(x: number, y: number) {
    if (!selectedEventId) return;

    try {
      const { error } = await supabase
        .from('visual_standing_tables')
        .insert({
          event_id: selectedEventId,
          position_x: x,
          position_y: y,
          radius: 30,
          label: 'Standing',
          is_visible: true,
        });

      if (error) throw error;
      showMessage('success', 'Visuele tafel toegevoegd!');
      await loadVisualTables(selectedEventId);
    } catch (error: any) {
      console.error('Add visual table error:', error);
      showMessage('error', `Fout: ${error.message}`);
    }
  }

  async function handleToggleVisibility(table: VisualStandingTable) {
    try {
      const { error } = await supabase
        .from('visual_standing_tables')
        .update({ is_visible: !table.is_visible })
        .eq('id', table.id);

      if (error) throw error;
      showMessage('success', table.is_visible ? 'Verborgen' : 'Zichtbaar gemaakt');
      await loadVisualTables(selectedEventId);
    } catch (error: any) {
      console.error('Toggle visibility error:', error);
      showMessage('error', `Fout: ${error.message}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Weet je zeker dat je deze visuele tafel wilt verwijderen?')) return;

    try {
      const { error } = await supabase
        .from('visual_standing_tables')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showMessage('success', 'Visuele tafel verwijderd');
      await loadVisualTables(selectedEventId);
    } catch (error: any) {
      console.error('Delete visual table error:', error);
      showMessage('error', `Fout: ${error.message}`);
    }
  }

  function handleSVGClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!showAddMode) return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 700;

    handleAddTable(Math.round(x), Math.round(y));
    setShowAddMode(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

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

      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2 mb-4">
          <Circle className="w-6 h-6" />
          Visuele Staande Tafels
        </h2>
        <p className="text-white/70 text-sm mb-4">
          Voeg decoratieve staande tafels toe aan het floor plan (niet reserveerbaar, alleen visueel)
        </p>

        {events.length === 0 ? (
          <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-xl p-8 text-center">
            <p className="text-white/70">Geen events gevonden</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2 text-white">Selecteer Event</label>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white"
              >
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name} - {new Date(event.start_date).toLocaleDateString('nl-NL')}
                  </option>
                ))}
              </select>
            </div>

            {selectedEvent && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-white">Floor Plan Preview</h3>
                      <button
                        onClick={() => setShowAddMode(!showAddMode)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                          showAddMode
                            ? 'bg-green-500 hover:bg-green-600 text-white'
                            : 'bg-red-500 hover:bg-red-600 text-white'
                        }`}
                      >
                        <Plus className="w-5 h-5" />
                        {showAddMode ? 'Klik op floor plan om toe te voegen' : 'Voeg Staande Tafel Toe'}
                      </button>
                    </div>

                    <div
                      className="bg-slate-950 rounded-lg overflow-hidden"
                      style={{ height: '500px', cursor: showAddMode ? 'crosshair' : 'default' }}
                    >
                      <svg
                        viewBox="0 0 1000 700"
                        className="w-full h-full"
                        onClick={handleSVGClick}
                      >
                        <rect x="0" y="0" width="1000" height="700" fill="#0f172a" />

                        <rect x="400" y="30" width="200" height="90" fill="#7c3aed" rx="4" />
                        <text x="500" y="75" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">
                          STAGE
                        </text>

                        <rect x="350" y="150" width="300" height="200" fill="#1e40af" fillOpacity="0.3" rx="8" />
                        <text x="500" y="250" textAnchor="middle" fill="white" fontSize="16" opacity="0.6">
                          DANSVLOER
                        </text>

                        <rect x="50" y="580" width="300" height="100" fill="#f59e0b" rx="4" />
                        <text x="200" y="630" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">
                          BAR
                        </text>

                        <defs>
                          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                          </pattern>
                        </defs>
                        <rect x="0" y="0" width="1000" height="700" fill="url(#grid)" />

                        {visualTables.map((table) => {
                          if (!table.is_visible) return null;

                          return (
                            <g key={table.id}>
                              <circle
                                cx={table.position_x}
                                cy={table.position_y}
                                r={table.radius}
                                fill="#64748b"
                                fillOpacity="0.3"
                                stroke="#94a3b8"
                                strokeWidth="2"
                                strokeDasharray="5,5"
                              />
                              <circle
                                cx={table.position_x}
                                cy={table.position_y}
                                r="4"
                                fill="#94a3b8"
                              />
                              {table.label && (
                                <text
                                  x={table.position_x}
                                  y={table.position_y + table.radius + 15}
                                  textAnchor="middle"
                                  fill="#94a3b8"
                                  fontSize="12"
                                  opacity="0.8"
                                >
                                  {table.label}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    </div>

                    <div className="mt-4 bg-slate-900/50 rounded-lg p-3">
                      <p className="text-white/70 text-sm">
                        <strong>Let op:</strong> Visuele staande tafels zijn alleen voor decoratie en kunnen niet gereserveerd worden.
                        Ze hebben geen prijs, capaciteit of ticketfunctionaliteit.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-1">
                  <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-xl p-4">
                    <h3 className="text-lg font-bold text-white mb-4">
                      Visuele Tafels ({visualTables.length})
                    </h3>

                    {visualTables.length === 0 ? (
                      <div className="text-center py-8">
                        <Circle className="w-12 h-12 text-white/30 mx-auto mb-3" />
                        <p className="text-white/50 text-sm">Geen visuele tafels</p>
                        <p className="text-white/40 text-xs mt-1">
                          Klik op "Voeg Staande Tafel Toe" om te beginnen
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {visualTables.map((table) => (
                          <div
                            key={table.id}
                            className="bg-slate-900/50 rounded-lg p-3 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <p className="text-white text-sm font-medium">
                                {table.label || 'Standing Table'}
                              </p>
                              <p className="text-white/50 text-xs">
                                ({Math.round(table.position_x)}, {Math.round(table.position_y)})
                              </p>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleToggleVisibility(table)}
                                className={`p-2 rounded-lg transition-colors ${
                                  table.is_visible
                                    ? 'bg-green-500/20 hover:bg-green-500/30 text-green-300'
                                    : 'bg-slate-700 hover:bg-slate-600 text-white/50'
                                }`}
                                title={table.is_visible ? 'Verbergen' : 'Tonen'}
                              >
                                {table.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleDelete(table.id)}
                                className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
                                title="Verwijderen"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
