import { useState, useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import type { Database } from '../lib/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import { txt } from '../lib/translations';

type FloorplanTable = Database['public']['Tables']['floorplan_tables']['Row'];
type TableBooking = Database['public']['Tables']['table_bookings']['Row'];

interface VisualStandingTable {
  id: string;
  event_id: string;
  position_x: number;
  position_y: number;
  radius: number;
  label: string | null;
  is_visible: boolean;
}

interface FloorplanObject {
  id: string;
  event_id: string | null;
  type: 'BAR' | 'STAGE' | 'DANCEFLOOR' | 'DECOR_TABLE' | 'DJ_BOOTH' | 'ENTRANCE' | 'EXIT' | 'RESTROOM';
  name: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  is_active: boolean;
  is_visible?: boolean;
  created_at: string;
  updated_at: string;
}

interface FloorPlanProps {
  eventId?: string;
  onTableSelect?: (table: FloorplanTable, status: 'available' | 'sold') => void;
  readOnly?: boolean;
}

export function FloorPlan({ eventId, onTableSelect, readOnly = false }: FloorPlanProps) {
  const { language } = useLanguage();
  const [tables, setTables] = useState<FloorplanTable[]>([]);
  const [, setBookings] = useState<TableBooking[]>([]);
  const [soldTableIds, setSoldTableIds] = useState<Set<string>>(new Set());
  const [visualTables, setVisualTables] = useState<VisualStandingTable[]>([]);
  const [objects, setObjects] = useState<FloorplanObject[]>([]);
  const [selectedTable, setSelectedTable] = useState<FloorplanTable | null>(null);
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    loadFloorPlan();

    if (!eventId) return;

    const bookingsChannel = supabase
      .channel(`table_bookings_${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'table_bookings',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          loadFloorPlan();
        }
      )
      .subscribe();

    const tablesChannel = supabase
      .channel('floorplan_tables_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'floorplan_tables',
        },
        () => {
          loadFloorPlan();
        }
      )
      .subscribe();

    const objectsChannel = supabase
      .channel('floorplan_objects_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'floorplan_objects',
        },
        () => {
          loadFloorPlan();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(tablesChannel);
      supabase.removeChannel(objectsChannel);
    };
  }, [eventId]);

  async function loadFloorPlan() {
    try {
      const { data: tablesData, error: tablesError } = await supabase
        .from('floorplan_tables')
        .select('*')
        .eq('is_active', true)
        .order('table_number', { ascending: true})
        .limit(10000);

      if (tablesError) {
        console.error('Safari-safe Supabase query failed', tablesError);
        throw tablesError;
      }
      setTables(tablesData || []);

      // Load floorplan objects (BAR, STAGE, DANCEFLOOR, DECOR_TABLE, etc.)
      const { data: objectsData, error: objectsError } = await supabase
        .from('floorplan_objects')
        .select('*')
        .eq('is_active', true)
        .eq('is_visible', true)
        .order('created_at', { ascending: true })
        .limit(10000);

      if (objectsError) {
        console.error('Safari-safe Supabase query failed', objectsError);
        throw objectsError;
      }
      setObjects(objectsData as FloorplanObject[] || []);

      if (eventId) {
        const { data: bookingsData, error: bookingsError } = await supabase
          .from('table_bookings')
          .select('*')
          .eq('event_id', eventId)
          .eq('status', 'PAID')
          .limit(10000);

        if (bookingsError) {
          console.error('Safari-safe Supabase query failed', bookingsError);
          throw bookingsError;
        }
        setBookings(bookingsData || []);

        const soldIds = new Set(bookingsData?.map(b => b.floorplan_table_id) || []);
        setSoldTableIds(soldIds);

        const { data: visualTablesData, error: visualTablesError } = await supabase
          .from('visual_standing_tables')
          .select('*')
          .eq('event_id', eventId)
          .eq('is_visible', true)
          .limit(10000);

        if (visualTablesError) {
          console.error('Safari-safe Supabase query failed', visualTablesError);
          throw visualTablesError;
        }
        setVisualTables(visualTablesData || []);
      }
    } catch (error) {
      console.error('Error loading floorplan:', error);
    }
  }

  const getTableStatus = (table: FloorplanTable): 'available' | 'sold' => {
    if (table.manual_status === 'SOLD') return 'sold';
    if (!eventId) return 'available';
    return soldTableIds.has(table.id) ? 'sold' : 'available';
  };

  const getTableColor = (table: FloorplanTable, isHovered: boolean): string => {
    const status = getTableStatus(table);
    if (isHovered) {
      if (status === 'available') return '#16a34a';
      return '#dc2626';
    }
    if (status === 'available') return '#22c55e';
    return '#ef4444';
  };

  const handleTableClick = (table: FloorplanTable) => {
    if (readOnly) return;
    const status = getTableStatus(table);
    if (status === 'sold') return;
    setSelectedTable(table);
    if (onTableSelect) {
      onTableSelect(table, status);
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  return (
    <div className="relative bg-slate-900 rounded-xl overflow-hidden border border-purple-500/20">
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={handleZoomIn}
          className="p-2 bg-slate-800 hover:bg-purple-600 text-white rounded-lg transition-colors"
          title={txt(language, { nl: 'Zoom in', tr: 'Yakınlaştır', fr: 'Zoom avant', de: 'Vergrößern' })}
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 bg-slate-800 hover:bg-purple-600 text-white rounded-lg transition-colors"
          title={txt(language, { nl: 'Zoom uit', tr: 'Uzaklaştır', fr: 'Zoom arrière', de: 'Verkleinern' })}
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          onClick={handleResetView}
          className="p-2 bg-slate-800 hover:bg-purple-600 text-white rounded-lg transition-colors"
          title={txt(language, { nl: 'Reset weergave', tr: 'Görünümü sıfırla', fr: 'Réinitialiser la vue', de: 'Ansicht zurücksetzen' })}
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>

      <div className="absolute top-4 left-4 z-10 bg-slate-800/90 backdrop-blur-sm rounded-lg p-3 text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500" />
            <span className="text-white">{txt(language, { nl: 'Beschikbaar', tr: 'Müsait', fr: 'Disponible', de: 'Verfügbar' })}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500" />
            <span className="text-white">{txt(language, { nl: 'Verkocht', tr: 'Satıldı', fr: 'Vendu', de: 'Verkauft' })}</span>
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ height: '600px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 1000 700"
          className="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: isPanning ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          <rect x="0" y="0" width="1000" height="700" fill="#0f172a" />

          {/* Render floorplan objects (Bar, Stage, Dancefloor, Decor, etc.) */}
          {objects.map((obj) => {
            const displayName = obj.label || obj.name;
            const isDecor = obj.type === 'DECOR_TABLE';

            return (
              <g key={obj.id} className="pointer-events-none">
                <rect
                  x={obj.x}
                  y={obj.y}
                  width={obj.width}
                  height={obj.height}
                  fill={obj.color}
                  rx="4"
                  opacity={obj.type === 'DANCEFLOOR' ? 0.3 : 1}
                  className="transition-all duration-200"
                />

                <text
                  x={obj.x + obj.width / 2}
                  y={obj.y + obj.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={isDecor ? "24" : (obj.type === 'DANCEFLOOR' ? '16' : '20')}
                  fontWeight="bold"
                  className="pointer-events-none"
                  opacity={obj.type === 'DANCEFLOOR' ? 0.6 : 1}
                >
                  {isDecor ? 'D' : displayName.toUpperCase()}
                </text>
              </g>
            );
          })}

          {tables.map((table) => {
            const isHovered = hoveredTable === table.id;
            const status = getTableStatus(table);
            const isSeated = table.table_type === 'SEATED';
            const isSold = status === 'sold';

            return (
              <g key={table.id}>
                <rect
                  x={table.x}
                  y={table.y}
                  width={table.width}
                  height={table.height}
                  fill={getTableColor(table, isHovered)}
                  stroke={isHovered ? '#a855f7' : '#475569'}
                  strokeWidth={isHovered ? '3' : '2'}
                  rx="4"
                  className={`transition-all duration-200 ${isSold ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  style={{
                    transform: isHovered && !isSold ? 'scale(1.05)' : 'scale(1)',
                    transformOrigin: `${table.x + table.width / 2}px ${table.y + table.height / 2}px`,
                  }}
                  onMouseEnter={() => !isSold && setHoveredTable(table.id)}
                  onMouseLeave={() => setHoveredTable(null)}
                  onClick={() => handleTableClick(table)}
                >
                  {isSold && (
                    <title>{txt(language, { nl: 'Verkocht', tr: 'Satıldı', fr: 'Vendu', de: 'Verkauft' })}</title>
                  )}
                </rect>

                {isSeated && (
                  <>
                    <circle
                      cx={table.x + 15}
                      cy={table.y + 15}
                      r="8"
                      fill="#334155"
                      stroke="#64748b"
                      strokeWidth="1"
                    />
                    <circle
                      cx={table.x + table.width - 15}
                      cy={table.y + 15}
                      r="8"
                      fill="#334155"
                      stroke="#64748b"
                      strokeWidth="1"
                    />
                    <circle
                      cx={table.x + 15}
                      cy={table.y + table.height - 15}
                      r="8"
                      fill="#334155"
                      stroke="#64748b"
                      strokeWidth="1"
                    />
                    <circle
                      cx={table.x + table.width - 15}
                      cy={table.y + table.height - 15}
                      r="8"
                      fill="#334155"
                      stroke="#64748b"
                      strokeWidth="1"
                    />
                  </>
                )}

                <text
                  x={table.x + table.width / 2}
                  y={table.y + table.height / 2}
                  textAnchor="middle"
                  fill="white"
                  fontSize="18"
                  fontWeight="bold"
                  className="pointer-events-none"
                >
                  {table.table_number}
                </text>

                <text
                  x={table.x + table.width / 2}
                  y={table.y + table.height / 2 + 18}
                  textAnchor="middle"
                  fill="white"
                  fontSize="12"
                  className="pointer-events-none"
                >
                  {isSold ? txt(language, { nl: 'VERKOCHT', tr: 'SATILDI', fr: 'VENDU', de: 'VERKAUFT' }) : `${table.capacity}p`}
                </text>
              </g>
            );
          })}

          {visualTables.map((vTable) => (
            <g key={vTable.id} opacity="0.5">
              <circle
                cx={vTable.position_x}
                cy={vTable.position_y}
                r={vTable.radius}
                fill="#64748b"
                fillOpacity="0.2"
                stroke="#94a3b8"
                strokeWidth="2"
                strokeDasharray="5,5"
                className="pointer-events-none"
              />
              <circle
                cx={vTable.position_x}
                cy={vTable.position_y}
                r="3"
                fill="#94a3b8"
                className="pointer-events-none"
              />
              {vTable.label && (
                <text
                  x={vTable.position_x}
                  y={vTable.position_y + vTable.radius + 12}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                  opacity="0.6"
                  className="pointer-events-none"
                >
                  {vTable.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {selectedTable && !readOnly && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 rounded-xl shadow-2xl p-6 border border-purple-500/30 max-w-md w-full mx-4 z-20">
          <button
            onClick={() => setSelectedTable(null)}
            className="absolute top-3 right-3 p-1 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>

          <h3 className="text-2xl font-bold text-white mb-2">
            {txt(language, { nl: 'Tafel', tr: 'Masa', fr: 'Table', de: 'Tisch' })} {selectedTable.table_number}
          </h3>
          <p className="text-slate-400 mb-4">
            {selectedTable.table_type === 'SEATED'
              ? txt(language, { nl: 'Zittafel', tr: 'Oturma Masası', fr: 'Table assise', de: 'Sitztisch' })
              : txt(language, { nl: 'Sta-tafel', tr: 'Ayakta Masa', fr: 'Table debout', de: 'Stehtisch' })}
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-slate-300">{txt(language, { nl: 'Capaciteit', tr: 'Kapasite', fr: 'Capacité', de: 'Kapazität' })}</span>
              <span className="text-white font-semibold">{selectedTable.capacity} personen</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-300">{txt(language, { nl: 'Prijs', tr: 'Fiyat', fr: 'Prix', de: 'Preis' })}</span>
              <span className="text-white font-semibold">€{selectedTable.price}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-300">Status</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  getTableStatus(selectedTable) === 'available'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {getTableStatus(selectedTable) === 'available'
                  ? txt(language, { nl: 'Beschikbaar', tr: 'Müsait', fr: 'Disponible', de: 'Verfügbar' })
                  : txt(language, { nl: 'Verkocht', tr: 'Satıldı', fr: 'Vendu', de: 'Verkauft' })}
              </span>
            </div>
          </div>

          {getTableStatus(selectedTable) === 'available' && onTableSelect && (
            <button
              onClick={() => {
                onTableSelect(selectedTable, 'available');
                setSelectedTable(null);
              }}
              className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors"
            >
              {txt(language, { nl: 'Direct afrekenen', tr: 'Hemen öde', fr: 'Payer maintenant', de: 'Jetzt bezahlen' })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
