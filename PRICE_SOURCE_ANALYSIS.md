# PRICE_SOURCE_ANALYSIS — Welke prijsbron is leidend?

> Read-only analyse. Geen bestanden gewijzigd.

---

## VRAAG 1 — Welke prijsbron is leidend?

### a) Events

```sql
SELECT id, name FROM events ORDER BY created_at DESC LIMIT 5;
```

| id | name |
|---|---|
| `1725edd5-4704-4633-a6f7-f21d91831147` | **Studio100** |
| `c1311c72-a74e-4504-9864-e4310579c59e` | stagenation |

### b) Seats — `event_id = '1725edd5-…' (Studio100)`

> N.B.: `seats` heeft géén directe `event_id` kolom — gekoppeld via `seat_sections.layout_id → venue_layouts.event_id`.

Aggregaat over alle seats:

| count | with_override | with_ticket_type |
|---|---|---|
| **3363** | **0** | **3345** |

Voorbeeldrijen:

| row_label | seat_number | ticket_type_id | price_override | section_id |
|---|---|---|---|---|
| H | 13 | `91e1fb24-…` (Zitplaatsen Plein) | **NULL** | `bd159c0b-…` |
| H | 16 | `91e1fb24-…` | **NULL** | `bd159c0b-…` |
| OO | 27 | `91e1fb24-…` | **NULL** | `bd159c0b-…` |
| OO | 28 | `91e1fb24-…` | **NULL** | `bd159c0b-…` |

**Conclusie:** `price_override` is voor élke stoel `NULL`. `ticket_type_id` is wél ingevuld voor vrijwel alle stoelen.

### c) Seat sections

```sql
SELECT ss.id, ss.name, ss.price_amount FROM seat_sections ss
JOIN venue_layouts vl ON ss.layout_id = vl.id
WHERE vl.event_id = '1725edd5-…';
```

| id | name | price_amount |
|---|---|---|
| `bd159c0b-…` | Vrije Plaatsing | **0.00** |

**Conclusie:** maar één section, `price_amount = 0.00`.

### d) Ticket types — Studio100

| name | price (cents) | service_fee_mode | service_fee_fixed |
|---|---|---|---|
| Tribune Kabouter Plop | 3500 | fixed | 2.50 |
| Special Guest | 0 | none | 0 |
| Rolstoel + Begeleider (1+1) | 2500 | fixed | 2.50 |
| Tribune Maya De Bij | 3900 | fixed | 2.50 |
| Tribune Samson & Marie | 3900 | fixed | 2.50 |
| Premium Seats Plein | 4900 | fixed | 2.50 |
| Zitplaatsen Plein | 3500 | fixed | 2.50 |
| Plein Achteraan | 2500 | fixed | 2.50 |
| Tribune Spotz-On | 3500 | fixed | 2.50 |

> **De échte prijzen zitten dus in `ticket_types.price`** (gekoppeld via `seats.ticket_type_id`), niet in `seats.price_override` of `seat_sections.price_amount`.

### e) `ticket_type_sections`

```sql
SELECT * FROM ticket_type_sections
WHERE ticket_type_id IN (SELECT id FROM ticket_types WHERE event_id = '1725edd5-…');
```

→ **leeg (0 rijen)**. Voor Studio100 bestaat dus geen ticket_type ↔ seat_section koppeling. Toewijzing van prijs gebeurt direct via `seats.ticket_type_id`.

---

## VRAAG 2 — Frontend prijslogica

`src/pages/SeatCheckout.tsx:347-379`:

```ts
const subtotal = useMemo(() => {
  return heldSeats.reduce((total, seat) => {
    if (seat.price_override != null && seat.price_override > 0) {
      return total + seat.price_override;
    }
    if (seat.ticket_type_id && seatTicketTypePrices.has(seat.ticket_type_id)) {
      return total + seatTicketTypePrices.get(seat.ticket_type_id)!;
    }
    const section = sections.find(s => s.id === seat.sectionId);
    const sectionPrice = section ? Number(section.price_amount) : 0;
    if (sectionPrice > 0) return total + sectionPrice;
    const ttPrice = sectionTicketPrices.get(seat.sectionId) ?? 0;
    return total + ttPrice;
  }, 0);
}, [heldSeats, sections, sectionTicketPrices, seatTicketTypePrices]);

const serviceFee = feePerTicket * heldSeats.length;
const totalPrice = subtotal + serviceFee;

const seatPrices = useMemo(() => {
  return heldSeats.map(seat => {
    if (seat.price_override != null && seat.price_override > 0) {
      return seat.price_override;
    }
    if (seat.ticket_type_id && seatTicketTypePrices.has(seat.ticket_type_id)) {
      return seatTicketTypePrices.get(seat.ticket_type_id)!;
    }
    const section = sections.find(s => s.id === seat.sectionId);
    const sectionPrice = section ? Number(section.price_amount) : 0;
    if (sectionPrice > 0) return sectionPrice;
    return sectionTicketPrices.get(seat.sectionId) ?? 0;
  });
}, [heldSeats, sections, sectionTicketPrices, seatTicketTypePrices]);
```

