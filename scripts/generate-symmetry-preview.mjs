import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SUPABASE_URL = 'https://sbukyajfeqjkloeyjieh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNidWt5YWpmZXFqa2xvZXlqaWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTkyMDQsImV4cCI6MjA4ODgzNTIwNH0.S-JuzqkoVzUpTwLp45IK9nRXdSBm5d-1jgVD8v0RbMQ';
const EVENT_ID = '1725edd5-4704-4633-a6f7-f21d91831147';
const MIDLINE_X = 4440;

const OFFSETS = {
  'Plein Achteraan': { dx: -86, dy: 0, color: '#3b82f6' },
  'Premium Seats Plein': { dx: 1.5, dy: 0, color: '#f59e0b' },
  'Zitplaatsen Plein': { dx: 80, dy: 0, color: '#10b981' },
  'Rolstoel + Begeleider (1+1)': { dx: 3, dy: 0, color: '#06b6d4' },
  'Tribune Kabouter Plop': { dx: -13.5, dy: -7, color: '#ec4899' },
  'Tribune Spotz-On': { dx: -13.5, dy: 7, color: '#ec4899' },
  'Tribune Maya De Bij': { dx: -28, dy: -5.5, color: '#84cc16' },
  'Tribune Samson & Marie': { dx: -28, dy: 5.5, color: '#84cc16' },
};

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

  for (const s of allSeats) {
    const ttName = ttMap.get(s.ticket_type_id) || 'unknown';
    const off = OFFSETS[ttName];
    if (!off) continue;
    groupCounts.set(ttName, (groupCounts.get(ttName) || 0) + 1);

    const cx = s.x_position;
    const cy = s.y_position;
    const nx = cx + off.dx;
    const ny = cy + off.dy;

    beforeCircles.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="14" fill="#9ca3af" fill-opacity="0.55"/>`);
    afterCircles.push(`<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="11" fill="${off.color}" fill-opacity="0.85"/>`);
  }

  const legendItems = Object.entries(OFFSETS)
    .map(([name, o], i) => {
      const y = 60 + i * 110;
      const count = groupCounts.get(name) || 0;
      return `
        <g transform="translate(60,${y})">
          <rect width="40" height="40" rx="6" fill="${o.color}" fill-opacity="0.85"/>
          <text x="60" y="20" font-size="36" font-family="system-ui, sans-serif" fill="#111">${name}</text>
          <text x="60" y="60" font-size="26" font-family="system-ui, sans-serif" fill="#555">${count} stoelen   dx=${o.dx}   dy=${o.dy}</text>
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
