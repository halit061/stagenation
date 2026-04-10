import { useState, useMemo, useEffect } from 'react';
import { X, Rows3, Grid3x3, Plus, Ticket, Loader2 } from 'lucide-react';
import type { NumberingDirection, RowLabelDirection, SeatOrientation, TicketType } from '../types/seats';
import { linkTicketTypeToSections, createTicketType } from '../services/seatService';
import {
  sanitizeText,
  validateSectionName,
  validateRows,
  validateSeatsPerRow,
  validatePrice,
  validatePriceCategory,
} from '../lib/validation';
import { SvgSeatDotChair } from './SeatIcon';

import { SECTION_COLORS, COLOR_CATEGORIES, getColorName } from '../config/sectionColors';

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
  row_label_direction: RowLabelDirection;
  orientation: SeatOrientation;
  rotation: number;
}

interface SectionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SectionFormData) => void;
  initialData?: Partial<SectionFormData>;
  editMode?: boolean;
  loading?: boolean;
  eventId?: string | null;
  ticketTypes?: TicketType[];
  linkedTicketTypeIds?: string[];
  onTicketTypesChange?: (ttIds: string[]) => void;
  onTicketTypesRefresh?: () => void;
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
    row_label_direction: 'top-to-bottom',
    orientation: 'top',
    rotation: 0,
  };
}

const ORIENTATION_OPTIONS: { value: SeatOrientation; label: string; desc: string; presetDeg: number }[] = [
  { value: 'top', label: 'Boven', desc: 'Podium is boven', presetDeg: 0 },
  { value: 'bottom', label: 'Beneden', desc: 'Podium is onder', presetDeg: 180 },
  { value: 'left', label: 'Links', desc: 'Podium is links', presetDeg: 270 },
  { value: 'right', label: 'Rechts', desc: 'Podium is rechts', presetDeg: 90 },
];

