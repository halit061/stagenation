# Dashboard Numbers Research — Studio 100 Zingt

Read-only analyse. Geen code gewijzigd.

---

## 1. Waar staat de Dashboard component?

De "Dashboard" / live-overzicht voor één event wordt niet direct in `SuperAdmin.tsx` getekend; hij wordt samengesteld uit twee componenten die in `EventAnalytics.tsx` worden ingeladen:

- `src/components/EventAnalytics.tsx:75` rendert `<LiveSalesCounter eventId=... />`
- `src/components/EventAnalytics.tsx:79` rendert `<HourlySalesChart eventId=... />`

De drie cards (VERKOCHT / OMZET / RESTEREND) en de mini-breakdown (Ticket prijs / Service fee / Omzet) staan in:

- `src/components/LiveSalesCounter.tsx:173-234`

De "Verkoop per uur" sectie staat in:

- `src/components/HourlySalesChart.tsx:114-193`

---

## 2. Data-bron "VERKOCHT" card  ->  DIT IS DE BUG

Berekening in `src/components/LiveSalesCounter.tsx:65-74`:

```ts
const allSoldOrderIds = allSoldOrders.map(o => o.id);
let totalTicketsSold = 0;
if (allSoldOrderIds.length > 0) {
  const { data: ticketsData } = await supabase
    .from('tickets')
    .select('id')
    .in('order_id', allSoldOrderIds)
    .limit(10000);
  totalTicketsSold = ticketsData?.length || 0;
}
```

- Tabel: `tickets` (klassieke tickets).
- `ticket_seats` (seat-checkout) wordt **niet** meegeteld.
- Omdat alle 60 verkopen via seat-checkout zijn ingevoerd, zit er niets in `tickets` voor dit event, dus `totalTicketsSold = 0`.

De card render:
- `src/components/LiveSalesCounter.tsx:179` -> `{sales.totalTicketsSold}` => `0`.

`RESTEREND` leunt op dezelfde variabele:
- `src/components/LiveSalesCounter.tsx:79` -> `totalTicketsRemaining: totalCapacity - totalTicketsSold`
- Met `totalCapacity` = som van `ticket_types.quantity_total` (= 3460 hier, want 360+360+360+847+258+... afhankelijk van config). Vandaar de 3400 (= 3460 - 60 gewenst, maar toont 3400 omdat `quantity_total` voor dit event samen 3400 bedraagt).

---

## 3. Data-bron "OMZET" card

`src/components/LiveSalesCounter.tsx:38-62`:

```ts
supabase
  .from('orders')
  .select('id, total_amount')
  .eq('event_id', eventId)
  .eq('status', 'paid')
  .limit(10000),
...
const totalRevenueCents = paidOrders.reduce((sum, o) => sum + o.total_amount, 0);
```

Card render: `src/components/LiveSalesCounter.tsx:188-190`.

- Tabel: `orders`, filter `event_id + status='paid'`.
- Somt `orders.total_amount` (in centen). Werkt correct -> €2303.

---

## 4. Data-bron "Verkoop per uur"

`src/components/HourlySalesChart.tsx:27-49`:

```ts
const { data, error } = await supabase
  .from('orders')
  .select('created_at, total_amount, status')
  .eq('event_id', eventId)
  .eq('status', 'paid')
  ...
for (const order of data || []) {
  ...
  entry.ticketsSold += 1;             // <- telt orders, niet tickets
  entry.revenueCents += order.total_amount;
}
```

- Tabel: `orders` (niet `tickets` of `ticket_seats`).
- Filter: `status = 'paid'` (dus `comped` wordt niet meegeteld, anders dan in de VERKOCHT-card).
- "Totaal tickets" (`HourlySalesChart.tsx:148`) = aantal **orders**, geen aantal tickets.

Dus "15 tickets" in die sectie is in werkelijkheid "15 **orders**". Dat kan kloppen (15 paid orders, samen 60 stoelen).

---

## 5. Ticket prijs €2153 en Service fee €150

`src/components/LiveSalesCounter.tsx:82-97`:

```ts
const { data: breakdownOrders } = await supabase
  .from('orders')
  .select('total_amount, service_fee_total_cents')
  .eq('event_id', eventId)
  .in('status', ['paid', 'comped'])
  .limit(10000);
...
const totalAmount = breakdownOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
const serviceFee  = breakdownOrders.reduce((sum, o) => sum + (o.service_fee_total_cents || 0), 0);
setBreakdown({
  ticketPriceCents: totalAmount - serviceFee,
  serviceFeeCents:  serviceFee,
  omzetCents:       totalAmount,
});
```

Rendering: `LiveSalesCounter.tsx:211, 221, 231`.

- Bron: `orders.total_amount` en `orders.service_fee_total_cents`.
- Juist -> klopt visueel met de cijfers.

Let op: de bovenste OMZET-card gebruikt enkel `status='paid'`, de onderste OMZET-tegel én de breakdown gebruiken `['paid','comped']`. Kleine inconsistentie, maar bij Studio 100 Zingt waarschijnlijk geen verschil omdat er geen comped orders zijn.

