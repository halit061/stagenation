import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Save, Loader2, Square, Circle, MapPin, Move, Settings2, Eye } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface Event {
  id: string;
  name: string;
}

interface TicketTypeOption {
  id: string;
  name: string;
  color: string | null;
  price: number;
}

interface VenueZone {
  id: string;
  event_id: string;
  name: string;
  color: string;
  ticket_type_id: string | null;
  zone_type: 'polygon' | 'rect' | 'ellipse';
  svg_path: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label_x: number | null;
  label_y: number | null;
  sort_order: number;
  is_active: boolean;
}

interface StaticObject {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
}

interface VenueConfig {
  enabled: boolean;
  viewbox: string;
  background_color: string;
  static_objects: StaticObject[];
}

const DEFAULT_CONFIG: VenueConfig = {
  enabled: false,
  viewbox: '0 0 800 600',
  background_color: '#1e293b',
  static_objects: [],
};

const STATIC_TYPES = [
  { value: 'stage', label: 'Podium', color: '#7c3aed' },
  { value: 'backstage', label: 'Backstage', color: '#6b7280' },
  { value: 'bar', label: 'Bar', color: '#f59e0b' },
  { value: 'dj', label: 'DJ Booth', color: '#ec4899' },
  { value: 'food', label: 'Food Corner', color: '#f97316' },
  { value: 'smoking', label: 'Smoking Area', color: '#9ca3af' },
  { value: 'entrance', label: 'Ingang', color: '#10b981' },
  { value: 'exit', label: 'Uitgang', color: '#ef4444' },
];

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

type Tool = 'select' | 'addRect' | 'addEllipse' | 'addStatic';

