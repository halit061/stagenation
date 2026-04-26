import { useMemo, useState } from 'react';
import { X, Check, Trash2 } from 'lucide-react';
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
  onUpdateSeats: (seatIds: string[], updates: Partial<Pick<Seat, 'status' | 'seat_type' | 'price_override' | 'row_label' | 'seat_number'>>) => void;
  onDeleteSeats?: (seatIds: string[]) => void;
}

export function SeatPropertiesPanel({ selectedSeats, sections, onDeselectAll, onUpdateSeats, onDeleteSeats }: Props) {
  const sectionMap = useMemo(() => {
    const map = new Map<string, SeatSection>();
    for (const s of sections) map.set(s.id, s);
    return map;
  }, [sections]);

  const isSingle = selectedSeats.length === 1;
  const seat = isSingle ? selectedSeats[0] : null;
  const seatSection = seat ? sectionMap.get(seat.section_id) : null;

  const [editRowLabel, setEditRowLabel] = useState('');
  const [editSeatNumber, setEditSeatNumber] = useState('');
  const [rowDirty, setRowDirty] = useState(false);
  const [seatNumDirty, setSeatNumDirty] = useState(false);

  const prevSeatId = useMemo(() => seat?.id ?? null, [seat?.id]);
  useMemo(() => {
    if (seat) {
      setEditRowLabel(seat.row_label);
      setEditSeatNumber(String(seat.seat_number));
      setRowDirty(false);
      setSeatNumDirty(false);
    }
  }, [prevSeatId]);

  const [editBulkRow, setEditBulkRow] = useState('');
  const [bulkRowDirty, setBulkRowDirty] = useState(false);

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
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={editRowLabel}
                    onChange={(e) => { setEditRowLabel(e.target.value); setRowDirty(true); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && rowDirty && editRowLabel.trim()) {
                        onUpdateSeats([seat.id], { row_label: editRowLabel.trim() });
                        setRowDirty(false);
                      }
                    }}
                    className={inputCls}
                  />
                  {rowDirty && editRowLabel.trim() && (
                    <button
                      onClick={() => { onUpdateSeats([seat.id], { row_label: editRowLabel.trim() }); setRowDirty(false); }}
                      className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors flex-shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls}>Stoel Nr.</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min="1"
                    value={editSeatNumber}
                    onChange={(e) => { setEditSeatNumber(e.target.value); setSeatNumDirty(true); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && seatNumDirty && editSeatNumber) {
                        onUpdateSeats([seat.id], { seat_number: parseInt(editSeatNumber, 10) });
                        setSeatNumDirty(false);
                      }
                    }}
                    className={inputCls}
                  />
                  {seatNumDirty && editSeatNumber && (
                    <button
                      onClick={() => { onUpdateSeats([seat.id], { seat_number: parseInt(editSeatNumber, 10) }); setSeatNumDirty(false); }}
                      className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors flex-shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
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

        {onDeleteSeats && selectedSeats.length > 0 && (
          <div className="border-t border-slate-700 pt-3">
            <button
              onClick={() => onDeleteSeats(ids)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600/90 hover:bg-red-500 text-white rounded text-sm font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isSingle ? 'Stoel verwijderen' : `${selectedSeats.length} stoelen verwijderen`}
            </button>
          </div>
        )}

        {!isSingle && selectedSeats.length > 1 && (
          <>
            <div>
              <label className={labelCls}>Rij wijzigen ({selectedSeats.length} stoelen)</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={editBulkRow}
                  onChange={(e) => { setEditBulkRow(e.target.value); setBulkRowDirty(true); }}
                  placeholder={`Rij voor alle ${selectedSeats.length} stoelen`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && bulkRowDirty && editBulkRow.trim()) {
                      onUpdateSeats(ids, { row_label: editBulkRow.trim() });
                      setBulkRowDirty(false);
                    }
                  }}
                  className={inputCls}
                />
                {bulkRowDirty && editBulkRow.trim() && (
                  <button
                    onClick={() => { onUpdateSeats(ids, { row_label: editBulkRow.trim() }); setBulkRowDirty(false); }}
                    className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors flex-shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
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
          </>
        )}
      </div>
    </div>
  );
}
