import { useState, useRef, useEffect } from 'react';
import { Move, RotateCw, Copy, Pencil, Trash2 } from 'lucide-react';
import type { SeatSection } from '../types/seats';

interface FloatingToolbarProps {
  item: { type: 'table' | 'object' | 'section'; data: any };
  svgRef: React.RefObject<SVGSVGElement>;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRotate: (angle: number) => void;
}

const QUICK_ANGLES = [0, 90, 180, 270] as const;

export function FloatingToolbar({
  item,
  svgRef,
  onEdit,
  onDuplicate,
  onDelete,
  onRotate,
}: FloatingToolbarProps) {
  const [showRotation, setShowRotation] = useState(false);
  const rotRef = useRef<HTMLDivElement>(null);

  const isSection = item.type === 'section';
  const d = item.data;
  const ix = isSection ? (d as SeatSection).position_x : d.x;
  const iy = isSection ? (d as SeatSection).position_y : d.y;
  const iw = d.width;

  const currentRotation = d.rotation || 0;

  useEffect(() => {
    if (!showRotation) return;
    function handleClick(e: MouseEvent) {
      if (rotRef.current && !rotRef.current.contains(e.target as Node)) {
        setShowRotation(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showRotation]);

  const svg = svgRef.current;
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  const svgWidth = svg.viewBox.baseVal.width;
  const scale = rect.width / svgWidth;

  const toolbarX = rect.left + (ix + iw / 2) * scale;
  const toolbarY = rect.top + iy * scale - 12;

  const btnCls = 'p-1.5 rounded transition-colors text-white';

  return (
    <div
      className="fixed z-[60] flex items-center pointer-events-auto"
      style={{
        left: toolbarX,
        top: toolbarY,
        transform: 'translate(-50%, -100%)',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl flex items-center gap-0.5 px-1 py-0.5 relative">
        <button
          className={`${btnCls} hover:bg-slate-600 cursor-grab`}
          title="Verplaats (sleep het blok)"
        >
          <Move className="w-4 h-4" />
        </button>

        <div className="relative" ref={rotRef}>
          <button
            className={`${btnCls} ${showRotation ? 'bg-blue-600' : 'hover:bg-slate-600'}`}
            title="Roteren"
            onClick={() => setShowRotation(!showRotation)}
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {showRotation && (
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-3 min-w-[200px]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={currentRotation}
                  onChange={(e) => onRotate(parseInt(e.target.value))}
                  className="flex-1 accent-blue-500 h-1.5"
                />
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={currentRotation}
                  onChange={(e) => onRotate(Math.max(0, Math.min(360, parseInt(e.target.value) || 0)))}
                  className="w-14 px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-white text-xs text-center"
                />
                <span className="text-slate-400 text-xs">deg</span>
              </div>
              <div className="flex gap-1">
                {QUICK_ANGLES.map((a) => (
                  <button
                    key={a}
                    onClick={() => onRotate(a)}
                    className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      currentRotation === a
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-slate-600 mx-0.5" />

        <button
          className={`${btnCls} hover:bg-slate-600`}
          title="Dupliceren (D)"
          onClick={onDuplicate}
        >
          <Copy className="w-4 h-4" />
        </button>

        <button
          className={`${btnCls} hover:bg-slate-600`}
          title="Bewerken (Enter)"
          onClick={onEdit}
        >
          <Pencil className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-600 mx-0.5" />

        <button
          className={`${btnCls} hover:bg-red-600`}
          title="Verwijderen (Delete)"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