export function VenueMapEditor({ events }: { events: Event[] }) {
  const [selectedEventId, setSelectedEventId] = useState('');
  const [config, setConfig] = useState<VenueConfig>(DEFAULT_CONFIG);
  const [zones, setZones] = useState<VenueZone[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [staticTypeToAdd, setStaticTypeToAdd] = useState('stage');
  const [showConfig, setShowConfig] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    zoneId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    type: 'move' | 'resize';
  } | null>(null);

  const selectedZone = zones.find(z => z.id === selectedZoneId);

  const loadData = useCallback(async (eventId: string) => {
    if (!eventId) return;
    setLoading(true);
    setError('');
    try {
      const [{ data: zoneData, error: e1 }, { data: ttData, error: e2 }, { data: evData, error: e3 }] = await Promise.all([
        supabase.from('venue_zones').select('*').eq('event_id', eventId).order('sort_order'),
        supabase.from('ticket_types').select('id, name, color, price').eq('event_id', eventId).eq('is_active', true).order('price'),
        supabase.from('events').select('venue_map_config').eq('id', eventId).single(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3 && e3.code !== 'PGRST116') throw e3;

      setZones((zoneData || []) as VenueZone[]);
      setTicketTypes((ttData || []) as TicketTypeOption[]);
      setConfig(evData?.venue_map_config || { ...DEFAULT_CONFIG });
      setSelectedZoneId(null);
    } catch (err: any) {
      setError(err.message || 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId) loadData(selectedEventId);
    else { setZones([]); setTicketTypes([]); setConfig({ ...DEFAULT_CONFIG }); }
  }, [selectedEventId, loadData]);

  function svgPoint(e: React.MouseEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: svgP.x, y: svgP.y };
  }

  function handleCanvasClick(e: React.MouseEvent) {
    const pt = svgPoint(e);
    if (!pt) return;

    if (tool === 'addRect' || tool === 'addEllipse') {
      addZone(pt.x - 60, pt.y - 40, tool === 'addRect' ? 'rect' : 'ellipse');
      setTool('select');
    } else if (tool === 'addStatic') {
      addStaticObject(pt.x - 60, pt.y - 25);
      setTool('select');
    } else {
      setSelectedZoneId(null);
    }
  }

  async function addZone(x: number, y: number, type: 'rect' | 'ellipse') {
    try {
      const { data, error: err } = await supabase
        .from('venue_zones')
        .insert({
          event_id: selectedEventId,
          name: `Zone ${zones.length + 1}`,
          color: PRESET_COLORS[zones.length % PRESET_COLORS.length],
          zone_type: type,
          x, y, width: 120, height: 80,
          sort_order: zones.length,
        })
        .select()
        .single();
      if (err) throw err;
      setZones(prev => [...prev, data as VenueZone]);
      setSelectedZoneId(data.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function addStaticObject(x: number, y: number) {
    const typeInfo = STATIC_TYPES.find(t => t.value === staticTypeToAdd) || STATIC_TYPES[0];
    const newObj: StaticObject = {
      type: typeInfo.value,
      x, y, width: 120, height: 50,
      label: typeInfo.label,
      color: typeInfo.color,
    };
    setConfig(prev => ({
      ...prev,
      static_objects: [...(prev.static_objects || []), newObj],
    }));
  }

  async function deleteZone(id: string) {
    try {
      const { error: err } = await supabase.from('venue_zones').delete().eq('id', id);
      if (err) throw err;
      setZones(prev => prev.filter(z => z.id !== id));
      if (selectedZoneId === id) setSelectedZoneId(null);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function deleteStaticObject(idx: number) {
    setConfig(prev => ({
      ...prev,
      static_objects: prev.static_objects.filter((_, i) => i !== idx),
    }));
  }

  async function updateZone(id: string, updates: Partial<VenueZone>) {
    setZones(prev => prev.map(z => z.id === id ? { ...z, ...updates } : z));
    try {
      const { error: err } = await supabase.from('venue_zones').update(updates).eq('id', id);
      if (err) throw err;
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { error: err } = await supabase
        .from('events')
        .update({ venue_map_config: config })
        .eq('id', selectedEventId);
      if (err) throw err;
      setSuccess('Configuratie opgeslagen!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleMouseDown(e: React.MouseEvent, zoneId: string, type: 'move' | 'resize') {
    e.stopPropagation();
    const pt = svgPoint(e);
    if (!pt) return;
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    dragRef.current = { zoneId, startX: pt.x, startY: pt.y, origX: zone.x, origY: zone.y, type };
    setSelectedZoneId(zoneId);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const pt = svgPoint(e);
    if (!pt) return;
    const d = dragRef.current;
    const dx = pt.x - d.startX;
    const dy = pt.y - d.startY;
    const zone = zones.find(z => z.id === d.zoneId);
    if (!zone) return;

    if (d.type === 'move') {
      setZones(prev => prev.map(z => z.id === d.zoneId ? { ...z, x: d.origX + dx, y: d.origY + dy } : z));
    } else {
      const newW = Math.max(40, zone.width + dx);
      const newH = Math.max(30, zone.height + dy);
      setZones(prev => prev.map(z => z.id === d.zoneId ? { ...z, width: newW, height: newH } : z));
      dragRef.current.startX = pt.x;
      dragRef.current.startY = pt.y;
    }
  }

  function handleMouseUp() {
    if (dragRef.current) {
      const zone = zones.find(z => z.id === dragRef.current!.zoneId);
      if (zone) {
        updateZone(zone.id, { x: zone.x, y: zone.y, width: zone.width, height: zone.height });
      }
      dragRef.current = null;
    }
  }

  const [, , vbW, vbH] = (config.viewbox || '0 0 800 600').split(' ').map(Number);

  function hexToRgba(hex: string, a: number) {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)},${a})`;
  }

  return (
    <div>
      <h2 className="text-3xl font-bold mb-2 text-white">
        Venue <span className="text-red-400">Map</span>
      </h2>
      <p className="text-slate-400 mb-6">Beheer de plattegrond voor de ticketpagina</p>

      {/* Event selector */}
      <div className="mb-6">
        <select
          value={selectedEventId}
          onChange={e => setSelectedEventId(e.target.value)}
          className="bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 min-w-64"
        >
          <option value="">— Kies een evenement —</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm">{success}</div>
      )}

      {!selectedEventId && (
        <div className="text-center py-16 text-slate-500">Selecteer een evenement om te beginnen</div>
      )}

      {selectedEventId && loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-red-400" />
        </div>
      )}

      {selectedEventId && !loading && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          {/* Canvas area */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700 flex-wrap">
              <button
                onClick={() => setTool('select')}
                className={`p-2 rounded-lg transition-colors ${tool === 'select' ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                title="Selecteren"
              >
                <Move className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool('addRect')}
                className={`p-2 rounded-lg transition-colors ${tool === 'addRect' ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                title="Rechthoek zone toevoegen"
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool('addEllipse')}
                className={`p-2 rounded-lg transition-colors ${tool === 'addEllipse' ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                title="Ellips zone toevoegen"
              >
                <Circle className="w-4 h-4" />
              </button>

              <div className="w-px h-6 bg-slate-600 mx-1" />

              <select
                value={staticTypeToAdd}
                onChange={e => setStaticTypeToAdd(e.target.value)}
                className="bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5"
              >
                {STATIC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button
                onClick={() => setTool('addStatic')}
                className={`p-2 rounded-lg transition-colors ${tool === 'addStatic' ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                title="Statisch object toevoegen"
              >
                <Plus className="w-4 h-4" />
              </button>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className={`p-2 rounded-lg transition-colors ${showConfig ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  title="Configuratie"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400">Actief</label>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`w-10 h-5 rounded-full transition-colors ${config.enabled ? 'bg-green-500' : 'bg-slate-600'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <button
                  onClick={saveConfig}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Opslaan
                </button>
              </div>
            </div>

            {/* Config panel */}
            {showConfig && (
              <div className="px-4 py-3 border-b border-slate-700 bg-slate-700/30 grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">ViewBox</label>
                  <input
                    value={config.viewbox}
                    onChange={e => setConfig(prev => ({ ...prev, viewbox: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded px-2 py-1.5"
                    placeholder="0 0 800 600"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Achtergrondkleur</label>
                  <input
                    value={config.background_color}
                    onChange={e => setConfig(prev => ({ ...prev, background_color: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded px-2 py-1.5"
                    placeholder="#1e293b"
                  />
                </div>
              </div>
            )}

            {/* SVG Canvas */}
            <div className="p-4">
              <svg
                ref={svgRef}
                viewBox={config.viewbox || '0 0 800 600'}
                className="w-full border border-slate-600 rounded-lg"
                style={{ minHeight: 350, maxHeight: 500, cursor: tool !== 'select' ? 'crosshair' : 'default' }}
                onClick={handleCanvasClick}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <rect x="0" y="0" width={vbW} height={vbH} fill={config.background_color || '#1e293b'} />

                {/* Grid */}
                <defs>
                  <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect x="0" y="0" width={vbW} height={vbH} fill="url(#grid)" />

                {/* Static objects */}
                {config.static_objects?.map((obj, idx) => (
                  <g key={`so-${idx}`}
                    onClick={e => { e.stopPropagation(); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect x={obj.x} y={obj.y} width={obj.width} height={obj.height}
                      fill={hexToRgba(obj.color, 0.3)} stroke={obj.color} strokeWidth={2} rx={4}
                    />
                    <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fill={obj.color} fontSize={14} fontWeight="bold" letterSpacing="0.1em"
                    >
                      {obj.label}
                    </text>
                    <g onClick={e => { e.stopPropagation(); deleteStaticObject(idx); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle cx={obj.x + obj.width} cy={obj.y} r={8} fill="#ef4444" />
                      <text x={obj.x + obj.width} y={obj.y} textAnchor="middle"
                        dominantBaseline="central" fill="white" fontSize={10} fontWeight="bold"
                      >×</text>
                    </g>
                  </g>
                ))}

                {/* Zones */}
                {zones.map(zone => {
                  const cx = zone.x + zone.width / 2;
                  const cy = zone.y + zone.height / 2;
                  const isSelected = zone.id === selectedZoneId;

                  return (
                    <g key={zone.id}>
                      {zone.zone_type === 'ellipse' ? (
                        <ellipse cx={cx} cy={cy} rx={zone.width / 2} ry={zone.height / 2}
                          fill={hexToRgba(zone.color, 0.25)} stroke={zone.color}
                          strokeWidth={isSelected ? 3 : 2}
                          strokeDasharray={isSelected ? '6 3' : 'none'}
                          onMouseDown={e => handleMouseDown(e, zone.id, 'move')}
                          onClick={e => { e.stopPropagation(); setSelectedZoneId(zone.id); }}
                          style={{ cursor: 'move' }}
                        />
                      ) : zone.zone_type === 'polygon' && zone.svg_path ? (
                        <path d={zone.svg_path}
                          fill={hexToRgba(zone.color, 0.25)} stroke={zone.color}
                          strokeWidth={isSelected ? 3 : 2}
                          strokeDasharray={isSelected ? '6 3' : 'none'}
                          onClick={e => { e.stopPropagation(); setSelectedZoneId(zone.id); }}
                          style={{ cursor: 'pointer' }}
                        />
                      ) : (
                        <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx={6}
                          fill={hexToRgba(zone.color, 0.25)} stroke={zone.color}
                          strokeWidth={isSelected ? 3 : 2}
                          strokeDasharray={isSelected ? '6 3' : 'none'}
                          onMouseDown={e => handleMouseDown(e, zone.id, 'move')}
                          onClick={e => { e.stopPropagation(); setSelectedZoneId(zone.id); }}
                          style={{ cursor: 'move' }}
                        />
                      )}
                      {/* Label */}
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                        fill="white" fontSize={12} fontWeight="bold" pointerEvents="none"
                      >
                        {zone.name}
                      </text>
                      {/* Resize handle */}
                      {isSelected && zone.zone_type !== 'polygon' && (
                        <rect
                          x={zone.x + zone.width - 6} y={zone.y + zone.height - 6}
                          width={12} height={12} rx={2}
                          fill="white" stroke={zone.color} strokeWidth={2}
                          onMouseDown={e => handleMouseDown(e, zone.id, 'resize')}
                          style={{ cursor: 'se-resize' }}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Right panel — Properties */}
          <div className="space-y-4">
            {/* Zone list */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                  <span className="font-semibold text-white text-sm">Zones ({zones.length})</span>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {zones.length === 0 ? (
                  <p className="text-slate-500 text-xs text-center py-4">Nog geen zones. Klik op de kaart om er een toe te voegen.</p>
                ) : (
                  <ul className="divide-y divide-slate-700">
                    {zones.map(z => (
                      <li key={z.id}
                        className={`flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors ${z.id === selectedZoneId ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'}`}
                        onClick={() => setSelectedZoneId(z.id)}
                      >
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: z.color }} />
                        <span className="text-sm text-white flex-1 truncate">{z.name}</span>
                        <button
                          onClick={e => { e.stopPropagation(); deleteZone(z.id); }}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Selected zone properties */}
            {selectedZone && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  Zone Eigenschappen
                </h4>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Naam</label>
                  <input
                    value={selectedZone.name}
                    onChange={e => updateZone(selectedZone.id, { name: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Gekoppeld tickettype</label>
                  <select
                    value={selectedZone.ticket_type_id || ''}
                    onChange={e => {
                      const ttId = e.target.value || null;
                      const tt = ticketTypes.find(t => t.id === ttId);
                      const updates: Partial<VenueZone> = { ticket_type_id: ttId };
                      if (tt?.color) updates.color = tt.color;
                      updateZone(selectedZone.id, updates);
                    }}
                    className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">— Geen —</option>
                    {ticketTypes.map(tt => (
                      <option key={tt.id} value={tt.id}>
                        {tt.name} (€{(tt.price / 100).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Kleur</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PRESET_COLORS.map(c => (
                      <button key={c} type="button"
                        onClick={() => updateZone(selectedZone.id, { color: c })}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${selectedZone.color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <input
                    value={selectedZone.color}
                    onChange={e => updateZone(selectedZone.id, { color: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded px-2 py-1.5"
                    placeholder="#hex"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Volgorde</label>
                    <input type="number"
                      value={selectedZone.sort_order}
                      onChange={e => updateZone(selectedZone.id, { sort_order: parseInt(e.target.value) || 0 })}
                      className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded px-2 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Rotatie</label>
                    <input type="number"
                      value={selectedZone.rotation}
                      onChange={e => updateZone(selectedZone.id, { rotation: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded px-2 py-1.5"
                    />
                  </div>
                </div>

                {selectedZone.zone_type === 'polygon' && (
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">SVG Path</label>
                    <textarea
                      value={selectedZone.svg_path || ''}
                      onChange={e => updateZone(selectedZone.id, { svg_path: e.target.value })}
                      rows={3}
                      className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded px-2 py-1.5 font-mono"
                      placeholder="M 100 100 L 200 100 L 200 200 Z"
                    />
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => deleteZone(selectedZone.id)}
                    className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Zone verwijderen
                  </button>
                </div>
              </div>
            )}

            {/* Static objects list */}
            {config.static_objects?.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700">
                  <span className="font-semibold text-white text-sm">Statische objecten ({config.static_objects.length})</span>
                </div>
                <ul className="divide-y divide-slate-700">
                  {config.static_objects.map((obj, i) => (
                    <li key={i} className="flex items-center gap-2 px-4 py-2">
                      <span className="w-3 h-3 rounded" style={{ backgroundColor: obj.color }} />
                      <span className="text-sm text-white flex-1">{obj.label}</span>
                      <button
                        onClick={() => deleteStaticObject(i)}
                        className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
