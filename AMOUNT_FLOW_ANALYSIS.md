# AMOUNT_FLOW_ANALYSIS — Hoe wordt het bedrag bepaald in `create-seat-order`?

> Read-only analyse. Geen bestaande bestanden gewijzigd.

---

## VRAAG 1 — Bedrag-berekening in `create-seat-order`

### 1a. Input van de frontend

De Edge Function ontvangt het volledige `body` object met onderstaande velden (`supabase/functions/create-seat-order/index.ts:94-111`):

```ts
const {
  p_event_id,
  p_customer_first_name,
  p_customer_last_name,
  p_customer_email,
  p_customer_phone,
  p_subtotal,
  p_service_fee,
  p_total_amount,
  p_payment_method,
  p_notes,
  p_session_id,
  p_seat_ids,
  p_seat_prices,
  p_ticket_type_id,
} = body;
```

**Ja — de frontend stuurt expliciet `p_subtotal`, `p_service_fee`, `p_total_amount` én een array `p_seat_prices` mee.** Deze worden in de frontend (client-side) berekend in `src/pages/SeatCheckout.tsx:347-379` op basis van `heldSeats`, `sections` en `seatTicketTypePrices` — vervolgens doorgegeven aan `seatCheckoutService.createSeatOrder()` (`src/services/seatCheckoutService.ts:55-71`):

```ts
body: JSON.stringify({
  ...
  p_subtotal: order.subtotal,
  p_service_fee: order.serviceFee,
  p_total_amount: order.totalAmount,
  ...
  p_seat_ids: order.seatIds,
  p_seat_prices: order.seatPrices,
})
```

### 1b. Hoe ontstaat het uiteindelijke bedrag voor Mollie?

Het bedrag dat naar Mollie gaat is **niet uit de DB herberekend**. Het wordt direct overgenomen uit `p_total_amount` (user input) en doorgezet naar de RPC, en vervolgens als response teruggegeven aan de Edge Function.

Bewijs — RPC `create_seat_order_pending` (`supabase/migrations/20260415190249_fix_create_seat_order_pending_reserve_seats.sql:46-53`):

```sql
v_total_cents := (p_total_amount * 100)::INTEGER;
v_service_fee_cents := (p_service_fee * 100)::INTEGER;
```

Het cents-bedrag komt **één-op-één** uit de meegegeven `p_total_amount`. Er is **geen herberekening** uit `seats`, `seat_sections`, `ticket_types` of `ticket_type_sections` voor het orderbedrag zelf.

> Wel relevant: per-seat prijs `price_paid` op `ticket_seats` wordt **wel** server-side berekend uit DB (`migration ...reserve_seats.sql:83-89`):
> ```sql
> SELECT s.id, s.row_label, s.seat_number,
>        COALESCE(s.price_override, sec.price_amount) as effective_price,
>        sec.name as section_name
> FROM seats s
> JOIN seat_sections sec ON s.section_id = sec.id
> WHERE s.id = ANY(p_seat_ids)
> ```
> Maar dit `effective_price` wordt **niet** gesommeerd om `v_total_cents` te valideren tegen `p_total_amount`. Het wordt enkel opgeslagen op `ticket_seats.price_paid`.

De RPC retourneert vervolgens `total_amount_cents` (uit user input) (`migration ...reserve_seats.sql:112-118`):

```sql
RETURN jsonb_build_object(
  'success', true,
  'order_id', v_order_id,
  'order_number', v_order_number,
  'verification_code', v_verification_code,
  'total_amount_cents', v_total_cents
);
```

### 1c. Waar wordt het bedrag aan Mollie meegegeven?

`supabase/functions/create-seat-order/index.ts:175-178`:

```ts
const totalAmountCents = data.total_amount_cents;
const amountInEuros = (totalAmountCents / 100).toFixed(2);
```

En in de Mollie payment-call (`supabase/functions/create-seat-order/index.ts:261-287`):

```ts
const mollieResponse = await mollieWithRetry(
  "https://api.mollie.com/v2/payments",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${mollieApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": mollieIdempotencyKey,
    },
    body: JSON.stringify({
      amount: { currency: "EUR", value: amountInEuros },
      description: "StageNation Tickets",
      redirectUrl: confirmationUrl,
      cancelUrl,
      webhookUrl,
      metadata: { ... },
      method: null,
    }),
  },
);
```

`amount.value` = `(totalAmountCents / 100).toFixed(2)` = `(p_total_amount * 100 / 100).toFixed(2)` = **rechtstreeks de user-input value**.

---

## VRAAG 2 — Promo codes / discounts

### Worden promo codes toegepast?

**Nee, niet in de seat-checkout flow.** Bewijs:

- `grep -i "promo" supabase/functions/create-seat-order/` → geen resultaten
- `grep -i "promo" src/pages/SeatCheckout.tsx` → geen resultaten
- `grep -i "discount" src/services/seatCheckoutService.ts` → geen resultaten
- De RPC-signature `create_seat_order_pending(...)` (`migration ...reserve_seats.sql:16-31`) heeft **geen** `p_promo_code` of `p_discount` parameter.

Promo-functionaliteit bestaat wel elders in het project (zie `src/components/PromoCodesManager.tsx`, `src/pages/Tickets.tsx`, `src/lib/checkoutClient.ts`) maar **wordt niet meegenomen** in de seat-order flow die naar Mollie gaat. Voor seat-checkout is geen promo-validatie aanwezig.

Aangezien er geen promo-input is, kan een gebruiker **wel** indirect "korting" toepassen door simpelweg `p_total_amount` lager te zetten (zie Conclusie).

---

## VRAAG 3 — Verschillende prijscategorieën

### Hebben stoelen verschillende prijzen?

