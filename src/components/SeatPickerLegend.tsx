interface Props {
  compact?: boolean;
}

const items = [
  { color: '#22c55e', label: 'Beschikbaar' },
  { color: '#3b82f6', label: 'Jouw selectie' },
  { color: '#eab308', label: 'VIP', hasRing: true },
  { color: '#4b5563', label: 'Niet beschikbaar' },
];

export function SeatPickerLegend({ compact }: Props) {
  return (
    <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4'} flex-wrap`}>
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className="relative">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: item.color,
                opacity: item.color === '#4b5563' ? 0.5 : 0.9,
                boxShadow: item.label === 'Jouw selectie'
                  ? '0 0 0 1.5px #ffffff, 0 0 6px rgba(59,130,246,0.4)'
                  : item.hasRing
                  ? '0 0 0 1px #fbbf24'
                  : undefined,
              }}
            />
          </div>
          <span className="text-xs text-slate-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
