import { MapPin } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface FloorplanTable {
  id: string;
  table_number: string;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string | null;
  table_type: string | null;
  is_active: boolean;
}

interface FloorplanObject {
  id: string;
  type: string;
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
  font_size?: number;
  font_color?: string;
  font_weight?: string;
  name_nl?: string;
  name_tr?: string;
  name_fr?: string;
  name_de?: string;
}

interface TicketType {
  id: string;
  name: string;
  price: number;
  color: string | null;
  quantity_total: number;
  quantity_sold: number;
}

interface VenueMapProps {
  tables: FloorplanTable[];
  objects: FloorplanObject[];
  ticketTypes: TicketType[];
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function VenueMap({ tables, objects, ticketTypes }: VenueMapProps) {
  const { language, t } = useLanguage();
  if (tables.length === 0 && objects.length === 0) return null;

  const getObjectName = (obj: FloorplanObject) => {
    const langKey = `name_${language}` as keyof FloorplanObject;
    return (obj[langKey] as string) || obj.label || obj.name;
  };

  // Calculate viewbox from all elements
  const allElements = [
    ...tables.map(t => ({ x: t.x, y: t.y, w: t.width, h: t.height })),
    ...objects.map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height })),
  ];

  if (allElements.length === 0) return null;

  const padding = 30;
  const minX = Math.min(...allElements.map(e => e.x)) - padding;
  const minY = Math.min(...allElements.map(e => e.y)) - padding;
  const maxX = Math.max(...allElements.map(e => e.x + e.w)) + padding;
  const maxY = Math.max(...allElements.map(e => e.y + e.h)) + padding;
  const viewbox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  // Match tables to ticket types by label/name similarity
  const getTableTicketMatch = (table: FloorplanTable) => {
    const tableName = (table.label || table.table_number || '').toLowerCase().trim();
    return ticketTypes.find(tt => {
      const ttName = tt.name.toLowerCase().trim();
      return tableName.includes(ttName) || ttName.includes(tableName) ||
        tableName.replace(/\s+/g, '') === ttName.replace(/\s+/g, '');
    });
  };

  // Build legend items from tables that have ticket matches
  const legendItems: { name: string; color: string; price: string }[] = [];
  const seenNames = new Set<string>();

  for (const table of tables) {
    const match = getTableTicketMatch(table);
    const displayName = table.label || table.table_number;
    if (!seenNames.has(displayName)) {
      seenNames.add(displayName);
      if (match) {
        legendItems.push({
          name: displayName,
          color: table.color || match.color || '#06b6d4',
          price: `€${(match.price / 100).toFixed(0)}`,
        });
      }
    }
  }

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/40">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-white tracking-wide">{t('tickets.venueMap').toUpperCase()}</span>
        </div>
      </div>

      {/* Map SVG */}
      <div className="px-4 py-4">
        <svg viewBox={viewbox} className="w-full max-h-[320px]" preserveAspectRatio="xMidYMid meet">
          {/* Background */}
          <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="#1a1a2e" rx="8" />

          {/* Floorplan objects (stage, bars, etc.) */}
          {objects.map((obj) => {
            const displayName = getObjectName(obj);
            return (
              <g key={obj.id}>
                <rect
                  x={obj.x} y={obj.y} width={obj.width} height={obj.height}
                  fill={obj.color}
                  stroke={obj.color}
                  strokeWidth="2"
                  rx={4}
                  opacity={obj.type === 'DANCEFLOOR' ? 0.3 : 1}
                />
                <text
                  x={obj.x + obj.width / 2} y={obj.y + obj.height / 2}
                  textAnchor="middle" dominantBaseline="central"
                  fill={obj.font_color || 'white'}
                  fontSize={obj.font_size || 14}
                  fontWeight={obj.font_weight || 'bold'}
                  letterSpacing="0.08em" pointerEvents="none"
                >
                  {displayName.toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* Floorplan tables (ticket zones) */}
          {tables.map((table) => {
            const match = getTableTicketMatch(table);
            const color = table.color || match?.color || '#06b6d4';
            const displayName = table.label || table.table_number;
            const cx = table.x + table.width / 2;
            const cy = table.y + table.height / 2;

            return (
              <g key={table.id}>
                <rect
                  x={table.x} y={table.y} width={table.width} height={table.height}
                  rx={4}
                  fill={color}
                  stroke={color}
                  strokeWidth="2"
                />
                {/* Zone name */}
                <text x={cx} y={match ? cy - 7 : cy} textAnchor="middle" dominantBaseline="central"
                  fill="white" fontSize="14" fontWeight="bold" pointerEvents="none"
                  style={{ textTransform: 'uppercase' } as React.CSSProperties}>
                  {displayName}
                </text>
                {/* Price */}
                {match && (
                  <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="central"
                    fill="white" fontSize="12" fontWeight="600" pointerEvents="none"
                    opacity="0.8">
                    €{(match.price / 100).toFixed(0)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      {legendItems.length > 0 && (
        <div className="flex items-center justify-center gap-6 px-5 py-3 border-t border-slate-700/40">
          {legendItems.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs font-medium text-slate-300">
                {item.name}
              </span>
              <span className="text-xs font-bold text-slate-400">
                {item.price}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
