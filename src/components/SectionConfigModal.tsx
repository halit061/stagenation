import { useState, useMemo } from 'react';
import { X, Rows3, Grid3x3 } from 'lucide-react';
import type { NumberingDirection } from '../types/seats';
import {
  sanitizeText,
  validateSectionName,
  validateRows,
  validateSeatsPerRow,
  validatePrice,
  validatePriceCategory,
} from '../lib/validation';

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

export interface SectionFormData {
  name: string;
  section_type: 'tribune' | 'plein';
  color: string;
  price_category: string;
  price_amount: number;
  rows: number;
  seats_per_row: number;
  start_row_label: string;
  numbering_direction: NumberingDirection;
  row_spacing: number;
  seat_spacing: number;
  row_curve: number;
}

interface SectionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SectionFormData) => void;
  initialData?: Partial<SectionFormData>;
  editMode?: boolean;
  loading?: boolean;
}

function defaultForm(type: 'tribune' | 'plein'): SectionFormData {
  return {
    name: '',
    section_type: type,
    color: type === 'tribune' ? '#3b82f6' : '#14b8a6',
    price_category: '',
    price_amount: 0,
    rows: 5,
    seats_per_row: 10,
    start_row_label: 'A',
    numbering_direction: 'left-to-right',
    row_spacing: 35,
    seat_spacing: 25,
    row_curve: 0,
  };
}

