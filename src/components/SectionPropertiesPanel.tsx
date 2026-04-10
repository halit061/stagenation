import { useMemo } from 'react';
import { Copy, Trash2, RefreshCw, Pencil, Maximize, Ticket, Palette, Ruler } from 'lucide-react';
import type { SeatSection, Seat, SeatStatus, TicketType } from '../types/seats';
import { SECTION_COLORS, COLOR_CATEGORIES, getColorName } from '../config/sectionColors';
import { DimensionsPanel } from './DimensionsPanel';

const labelCls = 'block text-slate-400 text-xs font-medium mb-1';

const STATUS_COLOR: Record<SeatStatus, string> = {
  available: '#22c55e',
  blocked: '#6b7280',
  reserved: '#f59e0b',
  sold: '#ef4444',
};

interface Props {
  section: SeatSection;
  seats: Seat[];
  onEdit: (section: SeatSection) => void;
  onRegenerate: (section: SeatSection) => void;
  onDuplicate: (section: SeatSection) => void;
  onDelete: (section: SeatSection) => void;
  onAutoFit?: (section: SeatSection) => void;
  onRotate?: (angle: number) => void;
  onColorChange?: (color: string) => void;
  onDimensionsChange?: (changes: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => void;
  linkedTicketTypes?: TicketType[];
}

export function SectionPropertiesPanel({ section, seats, onEdit, onRegenerate, onDuplicate, onDelete, onAutoFit, onRotate, onColorChange, onDimensionsChange, linkedTicketTypes = [] }: Props) {
  const stats = useMemo(() => {
    const total = seats.length;
    const available = seats.filter((s) => s.status === 'available').length;
    const sold = seats.filter((s) => s.status === 'sold').length;
    const reserved = seats.filter((s) => s.status === 'reserved').length;
    const blocked = seats.filter((s) => s.status === 'blocked').length;
    return { total, available, sold, reserved, blocked };
  }, [seats]);

  const miniPreview = useMemo(() => {
    if (seats.length === 0) return null;
    const minX = Math.min(...seats.map((s) => s.x_position));
    const maxX = Math.max(...seats.map((s) => s.x_position));
    const minY = Math.min(...seats.map((s) => s.y_position));
    const maxY = Math.max(...seats.map((s) => s.y_position));
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 12;
    const w = 200;
    const h = 120;
    const scaleX = (w - pad * 2) / rangeX;
    const scaleY = (h - pad * 2) / rangeY;
    const scale = Math.min(scaleX, scaleY);
    const r = Math.max(1.5, Math.min(4, scale * 4));
    return { minX, minY, w, h, pad, scale, r };
  }, [seats]);

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Sectie eigenschappen</h3>
        <div className="flex gap-1">
          <button onClick={() => onEdit(section)} className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors" title="Bewerken"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDuplicate(section)} className="p-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors" title="Dupliceren"><Copy className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(section)} className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded transition-colors" title="Verwijderen"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="space-y-2.5 text-sm">
        <div>
          <label className={labelCls}>Naam</label>
          <p className="text-white text-sm">{section.name}</p>
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <p className="text-white text-sm">{section.section_type === 'tribune' ? 'Tribune' : 'Plein'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Rijen</label>
            <p className="text-white text-sm">{section.rows_count}</p>
          </div>
          <div>
            <label className={labelCls}>Stoelen/Rij</label>
            <p className="text-white text-sm">{section.seats_per_row}</p>
          </div>
        </div>
        <div>
          <label className={labelCls}>Totaal</label>
          <p className="text-white text-sm font-semibold">{section.capacity} stoelen</p>
        </div>
        {section.price_category && (
          <div>
            <label className={labelCls}>Categorie</label>
            <p className="text-white text-sm">{section.price_category}</p>
          </div>
        )}
        <div>
          <label className={labelCls}>Prijs</label>
          <p className="text-white text-sm">EUR {section.price_amount.toFixed(2)}</p>
        </div>
        {linkedTicketTypes.length > 0 && (
          <div>
            <label className={labelCls}>
              <span className="flex items-center gap-1">
                <Ticket className="w-3 h-3" />
                Gekoppelde Ticket Types
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {linkedTicketTypes.map(tt => (
                <span key={tt.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/15 border border-blue-500/30 rounded text-xs text-blue-300">
                  {tt.name}
                  <span className="text-blue-400/60">{'\u20AC'}{(tt.price / 100).toFixed(2)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className={labelCls}>
            <span className="flex items-center gap-1">
              <Palette className="w-3 h-3" />
              Kleur
            </span>
          </label>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-md border border-white/20" style={{ backgroundColor: section.color }} />
            <span className="text-white text-xs font-medium">{getColorName(section.color)}</span>
          </div>
          {onColorChange && (
            <div className="flex items-center gap-1 flex-wrap">
              {SECTION_COLORS.slice(0, 10).map((c) => (
                <button
                  key={c.hex}
                  onClick={() => onColorChange(c.hex)}
                  title={c.name}
                  className={`w-5 h-5 rounded transition-all ${
                    section.color.toLowerCase() === c.hex.toLowerCase()
                      ? 'ring-2 ring-white scale-110'
                      : 'hover:scale-110 hover:ring-1 hover:ring-white/40'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>
            <span className="flex items-center gap-1">
              <Ruler className="w-3 h-3" />
              Positie & Afmetingen
            </span>
          </label>
          {onDimensionsChange ? (
            <DimensionsPanel
              values={{
                x: section.position_x,
                y: section.position_y,
                width: section.width,
                height: section.height,
                rotation: section.rotation || 0,
              }}
              onChange={(diff) => {
                const mapped: Parameters<NonNullable<Props['onDimensionsChange']>>[0] = {};
                if (diff.x !== undefined) mapped.x = diff.x;
                if (diff.y !== undefined) mapped.y = diff.y;
                if (diff.width !== undefined) mapped.width = diff.width;
                if (diff.height !== undefined) mapped.height = diff.height;
                if (diff.rotation !== undefined) mapped.rotation = diff.rotation;
                onDimensionsChange(mapped);
              }}
              minWidth={80}
              minHeight={60}
              showRotation={!!onRotate}
            />
          ) : (
            <p className="text-slate-400 text-xs">
              X: {Math.round(section.position_x)}, Y: {Math.round(section.position_y)} | {Math.round(section.width)} x {Math.round(section.height)}
            </p>
          )}
        </div>

        <div className="border-t border-slate-700 pt-3 mt-3">
          <label className={labelCls}>Beschikbaarheid</label>
          {stats.total > 0 ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-white text-sm font-semibold">{stats.available}/{stats.total}</span>
                <span className="text-slate-400 text-xs">beschikbaar</span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-700 overflow-hidden flex">
                {stats.sold > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(stats.sold / stats.total) * 100}%` }} />}
                {stats.reserved > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${(stats.reserved / stats.total) * 100}%` }} />}
                {stats.available > 0 && <div className="bg-green-500 transition-all" style={{ width: `${(stats.available / stats.total) * 100}%` }} />}
                {stats.blocked > 0 && <div className="bg-gray-500 transition-all" style={{ width: `${(stats.blocked / stats.total) * 100}%` }} />}
              </div>
              <div className="grid grid-cols-2 gap-1 mt-2 text-xs text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{stats.available} beschikbaar</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{stats.sold} verkocht</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />{stats.reserved} gereserveerd</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />{stats.blocked} geblokkeerd</span>
              </div>
            </>
          ) : (
            <p className="text-amber-400 text-xs">Geen stoelen gegenereerd</p>
          )}
        </div>

        {miniPreview && seats.length > 0 && (
          <div className="border-t border-slate-700 pt-3 mt-3">
            <label className={labelCls}>Stoelen preview</label>
            <div className="bg-slate-900 rounded-lg overflow-hidden">
              <svg width={miniPreview.w} height={miniPreview.h} viewBox={`0 0 ${miniPreview.w} ${miniPreview.h}`}>
                <rect width={miniPreview.w} height={miniPreview.h} fill="#0f172a" />
                {seats.map((seat) => {
                  const cx = miniPreview.pad + (seat.x_position - miniPreview.minX) * miniPreview.scale;
                  const cy = miniPreview.pad + (seat.y_position - miniPreview.minY) * miniPreview.scale;
                  return (
                    <circle
                      key={seat.id}
                      cx={cx} cy={cy}
                      r={miniPreview.r}
                      fill={STATUS_COLOR[seat.status as SeatStatus] || '#22c55e'}
                      fillOpacity={0.85}
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        )}

        <div className="border-t border-slate-700 pt-3 mt-3 space-y-2">
          {onAutoFit && seats.length > 0 && (
            <button
              onClick={() => onAutoFit(section)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded transition-colors text-sm"
            >
              <Maximize className="w-3.5 h-3.5" />
              Auto-fit Blok
            </button>
          )}
          <button
            onClick={() => onRegenerate(section)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded transition-colors text-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Stoelen Hergenereren
          </button>
        </div>

        <p className="text-slate-500 text-xs italic">Dubbelklik op de sectie om te bewerken</p>
      </div>
    </div>
  );
}
