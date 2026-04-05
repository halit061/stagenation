import { useMemo } from 'react';
import type { Seat, SeatSection, SeatStatus } from '../types/seats';
import { SeatChair } from './SeatIcon';

interface Props {
  sectionSeats: Record<string, Seat[]>;
  sections: SeatSection[];
  selectedSectionId: string | null;
}

const STATUS_COLOR: Record<SeatStatus, string> = {
  available: '#22c55e',
  blocked: '#4b5563',
  reserved: '#f59e0b',
  sold: '#ef4444',
};

export function SeatLegend({ sectionSeats, sections, selectedSectionId }: Props) {
  const stats = useMemo(() => {
    let seats: Seat[] = [];
    if (selectedSectionId) {
      seats = sectionSeats[selectedSectionId] || [];
    } else {
      for (const s of sections) {
        seats = seats.concat(sectionSeats[s.id] || []);
      }
    }
    const total = seats.length;
    const available = seats.filter(s => s.status === 'available').length;
    const blocked = seats.filter(s => s.status === 'blocked').length;
    const reserved = seats.filter(s => s.status === 'reserved').length;
    const sold = seats.filter(s => s.status === 'sold').length;
    return { total, available, blocked, reserved, sold };
  }, [sectionSeats, sections, selectedSectionId]);

  const pctAvailable = stats.total > 0 ? (stats.available / stats.total) * 100 : 0;
  const pctReserved = stats.total > 0 ? (stats.reserved / stats.total) * 100 : 0;
  const pctSold = stats.total > 0 ? (stats.sold / stats.total) * 100 : 0;
  const pctBlocked = stats.total > 0 ? (stats.blocked / stats.total) * 100 : 0;

  return (
    <div className="bg-slate-800 rounded-lg p-3 space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wider">Legenda</p>
        <div className="space-y-1.5">
          <LegendItem color="#22c55e" label="Beschikbaar" />
          <LegendItem color="#eab308" label="VIP" />
          <LegendItem color="#22c55e" label="Rolstoel" symbol="wheelchair" />
          <LegendItem color="#22c55e" label="Beperkt Zicht" symbol="slash" />
          <LegendItem color="#4b5563" label="Geblokkeerd" />
          <LegendItem color="#f59e0b" label="Gereserveerd" />
          <LegendItem color="#ef4444" label="Verkocht" />
          <LegendItem color="#22c55e" label="Geselecteerd" selected />
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <p className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wider">
          Overzicht {selectedSectionId ? '(Sectie)' : '(Totaal)'}
        </p>

        <div className="space-y-1.5 text-xs">
          <StatRow label="Totaal" count={stats.total} color="#94a3b8" />
          <StatRow label="Beschikbaar" count={stats.available} color={STATUS_COLOR.available} />
          <StatRow label="Geblokkeerd" count={stats.blocked} color={STATUS_COLOR.blocked} />
          <StatRow label="Gereserveerd" count={stats.reserved} color={STATUS_COLOR.reserved} />
          <StatRow label="Verkocht" count={stats.sold} color={STATUS_COLOR.sold} />
        </div>

        {stats.total > 0 && (
          <div className="mt-3">
            <div className="h-2.5 rounded-full overflow-hidden bg-slate-700 flex">
              {pctAvailable > 0 && (
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${pctAvailable}%`, backgroundColor: STATUS_COLOR.available }}
                />
              )}
              {pctReserved > 0 && (
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${pctReserved}%`, backgroundColor: STATUS_COLOR.reserved }}
                />
              )}
              {pctSold > 0 && (
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${pctSold}%`, backgroundColor: STATUS_COLOR.sold }}
                />
              )}
              {pctBlocked > 0 && (
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${pctBlocked}%`, backgroundColor: STATUS_COLOR.blocked }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-slate-500">
              <span>{Math.round(pctAvailable)}% vrij</span>
              <span>{Math.round(pctSold + pctReserved)}% bezet</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendItem({
  color,
  label,
  symbol,
  selected,
}: {
  color: string;
  label: string;
  symbol?: 'wheelchair' | 'slash';
  selected?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-shrink-0">
        <SeatChair
          color={color}
          size={14}
          selected={selected}
          opacity={color === '#4b5563' ? 0.5 : 0.9}
          glowColor={selected ? '#ffffff' : undefined}
        />
        {symbol === 'wheelchair' && (
          <svg width="14" height="14" viewBox="0 0 14 14" className="absolute inset-0">
            <circle cx="7" cy="8" r="2" fill="none" stroke="white" strokeWidth="0.6" />
            <line x1="7" y1="4.5" x2="7" y2="7.5" stroke="white" strokeWidth="0.6" />
          </svg>
        )}
        {symbol === 'slash' && (
          <svg width="14" height="14" viewBox="0 0 14 14" className="absolute inset-0">
            <line x1="4.5" y1="9.5" x2="9.5" y2="4.5" stroke="white" strokeWidth="0.8" />
          </svg>
        )}
      </div>
      <span className="text-xs text-slate-300">{label}</span>
    </div>
  );
}

function StatRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-slate-300">{label}</span>
      </div>
      <span className="text-white font-semibold tabular-nums">{count}</span>
    </div>
  );
}
