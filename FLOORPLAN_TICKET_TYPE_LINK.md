# FLOORPLAN_TICKET_TYPE_LINK — Hoe wordt ticket_type aan seats gekoppeld?

> Read-only analyse. Geen bestanden gewijzigd.

---

## 1. Floorplan Editor admin componenten

| Bestand | Rol |
|---|---|
| `src/components/FloorPlanEditor.tsx` | Hoofdcomponent voor de seat-/floorplan-editor (admin). Beheert layout, sections en seats, en laadt ticket-koppelingen via `getAllTicketTypeSectionsForEvent`. |
| `src/components/SectionConfigModal.tsx` | Modal om een sectie aan te maken/bewerken. Bevat de checkbox-lijst "Gekoppelde Ticket Types" (`ticket_type_sections`). |
| `src/components/SeatDrawSettingsPanel.tsx` | Panel waar de admin het te gebruiken `ticketTypeId` kiest tijdens het tekenen van losse stoelen. |
| `src/hooks/useSeatDraw.ts` | Hook die het tekenen uitvoert: maakt seat-rijen aan en zet daarbij `seats.ticket_type_id`. |
| `src/services/seatService.ts` | Backend-helpers, o.a. `linkTicketTypeToSections`, `getAllTicketTypeSectionsForEvent`. |

---

## 2. Hoe wordt het ticket_type toegewezen?

Er zijn **twee parallelle mechanismen** in deze codebase. Beide bestaan náást elkaar.

### Mechanisme A — direct op `seats.ticket_type_id` (bij het tékenen)

Wanneer de admin in de "Seat Draw" modus stoelen tekent, leest `useSeatDraw` het geselecteerde `ticketTypeId` uit de draw-settings en zet dit direct op elke nieuwe `seats`-rij.

`src/hooks/useSeatDraw.ts:124-155` (single seat insert):

```ts
const insertSeatToDb = useCallback(
  async (
    sectionId: string,
    rowLabel: string,
    seatNumber: number,
    relX: number,
    relY: number,
    seatType: DrawSeatType,
    ticketTypeId: string | null,
  ): Promise<Seat | null> => {
    const row: Record<string, unknown> = {
      section_id: sectionId,
      row_label: rowLabel,
      seat_number: seatNumber,
      x_position: relX,
      y_position: relY,
      status: 'available',
      seat_type: seatType,
      is_active: true,
    };
    if (ticketTypeId) row.ticket_type_id = ticketTypeId;
    const { data, error } = await supabase
      .from('seats')
      .insert(row)
      .select()
      .single();
    ...
  },
  [showToast],
);
```

`src/hooks/useSeatDraw.ts:236-248` (line/batch insert — zelfde pattern):

```ts
const row: Record<string, unknown> = {
  section_id: sectionId,
  row_label: settings.rowLabel,
  seat_number: seatNum,
  x_position: cx,
  y_position: cy,
  status: 'available',
  seat_type: settings.seatType,
  is_active: true,
};
if (settings.ticketTypeId) row.ticket_type_id = settings.ticketTypeId;
newSeats.push(row);
```

→ **`seats.ticket_type_id` wordt rechtstreeks gezet bij het tekenen, voor zover de admin een `ticketTypeId` heeft ingesteld in `SeatDrawSettingsPanel`.** Wordt geen ticket_type gekozen tijdens het tekenen, dan blijft het veld `NULL`.

### Mechanisme B — via koppeltabel `ticket_type_sections` (op sectieniveau)

In `SectionConfigModal` kruist de admin per sectie aan welke ticket types hierop van toepassing zijn. Dit wordt opgeslagen in een aparte koppeltabel **`ticket_type_sections`** — niet als kolom op `seat_sections`.

`src/components/SectionConfigModal.tsx:307-340` (UI):

```tsx
{isEventMode && editMode && (
  <div className="border-t border-slate-700 pt-4">
    <label className={labelCls}>
      <span className="flex items-center gap-1.5">
        <Ticket className="w-3.5 h-3.5" />
        Gekoppelde Ticket Types
      </span>
    </label>
    {ticketTypes.map(tt => (
      <label ...>
        <input
          type="checkbox"
          checked={selectedTtIds.has(tt.id)}
          onChange={() => toggleTicketType(tt.id)}
          ...
        />
        <span>{tt.name}</span>
        <span>€{(tt.price / 100).toFixed(2)}</span>
      </label>
    ))}
```

