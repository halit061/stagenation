import { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Unlock, RotateCw } from 'lucide-react';

interface DimensionValues {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface Props {
  values: DimensionValues;
  onChange: (values: Partial<DimensionValues>) => void;
  minWidth?: number;
  minHeight?: number;
  maxX?: number;
  maxY?: number;
  showRotation?: boolean;
  debounceMs?: number;
}

const QUICK_ANGLES = [0, 90, 180, 270];

const fieldCls =
  'w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs text-center tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30';
const labelCls = 'text-[10px] text-slate-500 font-medium uppercase tracking-wider';

export function DimensionsPanel({
  values,
  onChange,
  minWidth = 50,
  minHeight = 50,
  maxX = 9000,
  maxY = 4500,
  showRotation = true,
  debounceMs = 200,
}: Props) {
  const [local, setLocal] = useState<DimensionValues>(values);
  const [aspectLock, setAspectLock] = useState(false);
  const aspectRatio = useRef(values.width / values.height || 1);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(values);
  }, [values.x, values.y, values.width, values.height, values.rotation]);

  useEffect(() => {
    if (values.height > 0) {
      aspectRatio.current = values.width / values.height;
    }
  }, [values.width, values.height]);

  const emitChange = useCallback(
    (updated: DimensionValues) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        const diff: Partial<DimensionValues> = {};
        if (updated.x !== values.x) diff.x = updated.x;
        if (updated.y !== values.y) diff.y = updated.y;
        if (updated.width !== values.width) diff.width = updated.width;
        if (updated.height !== values.height) diff.height = updated.height;
        if (updated.rotation !== values.rotation) diff.rotation = updated.rotation;
        if (Object.keys(diff).length > 0) onChange(diff);
      }, debounceMs);
    },
    [values, onChange, debounceMs],
  );

  const handleField = (field: keyof DimensionValues, raw: string) => {
    const num = parseInt(raw, 10);
    if (isNaN(num)) return;

    let v = num;
    if (field === 'x') v = Math.max(0, Math.min(maxX, v));
    if (field === 'y') v = Math.max(0, Math.min(maxY, v));
    if (field === 'width') v = Math.max(minWidth, Math.min(5000, v));
    if (field === 'height') v = Math.max(minHeight, Math.min(5000, v));
    if (field === 'rotation') v = ((v % 360) + 360) % 360;

    let next = { ...local, [field]: v };

    if (aspectLock) {
      if (field === 'width') {
        const h = Math.max(minHeight, Math.round(v / aspectRatio.current));
        next = { ...next, height: h };
      } else if (field === 'height') {
        const w = Math.max(minWidth, Math.round(v * aspectRatio.current));
        next = { ...next, width: w };
      }
    }

    setLocal(next);
    emitChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: keyof DimensionValues) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      const diff: Partial<DimensionValues> = {};
      if (local.x !== values.x) diff.x = local.x;
      if (local.y !== values.y) diff.y = local.y;
      if (local.width !== values.width) diff.width = local.width;
      if (local.height !== values.height) diff.height = local.height;
      if (local.rotation !== values.rotation) diff.rotation = local.rotation;
      if (Object.keys(diff).length > 0) onChange(diff);
    }
    if (e.key === 'Escape') {
      setLocal(values);
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const delta = e.key === 'ArrowUp' ? step : -step;
      handleField(field, String(local[field] + delta));
    }
  };

  const setQuickAngle = (a: number) => {
    const next = { ...local, rotation: a };
    setLocal(next);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const diff: Partial<DimensionValues> = { rotation: a };
    if (local.x !== values.x) diff.x = local.x;
    if (local.y !== values.y) diff.y = local.y;
    if (local.width !== values.width) diff.width = local.width;
    if (local.height !== values.height) diff.height = local.height;
    onChange(diff);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className={labelCls}>X</label>
          <input
            type="number"
            value={Math.round(local.x)}
            onChange={(e) => handleField('x', e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'x')}
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>Y</label>
          <input
            type="number"
            value={Math.round(local.y)}
            onChange={(e) => handleField('y', e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'y')}
            className={fieldCls}
          />
        </div>
      </div>

      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <label className={labelCls}>B</label>
          <input
            type="number"
            value={Math.round(local.width)}
            onChange={(e) => handleField('width', e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'width')}
            className={fieldCls}
          />
        </div>
        <button
          onClick={() => setAspectLock((p) => !p)}
          className={`p-1.5 rounded transition-colors mb-0.5 ${
            aspectLock
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
          }`}
          title={aspectLock ? 'Aspect ratio vergrendeld' : 'Aspect ratio ontgrendeld'}
        >
          {aspectLock ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
        <div className="flex-1">
          <label className={labelCls}>H</label>
          <input
            type="number"
            value={Math.round(local.height)}
            onChange={(e) => handleField('height', e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'height')}
            className={fieldCls}
          />
        </div>
      </div>

      {showRotation && (
        <div>
          <label className={labelCls}>
            <span className="flex items-center gap-1">
              <RotateCw className="w-2.5 h-2.5" />
              Rotatie
            </span>
          </label>
          <div className="flex items-center gap-1.5 mt-0.5">
            <input
              type="range"
              min="0"
              max="360"
              value={local.rotation}
              onChange={(e) => handleField('rotation', e.target.value)}
              className="flex-1 accent-blue-500 h-1"
            />
            <input
              type="number"
              min="0"
              max="360"
              value={Math.round(local.rotation)}
              onChange={(e) => handleField('rotation', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'rotation')}
              className="w-14 px-1.5 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs text-center focus:border-blue-500 focus:outline-none"
            />
            <span className="text-slate-500 text-[10px]">deg</span>
          </div>
          <div className="flex gap-1 mt-1">
            {QUICK_ANGLES.map((a) => (
              <button
                key={a}
                onClick={() => setQuickAngle(a)}
                className={`flex-1 px-1 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  Math.round(local.rotation) === a
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {a}°
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
