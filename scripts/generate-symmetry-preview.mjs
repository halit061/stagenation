import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SUPABASE_URL = 'https://sbukyajfeqjkloeyjieh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNidWt5YWpmZXFqa2xvZXlqaWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTkyMDQsImV4cCI6MjA4ODgzNTIwNH0.S-JuzqkoVzUpTwLp45IK9nRXdSBm5d-1jgVD8v0RbMQ';
const EVENT_ID = '1725edd5-4704-4633-a6f7-f21d91831147';
const MIDLINE_X = 4440;

const PLEIN_GROUPS = new Set([
  'Plein Achteraan',
  'Premium Seats Plein',
  'Zitplaatsen Plein',
  'Rolstoel + Begeleider (1+1)',
]);

const TRIBUNE_OFFSETS = {
  'Tribune Kabouter Plop': { dx: -13.5, dy: -7, color: '#ec4899' },
  'Tribune Spotz-On': { dx: -13.5, dy: 7, color: '#ec4899' },
  'Tribune Maya De Bij': { dx: -28, dy: -5.5, color: '#84cc16' },
  'Tribune Samson & Marie': { dx: -28, dy: 5.5, color: '#84cc16' },
};

const PLEIN_COLORS = {
  'Plein Achteraan': '#3b82f6',
  'Premium Seats Plein': '#f59e0b',
  'Zitplaatsen Plein': '#10b981',
  'Rolstoel + Begeleider (1+1)': '#06b6d4',
};

const ROW_TOLERANCE = 8;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