### Gebruikte velden / tabellen

| # | Bron | Veld |
|---|---|---|
| 1 | `seats` | `price_override` |
| 2 | `ticket_types` (via `seats.ticket_type_id`) | `price` |
| 3 | `seat_sections` | `price_amount` |
| 4 | `ticket_types` (via `ticket_type_sections.section_id`) | `price` |

### Fallback-volgorde (eerste hit wint)

1. `seats.price_override` (indien > 0)
2. `ticket_types.price` (via `seats.ticket_type_id`)
3. `seat_sections.price_amount` (indien > 0)
4. `ticket_types.price` (via `ticket_type_sections.section_id`)
5. anders `0`

---

## VRAAG 3 — Service fee

### Frontend bron: `src/services/seatCheckoutService.ts:112-152`

```ts
export async function fetchServiceFeeForSections(sectionIds: string[], eventId: string) {
  const { data: ttSections } = await supabase
    .from('ticket_type_sections').select('ticket_type_id').in('section_id', sectionIds);
  ...
  const { data: ticketTypes } = await supabase
    .from('ticket_types')
    .select('service_fee_mode, service_fee_fixed, service_fee_percent, price')
    .in('id', ticketTypeIds).eq('event_id', eventId).limit(1);

  const tt = ticketTypes[0];
  const mode = tt.service_fee_mode || 'none';

  if (mode === 'fixed')   return { feePerTicket: Number(tt.service_fee_fixed) || 0, feeMode: 'fixed' };
  if (mode === 'percent') return { feePerTicket: Math.round(price * pct / 100) / 100, feeMode: 'percent' };
  return { feePerTicket: 0, feeMode: 'none' };
}
```

In `SeatCheckout.tsx:363`:

```ts
const serviceFee = feePerTicket * heldSeats.length;
```

### Karakteristieken

- **Per ticket type** (gekoppeld aan event), niet globaal.
- Modi: `none` / `fixed` / `percent` (kolom `service_fee_mode` op `ticket_types`).
- Voor Studio100: `fixed` = `2.50` voor alle betalende types.
- Voor seat checkout: gelezen door **frontend** uit `ticket_types`. De waarde wordt vervolgens als `p_service_fee` doorgegeven aan de RPC; **geen server-side herberekening** van de fee.

> Reguliere ticket-checkout (`create-ticket-checkout/index.ts:222-237`) berekent de fee **wél** server-side opnieuw uit `ticket_types`.

---

## VRAAG 4 — Real-world voorbeeld (Studio100)

Voorbeeld-stoel: **Rij H, plek 13, sectie "Vrije Plaatsing"**, gekoppeld aan ticket type "Zitplaatsen Plein".

| veld | waarde |
|---|---|
| `seats.price_override` | **NULL** |
| `seats.ticket_type_id` | `91e1fb24-…` (Zitplaatsen Plein) |
| `ticket_types.price` (voor dat type) | **3500** (cents → 35,00 EUR) |
| `seat_sections.price_amount` | **0.00** |

### Welke prijs gebruikt de **frontend** voor de bezoeker?

- Stap 1: `price_override` is NULL → skip.
- Stap 2: `ticket_type_id = 91e1fb24…` → `seatTicketTypePrices.get(...)` → **35,00 EUR**.

→ De bezoeker ziet **35 EUR** (correct).

### Welke prijs gebruikt de **RPC server-side** voor `ticket_seats.price_paid`?

`migration 20260415190249…reserve_seats.sql:83-89`:

```sql
SELECT s.id, s.row_label, s.seat_number,
       COALESCE(s.price_override, sec.price_amount) as effective_price,
       sec.name as section_name
FROM seats s
JOIN seat_sections sec ON s.section_id = sec.id
WHERE s.id = ANY(p_seat_ids)
```

= `COALESCE(NULL, 0.00)` = **0.00 EUR**.

> **Kritieke discrepantie:** de RPC negeert `seats.ticket_type_id` volledig. Voor het Studio100-event krijgt elke `ticket_seats.price_paid = 0`. Het werkelijke prijsbeleid (`ticket_types.price`) wordt **niet** geraadpleegd.

