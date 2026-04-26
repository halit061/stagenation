import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SUPABASE_URL = 'https://sbukyajfeqjkloeyjieh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNidWt5YWpmZXFqa2xvZXlqaWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTkyMDQsImV4cCI6MjA4ODgzNTIwNH0.S-JuzqkoVzUpTwLp45IK9nRXdSBm5d-1jgVD8v0RbMQ';
const EVENT_ID = '1725edd5-4704-4633-a6f7-f21d91831147';
const MIDLINE_X = 4440;

const LEFT_OUTER = 3477.27;
const LEFT_INNER = 4313.64;
const RIGHT_INNER = 4564.54;
const RIGHT_OUTER = 5399.09;

const PLEIN_GROUPS = new Set([
  'Plein Achteraan',
  'Premium Seats Plein',
  'Zitplaatsen Plein',
  'Rolstoel + Begeleider (1+1)',
]);

const TRIBUNE_OFFSETS = {
  'Tribune Kabouter Plop': { dx: -13.5, dy: -7 },
  'Tribune Spotz-On': { dx: -13.5, dy: 7 },
  'Tribune Maya De Bij': { dx: 172, dy: -5.5 },
  'Tribune Samson & Marie': { dx: -228, dy: 5.5 },
};

const ROW_TOLERANCE = 8;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