async function main() {
  const { data: ticketTypes, error: ttErr } = await supabase
    .from('ticket_types')
    .select('id, name')
    .eq('event_id', EVENT_ID);
  if (ttErr) throw ttErr;

  const ttMap = new Map(ticketTypes.map((t) => [t.id, t.name]));
  const ttIds = ticketTypes.map((t) => t.id);

  let allSeats = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('seats')
      .select('id, x_position, y_position, ticket_type_id')
      .in('ticket_type_id', ttIds)
      .eq('is_active', true)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allSeats = allSeats.concat(data);
    if (data.length < PAGE) break;
  }

  console.log(`Loaded ${allSeats.length} seats`);

  const W = 9000;
  const H = 4500;
  const PAD = 200;

  const groupCounts = new Map();
  const beforeCircles = [];
  const afterCircles = [];

  const pleinSeats = allSeats.filter((s) => {
    const n = ttMap.get(s.ticket_type_id);
    return n && PLEIN_GROUPS.has(n);
  });

  const rowBuckets = new Map();
  for (const s of pleinSeats) {
    const ttName = ttMap.get(s.ticket_type_id);
    const rowKey = `${ttName}|${Math.round(s.y_position / ROW_TOLERANCE)}`;
    if (!rowBuckets.has(rowKey)) rowBuckets.set(rowKey, []);
    rowBuckets.get(rowKey).push(s);
  }

  const seatDx = new Map();
  const rowSummary = new Map();
  for (const [rowKey, rowSeats] of rowBuckets) {
    const xs = rowSeats.map((s) => s.x_position);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const rowCenter = (minX + maxX) / 2;
    const dx = MIDLINE_X - rowCenter;
    for (const s of rowSeats) seatDx.set(s.id, dx);
    const ttName = rowKey.split('|')[0];
    if (!rowSummary.has(ttName)) rowSummary.set(ttName, []);
    rowSummary.get(ttName).push(dx);
  }

  for (const s of allSeats) {
    const ttName = ttMap.get(s.ticket_type_id) || 'unknown';
    let dx = 0;
    let dy = 0;
    let color = '#666';

    if (PLEIN_GROUPS.has(ttName)) {
      dx = seatDx.get(s.id) ?? 0;
      color = PLEIN_COLORS[ttName];
    } else if (TRIBUNE_OFFSETS[ttName]) {
      dx = TRIBUNE_OFFSETS[ttName].dx;
      dy = TRIBUNE_OFFSETS[ttName].dy;
      color = TRIBUNE_OFFSETS[ttName].color;
    } else {
      continue;
    }

    groupCounts.set(ttName, (groupCounts.get(ttName) || 0) + 1);

    const cx = s.x_position;
    const cy = s.y_position;
    const nx = cx + dx;
    const ny = cy + dy;

    beforeCircles.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="14" fill="#9ca3af" fill-opacity="0.55"/>`);
    afterCircles.push(`<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="11" fill="${color}" fill-opacity="0.85"/>`);
  }

  const legendEntries = [
    ...Object.entries(PLEIN_COLORS).map(([name, color]) => {
      const dxs = rowSummary.get(name) || [];
      const minDx = dxs.length ? Math.min(...dxs).toFixed(1) : '0';
      const maxDx = dxs.length ? Math.max(...dxs).toFixed(1) : '0';
      return { name, color, dxLabel: `per rij dx ${minDx} tot ${maxDx}`, dy: 0 };
    }),
    ...Object.entries(TRIBUNE_OFFSETS).map(([name, o]) => ({
      name,
      color: o.color,
      dxLabel: `dx=${o.dx}`,
      dy: o.dy,
    })),
  ];

  const legendItems = legendEntries
    .map((e, i) => {
      const y = 60 + i * 110;
      const count = groupCounts.get(e.name) || 0;
      return `
        <g transform="translate(60,${y})">
          <rect width="40" height="40" rx="6" fill="${e.color}" fill-opacity="0.85"/>
          <text x="60" y="20" font-size="36" font-family="system-ui, sans-serif" fill="#111">${e.name}</text>
          <text x="60" y="60" font-size="26" font-family="system-ui, sans-serif" fill="#555">${count} stoelen   ${e.dxLabel}   dy=${e.dy}</text>
        </g>`;
    })
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2 + 1100}" style="background:#f9fafb">
  <defs>
    <pattern id="grid" width="500" height="500" patternUnits="userSpaceOnUse">
      <path d="M 500 0 L 0 0 0 500" fill="none" stroke="#e5e7eb" stroke-width="2"/>
    </pattern>
  </defs>

  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#grid)" stroke="#d1d5db" stroke-width="4"/>

  <text x="${W / 2}" y="-80" font-size="72" font-weight="700" font-family="system-ui, sans-serif" fill="#111" text-anchor="middle">Symmetry Preview - Stagenation Floorplan</text>
  <text x="${W / 2}" y="-20" font-size="42" font-family="system-ui, sans-serif" fill="#6b7280" text-anchor="middle">Grijs = huidige positie, kleur = voorgestelde positie. Rode lijn = middenas X=${MIDLINE_X}</text>

  <line x1="${MIDLINE_X}" y1="0" x2="${MIDLINE_X}" y2="${H}" stroke="#ef4444" stroke-width="6" stroke-dasharray="30 20"/>
  <text x="${MIDLINE_X + 30}" y="120" font-size="48" font-family="system-ui, sans-serif" fill="#ef4444" font-weight="700">Middenas X=${MIDLINE_X}</text>

  <g id="before">
    ${beforeCircles.join('\n    ')}
  </g>

  <g id="after">
    ${afterCircles.join('\n    ')}
  </g>

  <g transform="translate(0,${H + 60})">
    <rect x="0" y="0" width="${W}" height="1000" fill="#ffffff" stroke="#d1d5db" stroke-width="3" rx="12"/>
    <text x="60" y="50" font-size="40" font-weight="700" font-family="system-ui, sans-serif" fill="#111">Legenda - voorgestelde verschuivingen per ticket-groep</text>
    ${legendItems}
  </g>
</svg>`;

  const outDir = resolve(process.cwd(), 'public');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'symmetry-preview.svg');
  writeFileSync(outPath, svg);
  console.log(`Wrote ${outPath} (${svg.length} bytes)`);
  console.log('Group counts:');
  for (const [k, v] of groupCounts) console.log(`  ${k}: ${v}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