> Het `orders.total_amount` komt al uit user-input (`p_total_amount`, zie `AMOUNT_FLOW_ANALYSIS.md`), dus betalingsbedrag wordt sowieso niet uit de DB afgeleid.

---

## VRAAG 5 — Andere flows: zelfde kwetsbaarheid?

### `create-ticket-checkout` (reguliere tickets)

`supabase/functions/create-ticket-checkout/index.ts:177-219`:

```ts
const { data: ticketTypes } = await supabase
  .from('ticket_types')
  .select('id, name, price, is_active, event_id, service_fee_mode, service_fee_fixed, service_fee_percent')
  .in('id', ticketTypeIds);

for (const item of cart) {
  const dbTicketType = ticketTypes?.find((tt: any) => tt.id === item.ticket_type_id);
  ...
  if (dbTicketType.price !== item.price) {
    return jsonResponse({ error: 'PRICE_MISMATCH', ... }, 409);
  }
}

const subtotalCents = cart.reduce((sum, item) => {
  const dbPrice = ticketTypes?.find(tt => tt.id === item.ticket_type_id)?.price ?? 0;
  return sum + (dbPrice * item.quantity);
}, 0);
```

- Server-side validatie van `price` tegen DB → afwijzing met `PRICE_MISMATCH`.
- Subtotaal en service fee worden server-side **opnieuw berekend** uit `ticket_types`.
- Promo code wordt server-side gevalideerd uit `promo_codes`.
- Refund protection fee uit `refund_protection_config`.

→ **Veilig.**

### `create-table-order` (tafelreservering)

`supabase/functions/create-table-order/index.ts:164-226`:

```ts
const { data: tables } = await supabase
  .from('table_bookings')
  .select('id, ..., floorplan_tables(table_number, capacity, price)')
  .in('id', table_ids).eq('event_id', event_id);
...
// SECURITY: Calculate total from the authoritative floorplan_tables.price,
// NOT from client-supplied total_price
const totalAmount = tables.reduce((sum, t) => {
  const serverPrice = parseFloat(t.floorplan_tables?.price);
  if (isNaN(serverPrice) || serverPrice <= 0) {
    throw new Error(`Invalid price for table ${t.floorplan_tables?.table_number}`);
  }
  return sum + serverPrice;
}, 0);
...
total_amount: Math.round(totalAmount * 100),
...
amount: { currency: 'EUR', value: totalAmount.toFixed(2) },
```

- Geen `total_amount` of `price` uit de body wordt gebruikt.
- Bedrag komt 100% uit `floorplan_tables.price` (DB).
- Expliciete comment: "NOT from client-supplied total_price".

→ **Veilig.**

### `create-seat-order` (seat-based)

Zoals al uitgewerkt in `AMOUNT_FLOW_ANALYSIS.md`:

- `p_total_amount` komt uit user input.
- RPC schaalt enkel × 100 en gebruikt het direct voor `orders.total_amount` en de Mollie-call.
- Geen server-side herberekening uit `ticket_types.price`.
- `ticket_seats.price_paid` valt zelfs terug op `seat_sections.price_amount = 0` voor Studio100.

→ **Kwetsbaar.**

### Overzichtstabel

| Edge Function | Bedrag-bron | Server-side validatie? | Status |
|---|---|---|---|
| `create-ticket-checkout` | `ticket_types.price` (DB) | Ja, met `PRICE_MISMATCH` | **Veilig** |
| `create-table-order` | `floorplan_tables.price` (DB) | Ja, expliciet | **Veilig** |
| `create-seat-order` | `p_total_amount` (user input) | Nee | **Kwetsbaar zoals beschreven** |

---

## Korte conclusie

- **Leidende prijsbron in productie (Studio100):** `ticket_types.price` via `seats.ticket_type_id`. `seats.price_override` is overal NULL en `seat_sections.price_amount` is 0.
- **Frontend** raadpleegt deze bron correct.
- **RPC `create_seat_order_pending` raadpleegt deze bron NIET** — het gebruikt alleen `COALESCE(price_override, section.price_amount)`, wat voor Studio100 altijd `0` oplevert.
- **`orders.total_amount` voor seat-orders komt uit user input**, niet uit DB.
- Andere checkout-flows (`create-ticket-checkout`, `create-table-order`) zijn wél server-side prijsgevalideerd.

**Geen bestanden gewijzigd. Enkel `PRICE_SOURCE_ANALYSIS.md` aangemaakt.**