---

## 6. Tickets-pagina in SuperAdmin - waarom klopt die wel

De getoonde "60 verkocht" komt uit de `paidCountByType` state en wordt opgehaald in **`loadData()`**:

`src/pages/SuperAdmin.tsx:468-493`:

```ts
// Fetch real ticket counts from paid + comped orders (quantity_sold in DB may be stale)
const { data: allPaidOrders } = await supabase
  .from('orders').select('id').in('status', ['paid', 'comped']).limit(10000);
const allPaidOrderIds = (allPaidOrders || []).map((o: any) => o.id);
if (allPaidOrderIds.length > 0) {
  const [paidTicketsRes, paidSeatsRes] = await Promise.all([
    supabase.from('tickets')
      .select('id, ticket_type_id')
      .in('order_id', allPaidOrderIds)
      .limit(10000),
    supabase.from('ticket_seats')
      .select('id, seats(ticket_type_id)')
      .in('order_id', allPaidOrderIds)
      .limit(10000),
  ]);
  const counts: Record<string, number> = {};
  (paidTicketsRes.data || []).forEach((t: any) => {
    if (t.ticket_type_id) counts[t.ticket_type_id] = (counts[t.ticket_type_id] || 0) + 1;
  });
  (paidSeatsRes.data || []).forEach((s: any) => {
    const typeId = s.seats?.ticket_type_id;
    if (typeId) counts[typeId] = (counts[typeId] || 0) + 1;
  });
  setPaidCountByType(counts);
}
```

Rendering per ticket type: `src/pages/SuperAdmin.tsx:4328` -> `{paidCountByType[ticket.id] || 0} / {ticket.quantity_total} verkocht`.

Verschil met Dashboard:
- **Tickets-pagina**: telt rijen uit zowel `tickets` als `ticket_seats` (via `seats.ticket_type_id` relatie) -> totaal 60.
- **Dashboard (LiveSalesCounter)**: telt enkel uit `tickets` -> 0.

---

## 7. Concrete diagnose

Oorzaak van "Dashboard toont 0 tickets verkocht":

> `LiveSalesCounter.tsx` telt alleen de `tickets` tabel en negeert `ticket_seats`.

Voor dit event zijn **alle** verkopen seat-checkout (ticket_seats), niet klassiek (tickets). Dus de count wordt 0.

Andere kandidaat-oorzaken **uitgesloten**:
- `ticket_sales` / `ticket_orders` tabellen (migration `20251229121801_create_ticket_sales_tracking.sql`) worden **niet** door het dashboard gelezen - hier ligt het niet aan.
- `reserved_items` bestaat niet in queries.
- `quantity_sold` op `ticket_types` wordt door Dashboard niet gebruikt (Dashboard telt live via orders+tickets), dus stale `quantity_sold` is niet de oorzaak.

Bijkomend gevolg:
- `RESTEREND` is daardoor overdreven hoog (3400 i.p.v. 3340).
- Eventuele alert-logic die "uitverkocht" uit dit cijfer afleidt zou fout klokken.

---

## 8. Het $ icoon

Component: `src/components/LiveSalesCounter.tsx`.

- Import (regel 2):
  ```ts
  import { Ticket, DollarSign, TrendingUp, RefreshCw, Receipt, Percent, Euro } from 'lucide-react';
  ```
- Card rendering (regel 185):
  ```tsx
  <DollarSign className="w-6 h-6 text-green-400" />
  ```

Oorzaak: er wordt `DollarSign` (Lucide) gebruikt in de hoofd-OMZET-card. De kleinere breakdown-tegel gebruikt al wel `Euro` (regel 227), dus inconsistent binnen hetzelfde bestand.

Tekstueel staat de euro wel juist: regels 189 en 211/221/231 gebruiken `'\u20AC'` (=`€`).

Alleen het icoon klopt niet. Fix = `DollarSign` vervangen door `Euro` op regel 185 (en eventueel ook de import-optimalisatie; `DollarSign` nergens anders gebruikt in dit bestand).

---

## 9. Andere plekken die dezelfde bron gebruiken

Gecheckt:

### A. `src/pages/SuperAdmin.tsx`
- **`loadData()` regel 468-493**: telt al correct uit `tickets` + `ticket_seats`. Dit voedt `paidCountByType` voor de Tickets-tab. OK, zou dezelfde fix elders niet breken.
- **`loadData()` regel 505-545**: trekt orders + joined tickets + ticket_seats om details-views te voeden.
- **`loadTicketSalesSummary()` regel 1487-1497** (tab "Ticket Verkopen"):
  ```ts
  const { data: ticketCounts } = await supabase
    .from('tickets')
    .select('order_id, event_id')
    .limit(10000);
  ```
  **Zelfde bug hier**: `ticket_seats` wordt niet meegeteld. Dus de kolom "Totaal tickets" in die tab ondertelt seat-orders ook. (Totale omzet klopt wel want die komt uit `orders`.)
