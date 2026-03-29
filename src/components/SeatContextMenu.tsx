import { useState, useEffect, useRef } from 'react';
import {
  Ban, Unlock, Star, StarOff, Accessibility, EyeOff,
  DollarSign, Rows3, LayoutGrid, Trash2,
} from 'lucide-react';
import type { Seat, SeatSection, SeatStatus, SeatType } from '../types/seats';
import {
  updateSeat,
  updateSeatPrice,
  deleteSeatsById,
  updateSectionCapacity,
} from '../services/seatService';
import type { HistoryAction } from '../hooks/useSeatHistory';

interface Props {
  seat: Seat;
  section: SeatSection;
  position: { x: number; y: number };
  sectionSeats: Record<string, Seat[]>;
  onClose: () => void;
  onSelectRow: (sectionId: string, rowLabel: string) => void;
  onSelectSection: (sectionId: string) => void;
  setSectionSeats: React.Dispatch<React.SetStateAction<Record<string, Seat[]>>>;
  setSeatSections: React.Dispatch<React.SetStateAction<SeatSection[]>>;
  setSelectedSeatIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  pushAction?: (action: HistoryAction) => void;
}

export function SeatContextMenu({
  seat,
  section,
  position,
  sectionSeats,
  onClose,
  onSelectRow,
  onSelectSection,
  setSectionSeats,
  setSeatSections,
  setSelectedSeatIds,
  showToast,
  pushAction,
}: Props) {
  const [showPriceInput, setShowPriceInput] = useState(false);
  const [priceValue, setPriceValue] = useState(seat.price_override?.toString() ?? '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleScroll() { onClose(); }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const isBlocked = seat.status === 'blocked';
  const isVip = seat.seat_type === 'vip';

  function applyUpdate(updates: Partial<Pick<Seat, 'status' | 'seat_type' | 'price_override'>>) {
    setSectionSeats(prev => {
      const next = { ...prev };
      for (const [secId, seats] of Object.entries(next)) {
        next[secId] = seats.map(s =>
          s.id === seat.id ? { ...s, ...updates } as Seat : s
        );
      }
      return next;
    });
  }

  async function handleToggleBlock() {
    const newStatus: SeatStatus = isBlocked ? 'available' : 'blocked';
    const prev = { status: seat.status };
    applyUpdate({ status: newStatus });
    onClose();
    try {
      await updateSeat([seat.id], { status: newStatus });
      pushAction?.({
        type: 'status_change',
        affected_ids: [seat.id],
        previous_values: { [seat.id]: seat.status },
        new_values: { [seat.id]: newStatus },
        timestamp: new Date(),
      });
      showToast(isBlocked ? 'Stoel gedeblokkeerd' : 'Stoel geblokkeerd', 'success');
    } catch (err: any) {
      applyUpdate(prev);
      showToast(err.message || 'Fout', 'error');
    }
  }

  async function handleToggleVip() {
    const newType: SeatType = isVip ? 'regular' : 'vip';
    const prev = { seat_type: seat.seat_type };
    applyUpdate({ seat_type: newType });
    onClose();
    try {
      await updateSeat([seat.id], { seat_type: newType });
      pushAction?.({
        type: 'type_change',
        affected_ids: [seat.id],
        previous_values: { [seat.id]: seat.seat_type },
        new_values: { [seat.id]: newType },
        timestamp: new Date(),
      });
      showToast(isVip ? 'VIP verwijderd' : 'Gemarkeerd als VIP', 'success');
    } catch (err: any) {
      applyUpdate(prev);
      showToast(err.message || 'Fout', 'error');
    }
  }

  async function handleSetType(type: SeatType) {
    const prev = { seat_type: seat.seat_type };
    applyUpdate({ seat_type: type });
    onClose();
    try {
      await updateSeat([seat.id], { seat_type: type });
      pushAction?.({
        type: 'type_change',
        affected_ids: [seat.id],
        previous_values: { [seat.id]: seat.seat_type },
        new_values: { [seat.id]: type },
        timestamp: new Date(),
      });
      showToast(`Type gewijzigd`, 'success');
    } catch (err: any) {
      applyUpdate(prev);
      showToast(err.message || 'Fout', 'error');
    }
  }

  async function handlePriceSave() {
    const val = priceValue === '' ? null : parseFloat(priceValue);
    const prev = { price_override: seat.price_override };
    applyUpdate({ price_override: val });
    onClose();
    try {
      await updateSeatPrice([seat.id], val);
      pushAction?.({
        type: 'price_change',
        affected_ids: [seat.id],
        previous_values: { [seat.id]: seat.price_override },
        new_values: { [seat.id]: val },
        timestamp: new Date(),
      });
      showToast('Prijs aangepast', 'success');
    } catch (err: any) {
      applyUpdate(prev);
      showToast(err.message || 'Fout', 'error');
    }
  }

  async function handleDelete() {
    onClose();
    try {
      await deleteSeatsById([seat.id]);
      pushAction?.({
        type: 'seats_deleted',
        affected_ids: [seat.id],
        previous_values: { [seat.id]: seat },
        new_values: {},
        timestamp: new Date(),
      });
      setSectionSeats(prev => {
        const next = { ...prev };
        next[seat.section_id] = (next[seat.section_id] || []).filter(s => s.id !== seat.id);
        return next;
      });
      setSelectedSeatIds(prev => {
        const next = new Set(prev);
        next.delete(seat.id);
        return next;
      });
      const remaining = (sectionSeats[seat.section_id] || []).filter(s => s.id !== seat.id);
      setSeatSections(prev => prev.map(s =>
        s.id === seat.section_id ? { ...s, capacity: remaining.length } : s
      ));
      try { await updateSectionCapacity(seat.section_id, remaining.length); } catch {}
      showToast('Stoel verwijderd', 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij verwijderen', 'error');
    }
  }

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    zIndex: 70,
  };

  if (showDeleteConfirm) {
    return (
      <div ref={menuRef} style={menuStyle}
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-4 w-64">
        <p className="text-sm text-white mb-1 font-semibold">Stoel Verwijderen</p>
        <p className="text-xs text-slate-400 mb-3">
          Rij {seat.row_label} - Stoel {seat.seat_number}
          {seat.status === 'sold' && (
            <span className="block text-red-400 mt-1">Let op: deze stoel is verkocht!</span>
          )}
        </p>
        <div className="flex gap-2">
          <button onClick={handleDelete}
            className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded transition-colors"
            style={{ minHeight: 'auto' }}>
            Verwijderen
          </button>
          <button onClick={onClose}
            className="flex-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors"
            style={{ minHeight: 'auto' }}>
            Annuleren
          </button>
        </div>
      </div>
    );
  }

  if (showPriceInput) {
    return (
      <div ref={menuRef} style={menuStyle}
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-3 w-56">
        <p className="text-xs text-slate-300 font-semibold mb-2">Prijs Aanpassen</p>
        <input
          type="number" min="0" step="0.01" autoFocus
          value={priceValue} onChange={e => setPriceValue(e.target.value)}
          placeholder={`Sectieprijs: ${section.price_amount.toFixed(2)}`}
          className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm mb-2"
        />
        <p className="text-[11px] text-slate-500 mb-2">Leeg laten = sectieprijs gebruiken</p>
        <div className="flex gap-2">
          <button onClick={handlePriceSave}
            className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded transition-colors"
            style={{ minHeight: 'auto' }}>
            Opslaan
          </button>
          <button onClick={onClose}
            className="flex-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors"
            style={{ minHeight: 'auto' }}>
            Annuleren
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={menuRef} style={menuStyle}
      className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 min-w-[200px]">
      <div className="px-3 py-1.5 border-b border-slate-700">
        <p className="text-xs text-slate-400">
          Rij {seat.row_label} - Stoel {seat.seat_number}
        </p>
      </div>

      <MenuItem onClick={handleToggleBlock}>
        {isBlocked
          ? <><Unlock className="w-3.5 h-3.5 text-green-400" /> <span className="text-green-400">Deblokkeren</span></>
          : <><Ban className="w-3.5 h-3.5 text-slate-400" /> Blokkeren</>
        }
      </MenuItem>

      <MenuItem onClick={handleToggleVip}>
        {isVip
          ? <><StarOff className="w-3.5 h-3.5 text-slate-400" /> VIP Verwijderen</>
          : <><Star className="w-3.5 h-3.5 text-yellow-400" /> Markeer als VIP</>
        }
      </MenuItem>

      <MenuItem onClick={() => handleSetType('wheelchair')}>
        <Accessibility className="w-3.5 h-3.5 text-blue-400" /> Markeer als Rolstoel
      </MenuItem>

      <MenuItem onClick={() => handleSetType('restricted_view')}>
        <EyeOff className="w-3.5 h-3.5 text-orange-400" /> Markeer als Beperkt Zicht
      </MenuItem>

      <div className="border-t border-slate-700 my-1" />

      <MenuItem onClick={() => setShowPriceInput(true)}>
        <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Prijs Aanpassen...
      </MenuItem>

      <div className="border-t border-slate-700 my-1" />

      <MenuItem onClick={() => { onClose(); onSelectRow(seat.section_id, seat.row_label); }}>
        <Rows3 className="w-3.5 h-3.5 text-slate-300" /> Selecteer Hele Rij
      </MenuItem>

      <MenuItem onClick={() => { onClose(); onSelectSection(seat.section_id); }}>
        <LayoutGrid className="w-3.5 h-3.5 text-slate-300" /> Selecteer Hele Sectie
      </MenuItem>

      <div className="border-t border-slate-700 my-1" />

      <MenuItem onClick={() => setShowDeleteConfirm(true)} danger>
        <Trash2 className="w-3.5 h-3.5" /> Stoel Verwijderen
      </MenuItem>
    </div>
  );
}

function MenuItem({ onClick, children, danger }: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-white hover:bg-slate-700'
      }`}
      style={{ minHeight: 'auto' }}
    >
      {children}
    </button>
  );
}
