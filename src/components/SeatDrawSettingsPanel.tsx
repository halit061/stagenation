import { useCallback } from 'react';
import { Pencil, ChevronDown, Check } from 'lucide-react';
import type { TicketType } from '../types/seats';

export type DrawSeatType = 'regular' | 'vip' | 'wheelchair' | 'restricted_view';

export interface SeatDrawSettings {
  sectionId: string | null;
  rowLabel: string;
  startNumber: number;
  seatSpacing: number;
  seatType: DrawSeatType;
  ticketTypeId: string | null;
}

interface SeatDrawSettingsPanelProps {
  settings: SeatDrawSettings;
  onChange: (settings: SeatDrawSettings) => void;
  placedCount: number;
  onDeactivate: () => void;
  ticketTypes?: TicketType[];
}

const SEAT_TYPE_OPTIONS: { value: DrawSeatType; label: string }[] = [
  { value: 'regular', label: 'Regulier' },
  { value: 'vip', label: 'VIP' },
  { value: 'wheelchair', label: 'Rolstoel' },
  { value: 'restricted_view', label: 'Beperkt Zicht' },
];

export function SeatDrawSettingsPanel({
  settings,
  onChange,
  placedCount,
  onDeactivate,
  ticketTypes,
}: SeatDrawSettingsPanelProps) {
  const update = useCallback(
    (patch: Partial<SeatDrawSettings>) => onChange({ ...settings, ...patch }),
    [settings, onChange],
  );

  const activeTicketType = ticketTypes?.find(t => t.id === settings.ticketTypeId) ?? null;

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Stoel Teken Instellingen</h3>
        </div>
        <button
          onClick={onDeactivate}
          className="text-[10px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        >
          Stop
        </button>
      </div>

      <p className="text-[10px] text-slate-400">Klik op de canvas om stoelen te plaatsen. Sleep voor een rij.</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Rij Label</label>
          <input
            type="text"
            value={settings.rowLabel}
            onChange={(e) => update({ rowLabel: e.target.value })}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white"
            placeholder="A"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Start Nr.</label>
          <input
            type="number"
            min={1}
            value={settings.startNumber}
            onChange={(e) => update({ startNumber: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center justify-between mb-1">
          <span>Stoel Afstand</span>
          <span className="text-slate-300">{settings.seatSpacing}px</span>
        </label>
        <input
          type="range"
          min={10}
          max={50}
          value={settings.seatSpacing}
          onChange={(e) => update({ seatSpacing: parseInt(e.target.value) })}
          className="w-full accent-emerald-500 h-1"
        />
      </div>

      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Stoel Type</label>
        <div className="relative">
          <select
            value={settings.seatType}
            onChange={(e) => update({ seatType: e.target.value as DrawSeatType })}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white appearance-none pr-7"
          >
            {SEAT_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {ticketTypes && ticketTypes.length > 0 && (
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Ticket Type</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => update({ ticketTypeId: null })}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-all ${
                !settings.ticketTypeId
                  ? 'bg-slate-600 text-white ring-2 ring-white/40'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-slate-500 flex-shrink-0" />
              Geen
              {!settings.ticketTypeId && <Check className="w-3 h-3" />}
            </button>
            {ticketTypes.map(tt => {
              const isActive = settings.ticketTypeId === tt.id;
              const color = tt.color || '#6b7280';
              return (
                <button
                  key={tt.id}
                  onClick={() => update({ ticketTypeId: tt.id })}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-all ${
                    isActive
                      ? 'bg-slate-600 text-white ring-2 ring-white/40'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate max-w-[80px]">{tt.name}</span>
                  <span className="text-slate-500">{(tt.price / 100).toFixed(0)}</span>
                  {isActive && <Check className="w-3 h-3 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          {activeTicketType && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: activeTicketType.color || '#6b7280' }}
              />
              Pen kleur: {activeTicketType.name}
            </div>
          )}
        </div>
      )}

      {placedCount > 0 && (
        <div className="bg-emerald-900/30 border border-emerald-800/50 rounded px-3 py-2">
          <p className="text-xs text-emerald-300 font-medium">
            Rij {settings.rowLabel}: {placedCount} stoelen geplaatst
          </p>
        </div>
      )}

      <div className="border-t border-slate-700 pt-3 space-y-1">
        <p className="text-[10px] text-slate-500">Sneltoetsen:</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
          <span>Escape</span><span className="text-slate-500">Stop tekenen</span>
          <span>Enter</span><span className="text-slate-500">Volgende rij</span>
          <span>Delete</span><span className="text-slate-500">Undo laatste</span>
          <span>+ / -</span><span className="text-slate-500">Afstand +/-</span>
        </div>
      </div>
    </div>
  );
}
