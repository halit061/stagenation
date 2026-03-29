import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  X, ChevronDown, Trash2, Loader2,
  Star, Accessibility, EyeOff, Users, Armchair,
} from 'lucide-react';
import type { Seat, SeatSection, SeatStatus, SeatType } from '../types/seats';
import {
  updateSeatStatus,
  updateSeatPrice,
  updateSeat,
  deleteSeatsById,
  insertSeats,
  updateSectionCapacity,
  updateSeatNumbers,
  getSeatsBySection,
} from '../services/seatService';

function updateSectionCapacity_local(
  sectionId: string, newCapacity: number,
  setSeatSections: React.Dispatch<React.SetStateAction<SeatSection[]>>
) {
  setSeatSections(prev => prev.map(s =>
    s.id === sectionId ? { ...s, capacity: newCapacity } : s
  ));
}

interface Props {
  selectedSeats: Seat[];
  sections: SeatSection[];
  sectionSeats: Record<string, Seat[]>;
  onDeselectAll: () => void;
  setSectionSeats: React.Dispatch<React.SetStateAction<Record<string, Seat[]>>>;
  setSeatSections: React.Dispatch<React.SetStateAction<SeatSection[]>>;
  setSelectedSeatIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type PopoverType = 'status' | 'type' | 'price' | 'addRow' | 'addSeat' | null;

export function SeatActionBar({
  selectedSeats,
  sections,
  sectionSeats,
  onDeselectAll,
  setSectionSeats,
  setSeatSections,
  setSelectedSeatIds,
  showToast,
}: Props) {
  const [openPopover, setOpenPopover] = useState<PopoverType>(null);
  const [loading, setLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [priceMode, setPriceMode] = useState<'fixed' | 'section'>('fixed');
  const [priceValue, setPriceValue] = useState('');
  const [addRowCount, setAddRowCount] = useState(1);
  const [addRowSeatsPerRow, setAddRowSeatsPerRow] = useState(0);
  const [addSeatCount, setAddSeatCount] = useState(1);
  const [addSeatSide, setAddSeatSide] = useState<'right' | 'left'>('right');
  const barRef = useRef<HTMLDivElement>(null);

  const count = selectedSeats.length;
  const ids = useMemo(() => selectedSeats.map(s => s.id), [selectedSeats]);

  const sectionMap = useMemo(() => {
    const m = new Map<string, SeatSection>();
    for (const s of sections) m.set(s.id, s);
    return m;
  }, [sections]);

  const uniqueSectionIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of selectedSeats) set.add(s.section_id);
    return set;
  }, [selectedSeats]);

  const isSingleSection = uniqueSectionIds.size === 1;

  const uniqueRowKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of selectedSeats) set.add(`${s.section_id}:${s.row_label}`);
    return set;
  }, [selectedSeats]);

  const isSingleRow = uniqueRowKeys.size === 1;

  const singleSection = isSingleSection
    ? sectionMap.get([...uniqueSectionIds][0]) ?? null
    : null;

  const lastRowLabel = useMemo(() => {
    if (!singleSection) return '';
    const seats = sectionSeats[singleSection.id] || [];
    if (seats.length === 0) return 'A';
    const labels = [...new Set(seats.map(s => s.row_label))];
    labels.sort();
    return labels[labels.length - 1];
  }, [singleSection, sectionSeats]);

  useEffect(() => {
    if (singleSection && addRowSeatsPerRow === 0) {
      setAddRowSeatsPerRow(singleSection.seats_per_row || 10);
    }
  }, [singleSection, addRowSeatsPerRow]);

  const singleRowLabel = isSingleRow ? selectedSeats[0]?.row_label : null;

  const lastSeatInRow = useMemo(() => {
    if (!isSingleRow || !singleSection) return 0;
    const allSeats = sectionSeats[singleSection.id] || [];
    const rowSeats = allSeats.filter(s => s.row_label === singleRowLabel);
    return Math.max(0, ...rowSeats.map(s => s.seat_number));
  }, [isSingleRow, singleSection, singleRowLabel, sectionSeats]);

  const soldCount = useMemo(
    () => selectedSeats.filter(s => s.status === 'sold').length,
    [selectedSeats]
  );

  const closePopover = useCallback(() => setOpenPopover(null), []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        closePopover();
      }
    }
    if (openPopover) {
      document.addEventListener('mousedown', onClick);
      return () => document.removeEventListener('mousedown', onClick);
    }
  }, [openPopover, closePopover]);

  function applyOptimistic(updates: Partial<Pick<Seat, 'status' | 'seat_type' | 'price_override'>>) {
    setSectionSeats(prev => {
      const next = { ...prev };
      for (const [secId, seats] of Object.entries(next)) {
        const idSet = new Set(ids);
        const hasAny = seats.some(s => idSet.has(s.id));
        if (hasAny) {
          next[secId] = seats.map(s =>
            idSet.has(s.id) ? { ...s, ...updates } as Seat : s
          );
        }
      }
      return next;
    });
  }

  async function handleStatusChange(status: SeatStatus) {
    setLoading(true);
    const prev = captureSnapshot();
    applyOptimistic({ status });
    closePopover();
    try {
      await updateSeatStatus(ids, status);
      const label = status === 'available' ? 'beschikbaar' : status === 'blocked' ? 'geblokkeerd' : status;
      showToast(`Status gewijzigd naar ${label} voor ${count} stoelen`, 'success');
    } catch (err: any) {
      restoreSnapshot(prev);
      showToast(err.message || 'Fout bij status wijzigen', 'error');
    }
    setLoading(false);
  }

  async function handleTypeChange(seatType: SeatType) {
    setLoading(true);
    const prev = captureSnapshot();
    applyOptimistic({ seat_type: seatType });
    closePopover();
    try {
      await updateSeat(ids, { seat_type: seatType });
      const labels: Record<string, string> = {
        regular: 'Regulier', vip: 'VIP', wheelchair: 'Rolstoel',
        restricted_view: 'Beperkt zicht', companion: 'Companion',
      };
      showToast(`Type gewijzigd naar ${labels[seatType] || seatType} voor ${count} stoelen`, 'success');
    } catch (err: any) {
      restoreSnapshot(prev);
      showToast(err.message || 'Fout bij type wijzigen', 'error');
    }
    setLoading(false);
  }

  async function handlePriceApply() {
    setLoading(true);
    const prev = captureSnapshot();
    const priceOverride = priceMode === 'section' ? null : parseFloat(priceValue) || 0;
    applyOptimistic({ price_override: priceOverride });
    closePopover();
    try {
      await updateSeatPrice(ids, priceOverride);
      showToast(`Prijs aangepast voor ${count} stoelen`, 'success');
    } catch (err: any) {
      restoreSnapshot(prev);
      showToast(err.message || 'Fout bij prijs wijzigen', 'error');
    }
    setLoading(false);
  }

  async function handleDeleteConfirm() {
    if (!singleSection && uniqueSectionIds.size === 0) return;
    setLoading(true);
    setShowDeleteModal(false);
    try {
      await deleteSeatsById(ids);
      const affectedSections = [...uniqueSectionIds];
      for (const secId of affectedSections) {
        setSectionSeats(prev => {
          const idSet = new Set(ids);
          const next = { ...prev };
          next[secId] = (next[secId] || []).filter(s => !idSet.has(s.id));
          return next;
        });
        const remaining = (sectionSeats[secId] || []).filter(s => !ids.includes(s.id));
        updateSectionCapacity_local(secId, remaining.length, setSeatSections);
        try {
          await updateSectionCapacity(secId, remaining.length);
        } catch {}
      }
      setSelectedSeatIds(new Set());
      showToast(`${count} stoelen verwijderd`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij verwijderen', 'error');
    }
    setLoading(false);
  }

  async function handleAddRows() {
    if (!singleSection) return;
    setLoading(true);
    closePopover();
    try {
      let rowLabel = lastRowLabel;
      const existingSeats = sectionSeats[singleSection.id] || [];
      const existingRows = [...new Set(existingSeats.map(s => s.row_label))];
      existingRows.sort();
      const lastRow = existingRows[existingRows.length - 1] || 'A';
      rowLabel = lastRow;

      const rowSpacing = 35;
      const seatSpacing = 25;
      const maxY = existingSeats.length > 0
        ? Math.max(...existingSeats.map(s => s.y_position))
        : 0;

      const newSeats: Array<{
        section_id: string; row_label: string; seat_number: number;
        x_position: number; y_position: number; status: SeatStatus; seat_type: string;
      }> = [];

      for (let r = 0; r < addRowCount; r++) {
        rowLabel = nextLabel(rowLabel);
        const yPos = maxY + (r + 1) * rowSpacing;
        for (let s = 0; s < addRowSeatsPerRow; s++) {
          const centerOffset = s - (addRowSeatsPerRow - 1) / 2;
          newSeats.push({
            section_id: singleSection.id,
            row_label: rowLabel,
            seat_number: s + 1,
            x_position: centerOffset * seatSpacing,
            y_position: yPos,
            status: 'available',
            seat_type: 'regular',
          });
        }
      }

      const inserted = await insertSeats(newSeats);
      setSectionSeats(prev => ({
        ...prev,
        [singleSection.id]: [...(prev[singleSection.id] || []), ...inserted],
      }));
      const newCap = (sectionSeats[singleSection.id] || []).length + inserted.length;
      updateSectionCapacity_local(singleSection.id, newCap, setSeatSections);
      await updateSectionCapacity(singleSection.id, newCap);
      showToast(`${addRowCount} rijen toegevoegd (${inserted.length} nieuwe stoelen)`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij rijen toevoegen', 'error');
    }
    setLoading(false);
  }

  async function handleAddSeats() {
    if (!singleSection || !singleRowLabel) return;
    setLoading(true);
    closePopover();
    try {
      const allSeats = sectionSeats[singleSection.id] || [];
      const rowSeats = allSeats.filter(s => s.row_label === singleRowLabel);
      const sorted = [...rowSeats].sort((a, b) => a.seat_number - b.seat_number);
      const seatSpacing = 25;

      if (addSeatSide === 'right') {
        const lastNum = sorted.length > 0 ? sorted[sorted.length - 1].seat_number : 0;
        const lastX = sorted.length > 0 ? sorted[sorted.length - 1].x_position : 0;
        const y = sorted.length > 0 ? sorted[0].y_position : 0;
        const newSeats = [];
        for (let i = 0; i < addSeatCount; i++) {
          newSeats.push({
            section_id: singleSection.id,
            row_label: singleRowLabel,
            seat_number: lastNum + i + 1,
            x_position: lastX + (i + 1) * seatSpacing,
            y_position: y,
            status: 'available' as SeatStatus,
            seat_type: 'regular',
          });
        }
        const inserted = await insertSeats(newSeats);
        setSectionSeats(prev => ({
          ...prev,
          [singleSection.id]: [...(prev[singleSection.id] || []), ...inserted],
        }));
      } else {
        const y = sorted.length > 0 ? sorted[0].y_position : 0;
        const firstX = sorted.length > 0 ? sorted[0].x_position : 0;
        const newSeats = [];
        for (let i = 0; i < addSeatCount; i++) {
          newSeats.push({
            section_id: singleSection.id,
            row_label: singleRowLabel,
            seat_number: i + 1,
            x_position: firstX - (addSeatCount - i) * seatSpacing,
            y_position: y,
            status: 'available' as SeatStatus,
            seat_type: 'regular',
          });
        }
        const renumber = sorted.map((s, idx) => ({
          id: s.id,
          seat_number: addSeatCount + idx + 1,
        }));
        await updateSeatNumbers(renumber);
        await insertSeats(newSeats);
        const refreshed = await getSeatsBySection(singleSection.id);
        setSectionSeats(prev => ({ ...prev, [singleSection.id]: refreshed }));
      }

      const newCap = (sectionSeats[singleSection.id] || []).length + addSeatCount;
      updateSectionCapacity_local(singleSection.id, newCap, setSeatSections);
      await updateSectionCapacity(singleSection.id, newCap);
      showToast(`${addSeatCount} stoelen toegevoegd aan rij ${singleRowLabel}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij stoelen toevoegen', 'error');
    }
    setLoading(false);
  }

  function captureSnapshot(): Record<string, Seat[]> {
    const snap: Record<string, Seat[]> = {};
    for (const secId of uniqueSectionIds) {
      snap[secId] = [...(sectionSeats[secId] || [])];
    }
    return snap;
  }

  function restoreSnapshot(snap: Record<string, Seat[]>) {
    setSectionSeats(prev => {
      const next = { ...prev };
      for (const [secId, seats] of Object.entries(snap)) {
        next[secId] = seats;
      }
      return next;
    });
  }

  if (count === 0) return null;

  const sectionPrice = singleSection?.price_amount ?? 0;

  return (
    <>
      <div
        ref={barRef}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] action-bar-enter"
        style={{ maxWidth: '90vw' }}
      >
        <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3 flex-wrap relative">
          {loading && (
            <div className="absolute inset-0 bg-slate-800/80 rounded-xl flex items-center justify-center z-10">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}

          <div className="flex items-center gap-2 mr-2">
            <span className="text-white text-sm font-semibold whitespace-nowrap tabular-nums">
              {count} {count === 1 ? 'stoel' : 'stoelen'}
            </span>
            <button onClick={onDeselectAll} className="p-1 hover:bg-slate-700 rounded transition-colors" style={{ minHeight: 'auto' }}>
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          <div className="h-6 w-px bg-slate-600" />

          <PopoverButton
            label="Status"
            isOpen={openPopover === 'status'}
            onToggle={() => setOpenPopover(openPopover === 'status' ? null : 'status')}
          >
            <div className="py-1">
              <DropdownItem onClick={() => handleStatusChange('available')}>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Beschikbaar maken
              </DropdownItem>
              <DropdownItem onClick={() => handleStatusChange('blocked')}>
                <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block relative">
                  <span className="absolute inset-0 flex items-center justify-center text-[6px] text-white font-bold">x</span>
                </span> Blokkeren
              </DropdownItem>
            </div>
          </PopoverButton>

          <PopoverButton
            label="Type"
            isOpen={openPopover === 'type'}
            onToggle={() => setOpenPopover(openPopover === 'type' ? null : 'type')}
          >
            <div className="py-1">
              <DropdownItem onClick={() => handleTypeChange('regular')}>
                <Armchair className="w-3.5 h-3.5 text-slate-300" /> Regulier
              </DropdownItem>
              <DropdownItem onClick={() => handleTypeChange('vip')}>
                <Star className="w-3.5 h-3.5 text-yellow-400" /> VIP
              </DropdownItem>
              <DropdownItem onClick={() => handleTypeChange('wheelchair')}>
                <Accessibility className="w-3.5 h-3.5 text-blue-400" /> Rolstoel
              </DropdownItem>
              <DropdownItem onClick={() => handleTypeChange('restricted_view')}>
                <EyeOff className="w-3.5 h-3.5 text-orange-400" /> Beperkt Zicht
              </DropdownItem>
              <DropdownItem onClick={() => handleTypeChange('companion')}>
                <Users className="w-3.5 h-3.5 text-teal-400" /> Companion
              </DropdownItem>
            </div>
          </PopoverButton>

          <PopoverButton
            label="Prijs"
            isOpen={openPopover === 'price'}
            onToggle={() => {
              setPriceMode('fixed');
              setPriceValue('');
              setOpenPopover(openPopover === 'price' ? null : 'price');
            }}
          >
            <div className="p-3 w-64">
              <p className="text-xs text-slate-300 font-semibold mb-2">
                Prijs instellen voor {count} stoelen
              </p>
              <label className="flex items-center gap-2 mb-2 cursor-pointer text-sm text-white">
                <input type="radio" checked={priceMode === 'fixed'} onChange={() => setPriceMode('fixed')}
                  className="accent-green-500" style={{ minHeight: 'auto', minWidth: 'auto' }} />
                Vaste prijs per stoel
              </label>
              {priceMode === 'fixed' && (
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={priceValue} onChange={e => setPriceValue(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm mb-2"
                />
              )}
              <label className="flex items-center gap-2 mb-1 cursor-pointer text-sm text-white">
                <input type="radio" checked={priceMode === 'section'} onChange={() => setPriceMode('section')}
                  className="accent-green-500" style={{ minHeight: 'auto', minWidth: 'auto' }} />
                Sectie-prijs gebruiken (reset)
              </label>
              {priceMode === 'section' && (
                <p className="text-xs text-slate-400 ml-6 mb-2">
                  Huidige sectie-prijs: EUR {sectionPrice.toFixed(2)}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={handlePriceApply}
                  className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded transition-colors">
                  Toepassen
                </button>
                <button onClick={closePopover}
                  className="flex-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors">
                  Annuleren
                </button>
              </div>
            </div>
          </PopoverButton>

          {isSingleSection && (
            <PopoverButton
              label="Rij +"
              isOpen={openPopover === 'addRow'}
              onToggle={() => {
                setAddRowCount(1);
                if (singleSection) setAddRowSeatsPerRow(singleSection.seats_per_row || 10);
                setOpenPopover(openPopover === 'addRow' ? null : 'addRow');
              }}
            >
              <div className="p-3 w-64">
                <p className="text-xs text-slate-300 font-semibold mb-2">
                  Rijen toevoegen aan {singleSection?.name}
                </p>
                <label className="block text-xs text-slate-400 mb-1">Aantal rijen:</label>
                <input type="number" min={1} max={20} value={addRowCount}
                  onChange={e => setAddRowCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm mb-2" />
                <label className="block text-xs text-slate-400 mb-1">Stoelen per rij:</label>
                <input type="number" min={1} max={100} value={addRowSeatsPerRow}
                  onChange={e => setAddRowSeatsPerRow(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm mb-2" />
                <p className="text-[11px] text-slate-500 mb-3">
                  Nieuwe rijen worden toegevoegd na rij {lastRowLabel}. Nummering gaat automatisch verder.
                </p>
                <div className="flex gap-2">
                  <button onClick={handleAddRows}
                    className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded transition-colors">
                    Toevoegen
                  </button>
                  <button onClick={closePopover}
                    className="flex-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors">
                    Annuleren
                  </button>
                </div>
              </div>
            </PopoverButton>
          )}

          {isSingleRow && isSingleSection && (
            <PopoverButton
              label="Stoel +"
              isOpen={openPopover === 'addSeat'}
              onToggle={() => {
                setAddSeatCount(1);
                setAddSeatSide('right');
                setOpenPopover(openPopover === 'addSeat' ? null : 'addSeat');
              }}
            >
              <div className="p-3 w-64">
                <p className="text-xs text-slate-300 font-semibold mb-2">
                  Stoelen toevoegen aan Rij {singleRowLabel}
                </p>
                <label className="block text-xs text-slate-400 mb-1">Aantal stoelen:</label>
                <input type="number" min={1} max={20} value={addSeatCount}
                  onChange={e => setAddSeatCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm mb-2" />
                <label className="block text-xs text-slate-400 mb-1">Toevoegen aan:</label>
                <div className="space-y-1 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-white">
                    <input type="radio" checked={addSeatSide === 'right'} onChange={() => setAddSeatSide('right')}
                      className="accent-green-500" style={{ minHeight: 'auto', minWidth: 'auto' }} />
                    Rechts (na stoel {lastSeatInRow})
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-white">
                    <input type="radio" checked={addSeatSide === 'left'} onChange={() => setAddSeatSide('left')}
                      className="accent-green-500" style={{ minHeight: 'auto', minWidth: 'auto' }} />
                    Links (voor stoel 1)
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">Nummering wordt automatisch aangepast.</p>
                <div className="flex gap-2">
                  <button onClick={handleAddSeats}
                    className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded transition-colors">
                    Toevoegen
                  </button>
                  <button onClick={closePopover}
                    className="flex-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors">
                    Annuleren
                  </button>
                </div>
              </div>
            </PopoverButton>
          )}

          <div className="h-6 w-px bg-slate-600" />

          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
            style={{ minHeight: 'auto' }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Verwijderen
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-2">Stoelen Verwijderen</h3>
            <p className="text-sm text-slate-300 mb-3">
              Weet je zeker dat je {count} {count === 1 ? 'stoel' : 'stoelen'} wilt verwijderen? Dit kan niet ongedaan worden.
            </p>
            {soldCount > 0 && (
              <p className="text-sm text-red-400 font-medium mb-3">
                Let op: {soldCount} van deze stoelen {soldCount === 1 ? 'is' : 'zijn'} al verkocht!
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors">
                Ja, Verwijderen
              </button>
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors">
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PopoverButton({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
          isOpen ? 'bg-slate-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
        }`}
        style={{ minHeight: 'auto' }}
      >
        {label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-[65] min-w-[180px]">
          {children}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-600" />
        </div>
      )}
    </div>
  );
}

function DropdownItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-2 transition-colors"
      style={{ minHeight: 'auto' }}
    >
      {children}
    </button>
  );
}

function nextLabel(current: string): string {
  if (/^\d+$/.test(current)) return String(Number(current) + 1);
  const chars = current.split('');
  let carry = true;
  for (let i = chars.length - 1; i >= 0 && carry; i--) {
    const code = chars[i].charCodeAt(0);
    if (code < 90) {
      chars[i] = String.fromCharCode(code + 1);
      carry = false;
    } else {
      chars[i] = 'A';
    }
  }
  if (carry) chars.unshift('A');
  return chars.join('');
}
