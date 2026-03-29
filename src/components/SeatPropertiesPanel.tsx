import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { Seat, SeatSection, SeatStatus, SeatType } from '../types/seats';

const inputCls = "w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/20";
const labelCls = "block text-slate-400 text-xs font-medium mb-1";

const STATUS_OPTIONS: { value: SeatStatus; label: string }[] = [
  { value: 'available', label: 'Beschikbaar' },
  { value: 'blocked', label: 'Geblokkeerd' },
  { value: 'reserved', label: 'Gereserveerd' },
  { value: 'sold', label: 'Verkocht' },
];

const TYPE_OPTIONS: { value: SeatType; label: string }[] = [
  { value: 'regular', label: 'Regulier' },
  { value: 'vip', label: 'VIP' },
  { value: 'wheelchair', label: 'Rolstoel' },
  { value: 'companion', label: 'Begeleidersplek' },
  { value: 'restricted_view', label: 'Beperkt zicht' },
];

interface Props {
  selectedSeats: Seat[];
  sections: SeatSection[];
  onDeselectAll: () => void;
  onUpdateSeats: (seatIds: string[], updates: Partial<Pick<Seat, 'status' | 'seat_type' | 'price_override'>>) => void;
}

export function SeatPropertiesPanel({ selectedSeats, sections, onDeselectAll, onUpdateSeats }: Props) {
  const sectionMap = useMemo(() => {
    const map = new Map<string, SeatSection>();
    for (const s of sections) map.set(s.id, s);
    return map;
  }, [sections]);

  const isSingle = selectedSeats.length === 1;
  const seat = isSingle ? selectedSeats[0] : null;
  const seatSection = seat ? sectionMap.get(seat.section_id) : null;

  const sharedStatus = useMemo(() => {
    if (selectedSeats.length === 0) return null;
    const first = selectedSeats[0].status;
    return selectedSeats.every(s => s.status === first) ? first : null;
  }, [selectedSeats]);

  const sharedType = useMemo(() => {
    if (selectedSeats.length === 0) return null;
    const first = selectedSeats[0].seat_type;
    return selectedSeats.every(s => s.seat_type === first) ? first : null;
  }, [selectedSeats]);

  const ids = useMemo(() => selectedSeats.map(s => s.id), [selectedSeats]);

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">
          {isSingle ? 'Stoel Eigenschappen' : `${selectedSeats.length} stoelen geselecteerd`}
        </h3>
        <button
          onClick={onDeselectAll}
          className="p-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
          title="Deselecteer alles"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2.5 text-sm">
        {isSingle && seat && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Rij</label>
                <p className="text-white text-sm font-medium">{seat.row_label}</p>
              </div>
              <div>
                <label className={labelCls}>Stoel</label>
                <p className="text-white text-sm font-medium">{seat.seat_number}</p>
              </div>
            </div>
            {seatSection && (
              <div>
                <label className={labelCls}>Sectie</label>
                <p className="text-white text-sm">{seatSection.name}</p>
              </div>
            )}
          </>
        )}

        <div>
          <label className={labelCls}>Status</label>
          <select
            value={sharedStatus || ''}
            onChange={(e) => {
              if (e.target.value) onUpdateSeats(ids, { status: e.target.value as SeatStatus });
            }}
            className={inputCls}
          >
            {!sharedStatus && <option value="">Meerdere waarden</option>}
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Type</label>
          <select
            value={sharedType || ''}
            onChange={(e) => {
              if (e.target.value) onUpdateSeats(ids, { seat_type: e.target.value as SeatType });
            }}
            className={inputCls}
          >
            {!sharedType && <option value="">Meerdere waarden</option>}
            {TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {isSingle && seat && (
          <div>
            <label className={labelCls}>Prijs override (leeg = sectieprijs)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={seat.price_override ?? ''}
              placeholder={seatSection ? `${seatSection.price_amount.toFixed(2)}` : ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : parseFloat(e.target.value);
                onUpdateSeats(ids, { price_override: val } as any);
              }}
              className={inputCls}
            />
          </div>
        )}

        {!isSingle && selectedSeats.length > 1 && (
          <div className="border-t border-slate-700 pt-3 mt-3">
            <label className={labelCls}>Samenvatting</label>
            <div className="text-xs text-slate-400 space-y-1">
              {(() => {
                const sectionCounts = new Map<string, number>();
                for (const s of selectedSeats) {
                  const sec = sectionMap.get(s.section_id);
                  const name = sec?.name || 'Onbekend';
                  sectionCounts.set(name, (sectionCounts.get(name) || 0) + 1);
                }
                return [...sectionCounts.entries()].map(([name, count]) => (
                  <p key={name}>{name}: {count} stoelen</p>
                ));
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