async function main() {
  const { data: ticketTypes, error: ttErr } = await supabase
    .from('ticket_types')
    .select('id, name, color')
    .eq('event_id', EVENT_ID);
  if (ttErr) throw ttErr;

  const ttMap = new Map(ticketTypes.map((t) => [t.id, t.name]));
  const colorMap = new Map(ticketTypes.map((t) => [t.name, t.color || '#666']));
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

  // Group plein seats by Y bucket within each group, separated into L/R sides
  const rowSideKey = (ttName, y, side) =>
    `${ttName}|${Math.round(y / ROW_TOLERANCE)}|${side}`;

  const sideBuckets = new Map();
  for (const s of allSeats) {
    const ttName = ttMap.get(s.ticket_type_id);
    if (!ttName || !PLEIN_GROUPS.has(ttName)) continue;
    const side = s.x_position < MIDLINE_X ? 'L' : 'R';
    const key = rowSideKey(ttName, s.y_position, side);
    if (!sideBuckets.has(key)) sideBuckets.set(key, []);
    sideBuckets.get(key).push(s);
  }

  // For each (group, row, side) compute dx that snaps the OUTER seat to AA outer line
  const seatDx = new Map();
  for (const [key, seats] of sideBuckets) {
    const side = key.endsWith('|L') ? 'L' : 'R';
    if (side === 'L') {
      const minX = Math.min(...seats.map((s) => s.x_position));
      const dx = LEFT_OUTER - minX;
      for (const s of seats) seatDx.set(s.id, dx);
    } else {
      const maxX = Math.max(...seats.map((s) => s.x_position));
      const dx = RIGHT_OUTER - maxX;
      for (const s of seats) seatDx.set(s.id, dx);
    }
  }

  const W = 9000;
  const H = 4500;
  const PAD = 200;

  const groupCounts = new Map();
  const beforeCircles = [];
  const afterCircles = [];

  for (const s of allSeats) {
    const ttName = ttMap.get(s.ticket_type_id) || 'unknown';
    let dx = 0;
    let dy = 0;
    let color = colorMap.get(ttName) || '#666';

    if (PLEIN_GROUPS.has(ttName)) {
      dx = seatDx.get(s.id) ?? 0;
    } else if (TRIBUNE_OFFSETS[ttName]) {
      dx = TRIBUNE_OFFSETS[ttName].dx;
      dy = TRIBUNE_OFFSETS[ttName].dy;
    } else {
      continue;
    }

    groupCounts.set(ttName, (groupCounts.get(ttName) || 0) + 1);

    const cx = s.x_position;
    const cy = s.y_position;
    const nx = cx + dx;
    const ny = cy + dy;

    beforeCircles.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="14" fill="#9ca3af" fill-opacity="0.45"/>`);
    afterCircles.push(`<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="11" fill="${color}" fill-opacity="0.9"/>`);
  }

  const legendEntries = [
    ...[...PLEIN_GROUPS].map((name) => ({
      name,
      color: colorMap.get(name) || '#666',
      dxLabel: 'per rij naar AA1/AA36 lijn',
      dy: 0,
    })),
    ...Object.entries(TRIBUNE_OFFSETS).map(([name, o]) => ({
      name,
      color: colorMap.get(name) || '#666',
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
          <rect width="40" height="40" rx="6" fill="${e.color}" fill-opacity="0.9"/>
          <text x="60" y="20" font-size="36" font-family="system-ui, sans-serif" fill="#111">${e.name}</text>
          <text x="60" y="60" font-size="26" font-family="system-ui, sans-serif" fill="#555">${count} stoelen   ${e.dxLabel}   dy=${e.dy}</text>
        </g>`;
    })
    .join('\n');

  const refLines = `
    <line x1="${LEFT_OUTER}" y1="0" x2="${LEFT_OUTER}" y2="${H}" stroke="#10b981" stroke-width="3" stroke-dasharray="20 15"/>
    <line x1="${LEFT_INNER}" y1="0" x2="${LEFT_INNER}" y2="${H}" stroke="#10b981" stroke-width="2" stroke-dasharray="10 10" opacity="0.5"/>
    <line x1="${RIGHT_INNER}" y1="0" x2="${RIGHT_INNER}" y2="${H}" stroke="#10b981" stroke-width="2" stroke-dasharray="10 10" opacity="0.5"/>
    <line x1="${RIGHT_OUTER}" y1="0" x2="${RIGHT_OUTER}" y2="${H}" stroke="#10b981" stroke-width="3" stroke-dasharray="20 15"/>
    <text x="${LEFT_OUTER}" y="${H - 40}" font-size="36" font-family="system-ui, sans-serif" fill="#10b981" text-anchor="middle">AA1</text>
    <text x="${LEFT_INNER}" y="${H - 40}" font-size="32" font-family="system-ui, sans-serif" fill="#10b981" text-anchor="middle" opacity="0.7">AA18</text>
    <text x="${RIGHT_INNER}" y="${H - 40}" font-size="32" font-family="system-ui, sans-serif" fill="#10b981" text-anchor="middle" opacity="0.7">AA19</text>
    <text x="${RIGHT_OUTER}" y="${H - 40}" font-size="36" font-family="system-ui, sans-serif" fill="#10b981" text-anchor="middle">AA36</text>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2 + 1100}" style="background:#f9fafb">
  <defs>
    <pattern id="grid" width="500" height="500" patternUnits="userSpaceOnUse">
      <path d="M 500 0 L 0 0 0 500" fill="none" stroke="#e5e7eb" stroke-width="2"/>
    </pattern>
  </defs>

  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#grid)" stroke="#d1d5db" stroke-width="4"/>

  <text x="${W / 2}" y="-80" font-size="72" font-weight="700" font-family="system-ui, sans-serif" fill="#111" text-anchor="middle">Symmetry Preview - Stagenation Floorplan</text>
  <text x="${W / 2}" y="-20" font-size="40" font-family="system-ui, sans-serif" fill="#6b7280" text-anchor="middle">Grijs = huidig, kleur = voorgesteld. Groene lijnen = AA1/AA18/AA19/AA36 referentie.</text>

  <line x1="${MIDLINE_X}" y1="0" x2="${MIDLINE_X}" y2="${H}" stroke="#ef4444" stroke-width="6" stroke-dasharray="30 20"/>
  <text x="${MIDLINE_X + 30}" y="120" font-size="48" font-family="system-ui, sans-serif" fill="#ef4444" font-weight="700">Middenas X=${MIDLINE_X}</text>

  ${refLines}

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