export function SectionConfigModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  editMode = false,
  loading = false,
  eventId,
  ticketTypes = [],
  linkedTicketTypeIds = [],
  onTicketTypesChange,
  onTicketTypesRefresh,
}: SectionConfigModalProps) {
  const [form, setForm] = useState<SectionFormData>(() => ({
    ...defaultForm(initialData?.section_type ?? 'tribune'),
    ...initialData,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedTtIds, setSelectedTtIds] = useState<Set<string>>(new Set(linkedTicketTypeIds));
  const [showNewTt, setShowNewTt] = useState(false);
  const [newTtName, setNewTtName] = useState('');
  const [newTtPrice, setNewTtPrice] = useState('');
  const [creatingTt, setCreatingTt] = useState(false);

  const isEventMode = !!eventId;

  useEffect(() => {
    if (isOpen) {
      setForm({
        ...defaultForm(initialData?.section_type ?? 'tribune'),
        ...initialData,
      });
      setErrors({});
      setSelectedTtIds(new Set(linkedTicketTypeIds));
      setShowNewTt(false);
      setNewTtName('');
      setNewTtPrice('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function update<K extends keyof SectionFormData>(key: K, val: SectionFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function setOrientation(o: SeatOrientation) {
    const preset = ORIENTATION_OPTIONS.find(opt => opt.value === o);
    setForm(prev => ({ ...prev, orientation: o, rotation: preset?.presetDeg ?? 0 }));
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

  function toggleTicketType(ttId: string) {
    setSelectedTtIds(prev => {
      const next = new Set(prev);
      if (next.has(ttId)) next.delete(ttId);
      else next.add(ttId);
      return next;
    });
  }

  async function handleCreateTicketType() {
    if (!eventId || !newTtName.trim()) return;
    setCreatingTt(true);
    try {
      const priceCents = Math.round(parseFloat(newTtPrice || '0') * 100);
      const created = await createTicketType({
        event_id: eventId,
        name: sanitizeText(newTtName),
        price: priceCents,
      });
      setSelectedTtIds(prev => new Set([...prev, created.id]));
      setNewTtName('');
      setNewTtPrice('');
      setShowNewTt(false);
      onTicketTypesRefresh?.();
    } catch {
      // silent
    }
    setCreatingTt(false);
  }

  function handleSubmit() {
    if (!validate()) return;
    if (isEventMode && onTicketTypesChange) {
      onTicketTypesChange([...selectedTtIds]);
    }
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
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg border-2 border-white/30" style={{ backgroundColor: form.color }} />
                <span className="text-sm text-slate-300">{getColorName(form.color)}</span>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => update('color', e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 ml-auto"
                  title="Kies een eigen kleur"
                />
              </div>
              <div className="space-y-2">
                {COLOR_CATEGORIES.map((cat) => (
                  <div key={cat.key}>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{cat.label}</span>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {SECTION_COLORS.filter(c => c.category === cat.key).map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => update('color', c.hex)}
                          title={c.name}
                          className={`w-7 h-7 rounded-md border-2 transition-all ${
                            form.color.toLowerCase() === c.hex.toLowerCase()
                              ? 'border-white scale-110 ring-1 ring-white/40'
                              : 'border-transparent hover:scale-105 hover:border-white/30'
                          }`}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
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

            {isEventMode && editMode && (
              <div className="border-t border-slate-700 pt-4">
                <label className={labelCls}>
                  <span className="flex items-center gap-1.5">
                    <Ticket className="w-3.5 h-3.5" />
                    Gekoppelde Ticket Types
                  </span>
                </label>
                {ticketTypes.length > 0 ? (
                  <div className="space-y-2">
                    {ticketTypes.map(tt => (
                      <label
                        key={tt.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          selectedTtIds.has(tt.id)
                            ? 'border-blue-500/50 bg-blue-500/10'
                            : 'border-slate-600 hover:border-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTtIds.has(tt.id)}
                          onChange={() => toggleTicketType(tt.id)}
                          className="w-4 h-4 text-blue-500 rounded border-slate-500 bg-slate-700 focus:ring-blue-500/30"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white font-medium">{tt.name}</span>
                          <span className="text-xs text-slate-400 ml-2">
                            {'\u20AC'}{(tt.price / 100).toFixed(2)}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs">Geen ticket types voor dit evenement.</p>
                )}

                {!showNewTt ? (
                  <button
                    type="button"
                    onClick={() => setShowNewTt(true)}
                    className="mt-2 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nieuw ticket type aanmaken
                  </button>
                ) : (
                  <div className="mt-2 p-3 bg-slate-900 rounded-lg border border-slate-600 space-y-2">
                    <input
                      type="text"
                      value={newTtName}
                      onChange={(e) => setNewTtName(e.target.value)}
                      placeholder="Ticket type naam"
                      maxLength={100}
                      className={inputCls}
                    />
                    <input
                      type="number"
                      value={newTtPrice}
                      onChange={(e) => setNewTtPrice(e.target.value)}
                      placeholder="Prijs in EUR (bijv. 25.00)"
                      min="0"
                      step="0.01"
                      className={inputCls}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCreateTicketType}
                        disabled={creatingTt || !newTtName.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        {creatingTt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Aanmaken
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowNewTt(false); setNewTtName(''); setNewTtPrice(''); }}
                        className="px-3 py-1.5 text-slate-400 hover:text-white text-xs border border-slate-600 rounded-lg transition-colors"
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

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

            <Field label="Rij Label Richting">
              <select value={form.row_label_direction} onChange={(e) => update('row_label_direction', e.target.value as RowLabelDirection)} className={inputCls}>
                <option value="top-to-bottom">A bovenaan (A, B, C... naar beneden)</option>
                <option value="bottom-to-top">A onderaan (A, B, C... naar boven)</option>
              </select>
            </Field>

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

            <div>
              <label className={labelCls}>Stoelen Orientatie</label>
              <div className="grid grid-cols-4 gap-2">
                {ORIENTATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOrientation(opt.value)}
                    className={`relative p-2 rounded-lg border-2 transition-all text-center ${
                      form.orientation === opt.value
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <OrientationIcon direction={opt.value} color={form.color} active={form.orientation === opt.value} />
                    <p className="text-xs text-white font-medium mt-1.5">{opt.label}</p>
                    <p className="text-[10px] text-slate-400">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <Field label={`Vrije Rotatie: ${form.rotation}°`}>
              <input type="range" min="0" max="359" step="1" value={form.rotation}
                onChange={(e) => update('rotation', parseInt(e.target.value))}
                className="w-full accent-blue-500" />
              <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                <span>0°</span><span>90°</span><span>180°</span><span>270°</span><span>359°</span>
              </div>
            </Field>
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

function OrientationIcon({ direction, color, active }: { direction: SeatOrientation; color: string; active: boolean }) {
  const arrowColor = active ? '#3b82f6' : '#94a3b8';
  const seatColor = active ? color : '#64748b';
  const rows = 3;
  const cols = 5;

  const isVertical = direction === 'left' || direction === 'right';

  return (
    <svg viewBox="0 0 48 40" className="w-full h-8">
      {!isVertical ? (
        <>
          {Array.from({ length: rows }).map((_, r) =>
            Array.from({ length: cols }).map((_, c) => {
              const rowY = direction === 'top'
                ? 12 + r * 8
                : 28 - r * 8;
              return (
                <SvgSeatDotChair
                  key={`${r}-${c}`}
                  cx={10 + c * 7}
                  cy={rowY}
                  size={4.4}
                  color={seatColor}
                  opacity={0.8}
                />
              );
            })
          )}
          <polygon
            points={direction === 'top' ? '24,2 20,8 28,8' : '24,38 20,32 28,32'}
            fill={arrowColor}
          />
        </>
      ) : (
        <>
          {Array.from({ length: rows }).map((_, r) =>
            Array.from({ length: cols }).map((_, c) => {
              const rowX = direction === 'left'
                ? 32 - r * 8
                : 16 + r * 8;
              return (
                <SvgSeatDotChair
                  key={`${r}-${c}`}
                  cx={rowX}
                  cy={8 + c * 6}
                  size={4.4}
                  color={seatColor}
                  opacity={0.8}
                />
              );
            })
          )}
          <polygon
            points={direction === 'left' ? '6,20 12,16 12,24' : '42,20 36,16 36,24'}
            fill={arrowColor}
          />
        </>
      )}
    </svg>
  );
}

function SeatPreview({ form }: { form: SectionFormData }) {
  const seats = useMemo(() => {
    const result: { x: number; y: number; row: string; num: number }[] = [];
    const rows = Math.min(form.rows, 50);
    const perRow = Math.min(form.seats_per_row, 100);
    const isVertical = form.orientation === 'left' || form.orientation === 'right';

    const rowLabels: string[] = [];
    let rl = form.start_row_label;
    for (let r = 0; r < rows; r++) {
      rowLabels.push(rl);
      if (/^\d+$/.test(rl)) {
        rl = String(Number(rl) + 1);
      } else {
        const code = rl.charCodeAt(0);
        rl = code < 90 ? String.fromCharCode(code + 1) : 'AA';
      }
    }
    if (form.row_label_direction === 'bottom-to-top') {
      rowLabels.reverse();
    }

    for (let r = 0; r < rows; r++) {
      for (let s = 0; s < perRow; s++) {
        let xPos: number;
        let yPos: number;

        if (!isVertical) {
          const centerOffset = s - (perRow - 1) / 2;
          xPos = centerOffset * form.seat_spacing;
          const baseCurve = form.row_curve * r * r * 0.5;
          const yCurve = baseCurve * Math.abs(centerOffset) / ((perRow - 1) / 2 || 1);

          if (form.orientation === 'top') {
            yPos = r * form.row_spacing + yCurve;
          } else {
            yPos = (rows - 1 - r) * form.row_spacing + yCurve;
          }
        } else {
          const centerOffset = s - (perRow - 1) / 2;
          yPos = centerOffset * form.seat_spacing;
          const baseCurve = form.row_curve * r * r * 0.5;
          const xCurve = baseCurve * Math.abs(centerOffset) / ((perRow - 1) / 2 || 1);

          if (form.orientation === 'right') {
            xPos = r * form.row_spacing + xCurve;
          } else {
            xPos = (rows - 1 - r) * form.row_spacing + xCurve;
          }
        }

        let seatNum = s + 1;
        if (form.numbering_direction === 'right-to-left') seatNum = perRow - s;

        result.push({ x: xPos, y: yPos, row: rowLabels[r], num: seatNum });
      }
    }
    return result;
  }, [form.rows, form.seats_per_row, form.row_spacing, form.seat_spacing, form.row_curve, form.numbering_direction, form.start_row_label, form.row_label_direction, form.orientation]);

  if (seats.length === 0) return <div className="bg-slate-900 rounded-lg h-80 flex items-center justify-center text-slate-500">Geen stoelen</div>;

  const xs = seats.map((s) => s.x);
  const ys = seats.map((s) => s.y);
  const minX = Math.min(...xs) - 30;
  const maxX = Math.max(...xs) + 30;
  const minY = Math.min(...ys) - 30;
  const maxY = Math.max(...ys) + 30;
  const vw = maxX - minX;
  const vh = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const isVertical = form.orientation === 'left' || form.orientation === 'right';

  const podiumLabel = (() => {
    switch (form.orientation) {
      case 'top': return { x: cx, y: minY + 8, anchor: 'middle' as const };
      case 'bottom': return { x: cx, y: maxY - 4, anchor: 'middle' as const };
      case 'left': return { x: minX + 8, y: cy, anchor: 'start' as const };
      case 'right': return { x: maxX - 8, y: cy, anchor: 'end' as const };
    }
  })();

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden" style={{ height: 'calc(100% - 24px)', minHeight: '300px' }}>
      <svg viewBox={`${minX} ${minY} ${vw} ${vh}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <g style={{ transform: `rotate(${form.rotation}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
          {seats.map((s, i) => (
            <SvgSeatDotChair key={i} cx={s.x} cy={s.y}
              size={Math.min(form.seat_spacing, form.row_spacing) * 0.55}
              color={form.color} opacity={0.85} />
          ))}
          {(() => {
            const rowLabels = new Map<string, { x: number; y: number }>();
            seats.forEach((s) => {
              if (!rowLabels.has(s.row)) {
                rowLabels.set(s.row, { x: s.x, y: s.y });
              }
            });

            return Array.from(rowLabels).map(([label, pos]) => {
              const labelX = !isVertical ? minX + 15 : pos.x;
              const labelY = !isVertical ? pos.y : minY + 15;
              return (
                <text key={label} x={labelX} y={labelY} fill="#94a3b8"
                  fontSize={Math.max(8, Math.min(form.row_spacing, form.seat_spacing) * 0.35)}
                  dominantBaseline="middle" textAnchor={!isVertical ? 'end' : 'middle'}
                  className="pointer-events-none">
                  {label}
                </text>
              );
            });
          })()}
        </g>
        <text
          x={podiumLabel.x}
          y={podiumLabel.y}
          textAnchor={podiumLabel.anchor}
          dominantBaseline="middle"
          fill="#f59e0b"
          fontSize="10"
          fontWeight="bold"
          className="pointer-events-none"
        >
          PODIUM
        </text>
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