**Ja.** Prijzen worden bepaald via deze hiërarchie (frontend in `src/pages/SeatCheckout.tsx:347-361` en server-side in `migration ...reserve_seats.sql:83-89`):

| Bron | Veld | Prioriteit |
|---|---|---|
| `seats` | `price_override` | 1 (hoogste) |
| `ticket_types` (gekoppeld aan seat via `seats.ticket_type_id`) | `price` | 2 |
| `seat_sections` | `price_amount` | 3 |
| `ticket_type_sections` → `ticket_types.price` | section-level fallback | 4 |

### Hoe wordt prijs per stoel server-side bepaald in `create-seat-order`?

Server-side (RPC) gebruikt **alleen**: `COALESCE(s.price_override, sec.price_amount)`. Dit is een vereenvoudiging vergeleken met de frontend; per-stoel `ticket_type_id` prijs wordt server-side **niet** meegenomen voor `price_paid` (`migration ...reserve_seats.sql:84-85`):

```sql
COALESCE(s.price_override, sec.price_amount) as effective_price
```

De `p_seat_prices` array wordt door de RPC **niet gebruikt** — de parameter staat in de signature maar er is geen `WHERE`/`USING` of toewijzing met die array zichtbaar in de RPC body.

---

## VRAAG 4 — Mollie payment metadata

### 4a. Volledig metadata-object naar Mollie

`supabase/functions/create-seat-order/index.ts:270-285`:

```ts
body: JSON.stringify({
  amount: { currency: "EUR", value: amountInEuros },
  description: "StageNation Tickets",
  redirectUrl: confirmationUrl,
  cancelUrl,
  webhookUrl,
  metadata: {
    orderId,
    orderNumber,
    email: p_customer_email,
    event_id: p_event_id,
    type: "tickets",
    brand: "stagenation",
  },
  method: null,
}),
```

### 4b. Wordt `total_amount` op `orders` gezet? Vóór of ná Mollie?

**Vóór** de Mollie-call. De RPC `create_seat_order_pending` schrijft `total_amount` (in cents) bij het aanmaken van de order, vóórdat de Edge Function Mollie aanroept (`migration ...reserve_seats.sql:66-78`):

```sql
INSERT INTO orders (
  order_number, event_id, payer_name, payer_email, payer_phone,
  total_amount, service_fee_total_cents, service_fee_amount, service_fee,
  payment_method, status, payment_id,
  verification_code, session_id, notes, product_type
) VALUES (
  v_order_number, p_event_id,
  p_customer_first_name || ' ' || p_customer_last_name,
  p_customer_email, p_customer_phone,
  v_total_cents, v_service_fee_cents, p_service_fee, p_service_fee,
  p_payment_method, 'pending', NULL,
  v_verification_code, p_session_id, p_notes, 'seat'
) RETURNING id INTO v_order_id;
```

Volgorde:

1. RPC INSERT INTO orders met `total_amount = v_total_cents` (uit user input).
2. Edge Function ontvangt `total_amount_cents` van RPC.
3. Edge Function bouwt `amountInEuros` en stuurt naar Mollie.
4. Ná Mollie-response wordt enkel `payment_id` op `orders` ge-update (`supabase/functions/create-seat-order/index.ts:302-305`):

```ts
await supabase
  .from("orders")
  .update({ payment_id: payment.id })
  .eq("id", orderId);
```

`total_amount` wordt **niet** meer aangepast na de Mollie-call.

---

## Conclusie veiligheid van bedrag

> **VOLLEDIG UIT USER INPUT.**

Het bedrag dat naar Mollie wordt gestuurd én in `orders.total_amount` wordt opgeslagen komt rechtstreeks uit de request body (`p_total_amount`). De RPC vermenigvuldigt dit alleen met 100 om naar cents te converteren — er is **geen server-side validatie** die `p_total_amount` herleidt of vergelijkt met de werkelijke prijs uit `seats.price_override` / `seat_sections.price_amount` / `ticket_types.price`.

### Concrete aanvalsoppervlak

Een kwaadwillende gebruiker kan een POST naar `/functions/v1/create-seat-order` doen met bv.:

```json
{
  "p_event_id": "<echt event id>",
  "p_customer_first_name": "X",
  "p_customer_last_name": "Y",
  "p_customer_email": "x@y.z",
  "p_subtotal": 0.01,
  "p_service_fee": 0,
  "p_total_amount": 0.01,
  "p_seat_ids": ["<echte seat ids>"],
  "p_seat_prices": [0.01]
}
```

→ Order wordt aangemaakt met `total_amount = 1 cent`, Mollie ontvangt `amount.value = "0.01"` en de gebruiker betaalt 1 cent voor seats van bv. 50 EUR. De `mollie-webhook` heeft (zoals eerder vastgesteld in `SECURITY_ANALYSIS_REPORT.md`) **geen amount-validatie** tegen verwachte DB-prijs, dus de webhook markeert de order als `paid` en de seats als `sold`.

### Aanbeveling (niet doorgevoerd — read-only)

Server-side in `create_seat_order_pending`:

```sql
-- pseudo
SELECT SUM(COALESCE(s.price_override, sec.price_amount))
INTO v_db_subtotal
FROM seats s JOIN seat_sections sec ON s.section_id = sec.id
WHERE s.id = ANY(p_seat_ids);

-- + service fee uit ticket_types

IF abs(v_db_subtotal + v_db_fee - p_total_amount) > 0.01 THEN
  RETURN jsonb_build_object('success', false, 'error', 'amount_mismatch');
END IF;
```

En idealiter ook validatie in de Mollie-webhook tussen `payment.amount.value` en `orders.total_amount`.

---

**Geen bestaande bestanden gewijzigd. Enkel `AMOUNT_FLOW_ANALYSIS.md` toegevoegd.**