- **`loadTicketSalesForEvent()` regel 1511-1527**: haalt per-order details, telt `orderTickets.length` uit tabel `tickets`; de rij-per-order "quantity" zal 0 zijn bij seat-orders. Zelfde onderliggend probleem maar op order-niveau.

### B. `src/components/AdminSalesWidget.tsx`
Toont de "Sales"-widget op de floor plan editor. Krijgt data via prop `stats: SalesStats` uit hook `useAdminSeatRealtime`:
- `src/hooks/useAdminSeatRealtime.ts:111-154` -> telt `ticket_seats.eq(event_id)` (seats) en `orders.eq(product_type='seat')`.
- Enkel seats, geen classic tickets. Voor dit event (alles seats) correct; voor hybride events zou het classic tickets missen. Niet relevant voor de Studio 100 fix, wel vermelden.

### C. `src/components/EventAnalytics.tsx`
Wrapper rond `LiveSalesCounter` + `HourlySalesChart`. Geen eigen queries.

### D. `src/pages/Scanner.tsx`
- regels 40, 45, 50: queries op `tickets` voor ticket-validatie bij scan.
- Scanner-flow gebruikt ook `ticket_seats` (in `supabase/functions/unified-scan/`) voor seat-checkins. Niet afhankelijk van de dashboard count -> fix van LiveSalesCounter heeft geen impact.

### E. `supabase/functions/admin-data/index.ts`
Moest gecheckt worden of de Dashboard die edge gebruikt: hij wordt door het dashboard niet aangeroepen (Dashboard queriet direct Supabase client). Enkele queries op `tickets`, niet gebruikt door VERKOCHT-card.

### F. `src/pages/Tickets.tsx` (publieke ticket-pagina)
- regel 334-361: public "Available" count. Doet `Math.max(tt.quantity_sold, countByType[tt.id])` waar `countByType` alleen uit `tickets` komt. Voor events die alleen seat-based zijn is dit risicovol: als `quantity_sold` niet accurate is, kan de publieke shop overbooking tonen. Onafhankelijk van de dashboard-fix, maar wel een gerelateerd risico dat los gevolgd moet worden.

### G. Boekhoudings-export
Niet gevonden als apart component. Exports in `SuperAdmin.tsx` gebruiken `orders.total_amount` (correct) of `loadTicketSalesForEvent` (mogelijk getroffen).

---

## Bestanden die mogelijk affected worden door een fix

Directe target van de gemelde bug (VERKOCHT-card + $ icoon):
- `src/components/LiveSalesCounter.tsx` — voeg `ticket_seats`-telling toe, vervang `DollarSign` door `Euro`.

Zelfde onderliggende patroon (zouden in dezelfde fix-PR mee kunnen of apart opgevolgd):
- `src/pages/SuperAdmin.tsx:1487-1497` — `loadTicketSalesSummary()` mist `ticket_seats`.
- `src/pages/SuperAdmin.tsx:1523-1527` — `loadTicketSalesForEvent()` mist `ticket_seats` -> per-order `quantity` klopt niet.
- `src/pages/Tickets.tsx:346-358` — publieke "verkocht/beschikbaar" mist `ticket_seats` in de override. Potentieel overbooking-risico, GOED TE BEKIJKEN.
- `src/hooks/useAdminSeatRealtime.ts:111-154` — AdminSalesWidget telt alleen seats, geen classic tickets. Voor hybride events relevant, niet voor Studio 100 Zingt.

Niet getroffen (eerst gecontroleerd zodat fix niets breekt):
- `src/components/HourlySalesChart.tsx` — telt orders, niet tickets; verandert niet als we ticket-telling fixen. Blijft "15" = 15 orders.
- `src/components/AdminSalesWidget.tsx` — wordt via props gevoed, onafhankelijk van `LiveSalesCounter`.
- `src/components/EventAnalytics.tsx` — pure wrapper.
- `src/pages/Scanner.tsx` en `supabase/functions/unified-scan/` — onafhankelijke scanner-paden.
- `supabase/functions/admin-data/index.ts` — niet gebruikt door Dashboard.
- `supabase/migrations/20251229121801_create_ticket_sales_tracking.sql` (tabellen `ticket_orders` / `ticket_order_items`) — niet gebruikt door Dashboard.

---

## Openstaande punten / Onbekend, vraag bij user

- Wil je dat de "VERKOCHT"-card ook `comped` tickets meetelt (huidige logica doet dat al via `['paid','comped']` voor order IDs)? Ja of neen moet bevestigd worden; huidig gedrag lijkt bedoeld om ja te zijn.
- Wil je dat `loadTicketSalesSummary` en `loadTicketSalesForEvent` in dezelfde fix mee opgelost worden, of alleen de Dashboard VERKOCHT-card? Beide hebben de zelfde ondertelling.
- Moet het $-icoon overal in het project gecheckt worden op foute DollarSign-usages, of enkel deze card?