`src/services/seatService.ts:946-967` (persisteren):

```ts
export async function linkTicketTypeToSections(
  ticketTypeId: string,
  sectionIds: string[],
): Promise<void> {
  await requireAuth();
  const { error: delErr } = await supabase
    .from('ticket_type_sections')
    .delete()
    .eq('ticket_type_id', ticketTypeId);
  if (delErr) throw delErr;

  if (sectionIds.length === 0) return;

  const rows = sectionIds.map(section_id => ({
    ticket_type_id: ticketTypeId,
    section_id,
  }));
  const { error } = await supabase
    .from('ticket_type_sections')
    .insert(rows);
  if (error) throw error;
}
```

`src/components/FloorPlanEditor.tsx:678-689` (laden):

```ts
const links = await getAllTicketTypeSectionsForEvent(eventId);
const linkMap: Record<string, string[]> = {};
for (const link of links) {
  if (!linkMap[link.section_id]) linkMap[link.section_id] = [];
  linkMap[link.section_id].push(link.ticket_type_id);
}
setSectionTicketLinks(linkMap);
```

### Belangrijk: er is **géén** join `seat_sections.ticket_type_id`

De koppeling op sectieniveau staat **niet** als kolom op `seat_sections`, maar in de aparte koppeltabel `ticket_type_sections`. Mechanisme B propageert **ook niet** automatisch naar `seats.ticket_type_id`. Er is geen trigger/RPC die alle stoelen in een sectie bijwerkt zodra een ticket_type aan die sectie wordt gekoppeld.

### Samenvatting koppelpaden

| Pad | Bron | Effect op `seats.ticket_type_id`? | Waar gebruikt? |
|---|---|---|---|
| A — bij tekenen | `seats.ticket_type_id` direct | Ja, per stoel gezet bij INSERT | Frontend prijslogica `SeatCheckout.tsx:347-379`, `seats.ticket_type_id` (Studio100 — 3345/3363 stoelen ingevuld) |
| B — via section-modal | `ticket_type_sections` koppeltabel | Nee, niet gepropageerd | Frontend fallback (`sectionTicketPrices`), service-fee fetch in `seatCheckoutService.fetchServiceFeeForSections`. Voor Studio100: tabel **leeg**. |

Voor het Studio100 productie-event (zie `PRICE_SOURCE_ANALYSIS.md`) is mechanisme A actief en werkt mechanisme B niet (`ticket_type_sections` is leeg) — dus de prijs wordt enkel gevonden via `seats.ticket_type_id`.

---

## 3. Database kolommen

```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('seats','seat_sections')
AND column_name LIKE '%ticket%';
```

| table_name | column_name |
|---|---|
| `seats` | `ticket_type_id` |

→ **`seats` heeft een `ticket_type_id` kolom. `seat_sections` heeft géén ticket-gerelateerde kolom.**

De koppeling op sectieniveau wordt dus uitsluitend via de aparte koppeltabel `ticket_type_sections` (kolommen `ticket_type_id`, `section_id`) opgeslagen.

---

## Conclusie

- **Floorplan editor**: `src/components/FloorPlanEditor.tsx` (+ `SectionConfigModal`, `SeatDrawSettingsPanel`, `useSeatDraw`).
- **Seat-niveau koppeling** (`seats.ticket_type_id`) gebeurt **bij het tekenen** in `useSeatDraw.ts`, en alleen als de admin actief een `ticketTypeId` heeft gekozen in de draw-settings.
- **Sectie-niveau koppeling** gebeurt via koppeltabel **`ticket_type_sections`** (niet via een kolom op `seat_sections`). Deze koppeling wordt **niet** doorgezet naar `seats.ticket_type_id` — er is geen sync/trigger.
- **DB**: alleen `seats.ticket_type_id` bestaat als ticket-kolom op deze twee tabellen; `seat_sections` heeft géén `ticket_type_id`.