export function SectionConfigModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  editMode = false,
  loading = false,
}: SectionConfigModalProps) {
  const [form, setForm] = useState<SectionFormData>(() => ({
    ...defaultForm(initialData?.section_type ?? 'tribune'),
    ...initialData,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  function update<K extends keyof SectionFormData>(key: K, val: SectionFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    const nameErr = validateSectionName(form.name);
    if (nameErr) e.name = nameErr;
    const rowsErr = validateRows(form.rows);
    if (rowsErr) e.rows = rowsErr;
    const seatsErr = validateSeatsPerRow(form.seats_per_row);
    if (seatsErr) e.seats_per_row = seatsErr;
    const priceErr = validatePrice(form.price_amount);
    if (priceErr) e.price_amount = priceErr;
    if (form.price_category) {
      const catErr = validatePriceCategory(form.price_category);
      if (catErr) e.price_category = catErr;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSubmit({
      ...form,
      name: sanitizeText(form.name),
      price_category: sanitizeText(form.price_category),
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-white">
            {editMode ? 'Sectie Bewerken' : 'Nieuwe Sectie Aanmaken'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-5">
            <Field label="Sectie Naam" error={errors.name}>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="bijv. BLOK A, TRIBUNE LINKS"
                maxLength={100}
                className={inputCls}
              />
            </Field>

            <div>
              <label className={labelCls}>Sectie Type</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { type: 'tribune' as const, label: 'Tribune', desc: 'Genummerde zitplaatsen in rijen', icon: <Rows3 className="w-5 h-5" /> },
                  { type: 'plein' as const, label: 'Plein', desc: 'Genummerde plaatsen in een vlak grid', icon: <Grid3x3 className="w-5 h-5" /> },
                ] as const).map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => update('section_type', opt.type)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      form.section_type === opt.type
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={form.section_type === opt.type ? 'text-blue-400' : 'text-slate-400'}>{opt.icon}</span>
                      <span className="font-semibold text-white text-sm">{opt.label}</span>
                    </div>
                    <p className="text-xs text-slate-400">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Kleur</label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => update('color', c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      form.color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => update('color', e.target.value)}
                  className="w-8 h-8 rounded-full cursor-pointer bg-transparent border-0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Prijscategorie" error={errors.price_category}>
                <input
                  type="text"
                  value={form.price_category}
                  onChange={(e) => update('price_category', e.target.value)}
                  placeholder="bijv. VIP"
                  maxLength={50}
                  className={inputCls}
                />
              </Field>
              <Field label="Prijs (EUR)" error={errors.price_amount}>
                <input
                  type="number"
                  min="0"
                  max="99999.99"
                  step="0.01"
                  value={form.price_amount}
                  onChange={(e) => update('price_amount', parseFloat(e.target.value) || 0)}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Aantal Rijen" error={errors.rows}>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={form.rows}
                  onChange={(e) => update('rows', parseInt(e.target.value) || 1)}
                  className={inputCls}
                />
              </Field>
              <Field label="Stoelen per Rij" error={errors.seats_per_row}>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={form.seats_per_row}
                  onChange={(e) => update('seats_per_row', parseInt(e.target.value) || 1)}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Rij Label">
                <select value={form.start_row_label} onChange={(e) => update('start_row_label', e.target.value)} className={inputCls}>
                  <option value="A">Letters (A, B, C...)</option>
                  <option value="1">Nummers (1, 2, 3...)</option>
                </select>
              </Field>
              <Field label="Nummering Richting">
                <select value={form.numbering_direction} onChange={(e) => update('numbering_direction', e.target.value as NumberingDirection)} className={inputCls}>
                  <option value="left-to-right">Links naar Rechts</option>
                  <option value="right-to-left">Rechts naar Links</option>
                  <option value="center-out">Vanuit het Midden</option>
                </select>
              </Field>
            </div>

            <Field label={`Rij Afstand: ${form.row_spacing}px`}>
              <input type="range" min="20" max="60" value={form.row_spacing}
                onChange={(e) => update('row_spacing', parseInt(e.target.value))}
                className="w-full accent-blue-500" />
            </Field>

            <Field label={`Stoel Afstand: ${form.seat_spacing}px`}>
              <input type="range" min="15" max="40" value={form.seat_spacing}
                onChange={(e) => update('seat_spacing', parseInt(e.target.value))}
                className="w-full accent-blue-500" />
            </Field>

            {form.section_type === 'tribune' && (
              <Field label={`Rij Curve: ${Math.round(form.row_curve * 100)}%`}>
                <input type="range" min="0" max="1" step="0.01" value={form.row_curve}
                  onChange={(e) => update('row_curve', parseFloat(e.target.value))}
                  className="w-full accent-blue-500" />
              </Field>
            )}
          </div>

          <div>
            <label className={labelCls}>Live Preview ({form.rows * form.seats_per_row} stoelen)</label>
            <SeatPreview form={form} />
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-all">
            Annuleren
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white font-semibold rounded-lg transition-all flex items-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : null}
            {editMode ? 'Bijwerken' : 'Genereer & Plaats'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SeatPreview({ form }: { form: SectionFormData }) {
  const seats = useMemo(() => {
    const result: { x: number; y: number; row: string; num: number }[] = [];
    let rowLabel = form.start_row_label;
    const rows = Math.min(form.rows, 50);
    const perRow = Math.min(form.seats_per_row, 100);

    for (let r = 0; r < rows; r++) {
      for (let s = 0; s < perRow; s++) {
        const centerOffset = s - (perRow - 1) / 2;
        const xBase = centerOffset * form.seat_spacing;
        const yPos = r * form.row_spacing;
        const curveOffset = form.row_curve * r * r * 0.5;
        const yCurve = curveOffset * Math.abs(centerOffset) / ((perRow - 1) / 2 || 1);

        let seatNum = s + 1;
        if (form.numbering_direction === 'right-to-left') seatNum = perRow - s;

        result.push({ x: xBase, y: yPos + yCurve, row: rowLabel, num: seatNum });
      }
      if (/^\d+$/.test(rowLabel)) {
        rowLabel = String(Number(rowLabel) + 1);
      } else {
        const code = rowLabel.charCodeAt(0);
        rowLabel = code < 90 ? String.fromCharCode(code + 1) : 'AA';
      }
    }
    return result;
  }, [form.rows, form.seats_per_row, form.row_spacing, form.seat_spacing, form.row_curve, form.numbering_direction, form.start_row_label]);

  if (seats.length === 0) return <div className="bg-slate-900 rounded-lg h-80 flex items-center justify-center text-slate-500">Geen stoelen</div>;

  const xs = seats.map((s) => s.x);
  const ys = seats.map((s) => s.y);
  const minX = Math.min(...xs) - 20;
  const maxX = Math.max(...xs) + 20;
  const minY = Math.min(...ys) - 20;
  const maxY = Math.max(...ys) + 20;
  const vw = maxX - minX;
  const vh = maxY - minY;

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden" style={{ height: 'calc(100% - 24px)', minHeight: '300px' }}>
      <svg viewBox={`${minX} ${minY} ${vw} ${vh}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {seats.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={Math.min(form.seat_spacing, form.row_spacing) * 0.3}
            fill={form.color} opacity={0.85} />
        ))}
        {(() => {
          const rowLabels = new Map<string, number>();
          seats.forEach((s) => {
            if (!rowLabels.has(s.row)) rowLabels.set(s.row, s.y);
          });
          return Array.from(rowLabels).map(([label, y]) => (
            <text key={label} x={minX + 5} y={y} fill="#94a3b8" fontSize={Math.max(8, form.row_spacing * 0.35)}
              dominantBaseline="middle" className="pointer-events-none">
              {label}
            </text>
          ));
        })()}
      </svg>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20";
const labelCls = "block text-slate-400 text-xs font-medium mb-1.5";
