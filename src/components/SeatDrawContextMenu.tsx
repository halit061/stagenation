import { useState, useEffect, useRef } from 'react';
import { Trash2, Tag, Hash } from 'lucide-react';
import type { Seat, SeatSection } from '../types/seats';

interface SeatDrawContextMenuProps {
  seat: Seat;
  section: SeatSection;
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: (seatId: string, sectionId: string) => void;
  onChangeRowLabel: (seatId: string, sectionId: string, newLabel: string) => void;
  onChangeNumber: (seatId: string, sectionId: string, newNumber: number) => void;
}

export function SeatDrawContextMenu({
  seat,
  section,
  position,
  onClose,
  onDelete,
  onChangeRowLabel,
  onChangeNumber,
}: SeatDrawContextMenuProps) {
  const [mode, setMode] = useState<'menu' | 'row' | 'number'>('menu');
  const [inputVal, setInputVal] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (mode !== 'menu' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  const handleSubmit = () => {
    if (mode === 'row' && inputVal.trim()) {
      onChangeRowLabel(seat.id, section.id, inputVal.trim());
      onClose();
    } else if (mode === 'number') {
      const num = parseInt(inputVal);
      if (!isNaN(num) && num > 0) {
        onChangeNumber(seat.id, section.id, num);
        onClose();
      }
    }
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[70] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 min-w-[180px]"
      style={{ left: position.x, top: position.y }}
    >
      {mode === 'menu' ? (
        <>
          <div className="px-3 py-1.5 border-b border-slate-700">
            <p className="text-[10px] text-slate-400">
              Rij {seat.row_label} - Stoel {seat.seat_number}
            </p>
          </div>
          <button
            onClick={() => {
              onDelete(seat.id, section.id);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-slate-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Verwijder stoel
          </button>
          <button
            onClick={() => { setMode('row'); setInputVal(seat.row_label); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <Tag className="w-3.5 h-3.5" />
            Wijzig rij label
          </button>
          <button
            onClick={() => { setMode('number'); setInputVal(String(seat.seat_number)); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <Hash className="w-3.5 h-3.5" />
            Wijzig nummer
          </button>
        </>
      ) : (
        <div className="px-3 py-2 space-y-2">
          <p className="text-[10px] text-slate-400">
            {mode === 'row' ? 'Nieuw rij label' : 'Nieuw stoelnummer'}
          </p>
          <input
            ref={inputRef}
            type={mode === 'number' ? 'number' : 'text'}
            min={mode === 'number' ? 1 : undefined}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') onClose();
            }}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleSubmit}
              className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
            >
              Opslaan
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors"
            >
              Annuleer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
