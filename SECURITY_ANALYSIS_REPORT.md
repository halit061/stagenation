# Security Analysis Report — StageNation

Read-only analyse, geen bestaande bestanden gewijzigd. Alle citaten met `pad:regel`.

---

## VRAAG 1 — Session ID generatie

### a) Hoe wordt `session_id` aangemaakt?
Met **`crypto.randomUUID()`** (Web Crypto API, browser-native, cryptografisch sterk).

```ts
// src/services/seatPickerService.ts:4-15
const SESSION_KEY = 'seat_picker_session_id';
...
function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
```

Geen gebruik van `uuid`-package, geen `Math.random()`, geen timestamp-based generatie. Eén centrale generator, alle andere modules importeren `getSessionId` (zie `src/services/seatCheckoutService.ts:2`, `src/hooks/useSeatPickerState.ts:23`).

### b) Waar wordt het opgeslagen?
**`sessionStorage`** (per tab, weg bij tab-close), niet `localStorage`, niet in cookies.

```ts
// src/services/seatPickerService.ts:9-12
let id = sessionStorage.getItem(SESSION_KEY);
if (!id) {
  id = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, id);
}
```

### c) Exacte localStorage / sessionStorage key
`'seat_picker_session_id'` — `src/services/seatPickerService.ts:4`.

Andere related sessionStorage keys:
- `'seat_picker_hold'` — `src/services/seatPickerService.ts:5`
- `'seat_picker_rate'` — `src/services/seatPickerService.ts:6`
- `'stagenation_splash_seen'` — `src/App.tsx:52,60` (geen verband met session_id)

### d) Wordt het in URLs gezet?
**Nee.** Grep op `?session=`, `?sid=`, `?sessionId=` in de hele `src/`-tree leverde **geen treffers** op. Het session_id verschijnt nergens als query parameter, zoekparameter of pad in URLs.

### e) Wordt het in `console.log` gebruikt?
**Nee.** Grep `console\.log.*session` (case-insensitive) over `src/` en `supabase/functions/` leverde geen treffers op. Het session_id wordt niet gelogd. (`src/services/seatPickerService.ts` heeft `console.error('[SeatPicker] Hold error:', err.message)` maar dat logt geen sessionId.)

### f) Wordt het in e-mailtemplates gebruikt?
**Nee.** Grep `session` in alle e-mail-edge-functions (`send-ticket-email`, `send-guest-ticket`, `send-table-guest`, `send-password-reset-email`, `resend-ticket-email`, `resend-guest-ticket-emails`, `resend-table-guest-email`) leverde geen treffers. Het session_id staat niet in templates.

### g) Hoe wordt het naar Supabase gestuurd?
Drie patronen:

1. **Direct als kolomfilter** in PostgREST queries (Supabase JS client):

```ts
// src/services/seatPickerService.ts:55-65
const sessionId = getSessionId();
const { data, error } = await supabase
  .from('seat_holds')
  .select('seat_id')
  .eq('session_id', sessionId)
  .eq('event_id', eventId)
  .eq('status', 'held')
```

2. **Als RPC parameter** `p_session_id`:

```ts
// src/services/seatPickerService.ts:200-205
const sessionId = getSessionId();
...
p_session_id: sessionId,
```

Ook gebruikt in `extend_seat_holds`, `release_session_holds` (zie `seatPickerService.ts:215-227`).

3. **Als HTTP-header** `x-session-id` op één plek:

```ts
// src/services/seatCheckoutService.ts:154-164
export async function fetchOrderById(orderId: string) {
  const sessionId = getSessionId();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/orders?id=eq.${...}`;
  const res = await fetch(url, {
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'x-session-id': sessionId,
      ...
    },
  });
}
```

> **Opmerking voor audit:** de header `x-session-id` wordt meegestuurd, maar PostgREST honoreert geen unknown headers voor RLS-filtering. RLS gebruikt enkel het `session_id`-kolom van `orders` (en de anon JWT). Deze header heeft daarom geen security-effect; het is "informatief".

4. **Edge function body**: `hold-seats` ontvangt `session_id` in JSON body (`supabase/functions/hold-seats/index.ts:33`).

---

## VRAAG 2 — Mollie webhook

Locatie: `supabase/functions/mollie-webhook/index.ts`.

### a) Wordt de payment opnieuw opgehaald via Mollie API?
**Ja**, dit is dé authenticatie-mechanisme:

```ts
// supabase/functions/mollie-webhook/index.ts:250-263
const mollieResponse = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
  headers: { Authorization: `Bearer ${mollieApiKey}` }
});
if (!mollieResponse.ok) {
  console.error('SECURITY: Failed to verify payment from Mollie API - possible forged webhook');
  ...
  return ...;
}
const payment = await mollieResponse.json();
```

De webhook body bevat alleen `id=tr_xxx`; de echte `payment` wordt opgehaald via Mollie REST API met server-side `MOLLIE_API_KEY`. Body wordt nooit vertrouwd voor status/amount.

### b) Wordt het bedrag (`amount`) gevalideerd tegen de database?
**Nee.** Het bedrag uit Mollie wordt **niet** vergeleken met `order.total_amount` in de database. De webhook accepteert wat Mollie zegt:

```ts
// supabase/functions/mollie-webhook/index.ts:314-321
if (payment.status === 'paid' && ['pending', 'reserved'].includes(order.status)) {
  const paidAtIso = new Date().toISOString();
  await supabase.from('orders').update({
    status: 'paid',
    paid_at: paidAtIso,
    payment_method: payment.method,
    payment_id: payment.id
  }).eq('id', order.id);
```

> **Bevinding:** Geen amount-cross-check. In theorie zou een gemanipuleerde `create-payment`-call met te laag bedrag richting Mollie tot een onderbetaalde "paid" order kunnen leiden. Het bedrag wordt wél server-side bepaald in `create-seat-order` / `create-payment` (uit DB), maar de webhook leest het niet terug. Risiconiveau: laag (vereist compromittering van payment-creation flow), maar best practice ontbreekt.

### c) Idempotency check?
**Ja**, twee lagen:

1. **`webhook_logs` lock** — voorkomt parallel processing:

```ts
// supabase/functions/mollie-webhook/index.ts:229-248
const { data: existingLog } = await supabase.from('webhook_logs')
  .select('id, processed').eq('provider', 'mollie').eq('event_type', paymentId).maybeSingle();
if (existingLog?.processed) {
  return new Response(JSON.stringify({ ok: true }), { status: 200, ... });
}
if (!existingLog) {
  const { error: lockError } = await supabase.from('webhook_logs').insert({
    provider: 'mollie', event_type: paymentId,
    payload: { status: 'processing' }, signature_valid: false, processed: false
  });
  if (lockError?.code === '23505') {
    return ...;  // unique constraint = andere instance heeft 'm
  }
}
```

2. **Order-status check** — short-circuit bij reeds betaalde order:

```ts
// supabase/functions/mollie-webhook/index.ts:284-287
if (order.status === 'paid') {
  await supabase.from('webhook_logs').upsert({...processed: true...});
  return new Response(JSON.stringify({ ok: true }), { status: 200, ... });
}
```

### d) Wordt de webhook signature gecheckt?
**Nee** — Mollie biedt geen HMAC-signature op webhooks (alleen payment-id). De authenticiteit wordt gewaarborgd door (a) de Mollie API-callback en (b) SSRF-bescherming op het payment-id formaat:

```ts
// supabase/functions/mollie-webhook/index.ts:94-96
function isValidMolliePaymentId(id: string): boolean {
  return /^tr_[a-zA-Z0-9]+$/.test(id);
}
```

```ts
// supabase/functions/mollie-webhook/index.ts:217-227
if (!isValidMolliePaymentId(paymentId)) {
  console.error('SECURITY: Invalid payment ID format:', paymentId);
  await supabase.from('webhook_logs').insert({
    provider: 'mollie', event_type: 'invalid_payment_id', ...,
    signature_valid: false, processed: false
  });
  return ...;
}
```

### e) Behandeling van `pending` / `failed` / `expired` / `canceled`
- **`pending`**: niet expliciet behandeld — geen update; webhook eindigt aan het einde met de upsert van `webhook_logs`. Order blijft in `pending`/`reserved`.
- **`failed` / `canceled` / `expired`** — lines 537-598:

```ts
// supabase/functions/mollie-webhook/index.ts:537-545
} else if (payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'expired') {
  const statusMap: Record<string, string> = {
    failed: 'payment_failed',
    canceled: 'payment_canceled',
    expired: 'payment_expired',
  };
  const orderStatus = statusMap[payment.status] || 'failed';
  await supabase.from('orders').update({ status: orderStatus }).eq('id', order.id);
  await supabase.from('tickets').update({
    status: 'revoked',
    revoked_reason: `Payment ${payment.status}`,
    revoked_at: new Date().toISOString()
  }).eq('order_id', order.id).eq('status', 'pending');
```

Daarna (`mollie-webhook/index.ts:547-598`):
- voor `product_type === 'seat'`: `seats` status terug naar `'available'`, `seat_holds` naar `'released'` (`549-565`);
- legacy `reserved_items` releases (`568-584`);
- `atomic_rollback_ticket_stock` RPC voor reguliere ticket types (`585-597`).

### f) Volledige inhoud van de webhook code
Te lang om hier voluit op te nemen (~610 regels). Pad: `supabase/functions/mollie-webhook/index.ts`. Zie sectie b/c/d/e hierboven voor alle relevante fragments. Belangrijke structuur:

- `sha256Hex()` (regel 4-8) — hash helper voor FB CAPI
- `sendFbCapiPurchase()` (regel 10-88) — Conversions API Purchase event, niet-blokkerend
- `isValidMolliePaymentId()` (regel 94-96) — SSRF-bescherming
- `handleDrinkOrderPayment()` (regel 98-177) — drink order branch
- `generateDisplayCode()` (regel 179-188)
- `Deno.serve()` hoofdroute (regel 190-607):
  - CORS preflight (191-194)
  - env vars (197-205)
  - body parse + paymentId extract (207-214)
  - payment-id format validatie (216-227)
  - idempotency lock (229-248)
  - Mollie API verify (250-263)
  - branch op `paymentType === 'drink_order'` (268-270)
  - `orderId` ophalen uit `payment.metadata.orderId` (272-276)
  - order status short-circuit (284-287)
  - paid-late branches (289-312)
  - main paid branch (314-536) inclusief tickets→valid, table_bookings→PAID, FB CAPI dispatch (326-347), seat conversion (349-367), legacy stock release (369-394), ticket_orders analytics (399-476), QR generatie tafelboekingen (478-494), email send (496-520), WhatsApp notify (522-536)
  - failed/canceled/expired branch (537-598)
  - final webhook_logs upsert (600)
  - global try/catch (603-606)

---

## VRAAG 3 — Edge Functions overzicht

Locatie: `supabase/functions/` (uitgezonderd `_shared/`). 50 functies totaal.

### Drinks-beheer (super_admin)
| Functie | Doel | Validatie | Env-variabelen | Rate limiting |
|---|---|---|---|---|
| `admin-create-drink` | Maakt drankje | if-checks vereiste velden | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | nee |
| `admin-create-drink-category` | Maakt categorie | if-checks `name_nl`/`name_tr` | idem | nee |
| `admin-update-drink` | Update drankje | if-checks `id` | idem | nee |
| `admin-update-drink-category` | Update categorie | if-checks `id` | idem | nee |
| `admin-update-drink-stock` | Update voorraad | if-checks `event_id`, `drink_id` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | nee |
| `admin-delete-drink` | Verwijdert drankje | if-checks `id` | idem | nee |
| `admin-delete-drink-category` | Verwijdert categorie | if-checks `id` | idem | nee |

### Admin & user management
| Functie | Doel | Validatie | Env-variabelen | Rate limiting |
|---|---|---|---|---|
| `admin-data` | Dashboard data ophalen | if-checks `event_id` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | nee |
| `admin-list-scanner-users` | Scanner/admin users lijst | role-check | idem | nee |
| `admin-manage` | Guest tickets / refunds | UUID-regex | idem | nee |
| `admin-otp` | OTP-codes verzenden/verifiëren | 6-cijfer regex | + `RESEND_API_KEY`, `EMAIL_FROM` | **ja: 10/15min, 429** |
| `admin-reset-user-password` | Reset wachtwoord | regex 12+ char policy | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | nee |
| `admin-toggle-user-active` | Activate/deactivate | if-checks | idem | nee |
| `admin-update-user-role` | Role bijwerken | role-whitelist | idem | nee |
| `assign-role` | Rol toewijzen | email-regex + role-whitelist | idem | nee |
| `create-user-role` | User+role aanmaken | password-regex (12+/upper/lower/num/special) | idem | nee |
| `delete-user-role` | Verwijder rol | if-checks | idem | nee |
| `get-user-roles` | Rollen ophalen | auth-token check | idem | nee |
| `list-all-user-roles` | Alle rollen | role-permission check | idem | nee |
| `list-accessible-events` | Events voor user | brand-filter | idem | nee |
| `grant-super-admin` | Super-admin via RPC | if-checks `user_id` | idem | nee |

### Order/Checkout/Payment
| Functie | Doel | Validatie | Env-variabelen | Rate limiting |
|---|---|---|---|---|
| `create-payment` | Mollie payment | if-checks + retry 429/5xx | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MOLLIE_API_KEY`, `BASE_URL` | nee (retry-only) |
| `create-seat-order` | Seat order + Mollie | UUID/email regex, max 20 stoelen | idem | **ja: in-memory map 5/min, 429** (regel 20-34) |
| `create-table-order` | Tafelboeking | UUID/email, max 10 tables, 1-100 gasten | idem | **ja: `check_rate_limit` RPC** |
| `create-ticket-checkout` | Ticket checkout | UUID/email + honeypot | idem + limit-vars | **ja: `check_rate_limit` RPC** |
| `create-drink-order` | Drink order | UUID/email/fulfilment, max 20 items | idem | **ja: `check_rate_limit` RPC** |
| `reserve-tickets` | Tickets reserveren | honeypot + timing | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, limit-vars | **ja: `check_rate_limit` RPC + timing** |
| `cancel-order` | Order annuleren | if-checks + status-validatie | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | nee |
| `mollie-webhook` | Mollie webhook verwerken | payment-id regex + idempotency | + `MOLLIE_API_KEY`, `FB_PIXEL_ID`, `FB_ACCESS_TOKEN`, `FB_TEST_EVENT_CODE` | nee |
| `hold-seats` | Stoelen vasthouden | if-checks, max 10 stoelen | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **ja: `check_seat_hold_rate_limit` RPC** |

### Tickets & QR
| Functie | Doel | Validatie | Env-variabelen | Rate limiting |
|---|---|---|---|---|
| `delete-ticket` | Ticket verwijderen | UUID-regex | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | nee |
| `validate-ticket` | Ticket valideren (legacy) | UUID/token-checks | idem | nee |
| `api-validate-ticket` | Ticket valideren (scanner+) | token+UUID regex | idem | nee |
| `unified-scan` | Universele scan endpoint | token-format check | idem | nee |
| `validate-table-booking` | Tafel-QR valideren | token check | idem | nee |
| `check-in-table-booking` | Tafel-checkin | if-checks `booking_id`/paid status | idem | nee |
| `generate-drink-qr` | QR voor drinkorder | if-checks `order_id` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | nee |
| `generate-table-qr` | QR voor tafel | if-checks `booking_id` | idem | nee |
| `deliver-drink-order` | Bezorging markeren | if-checks `order_id`, `action` | idem | nee |

### Email / Notifications
| Functie | Doel | Validatie | Env-variabelen | Rate limiting |
|---|---|---|---|---|
| `send-ticket-email` | Ticket-mail + PDF | if-checks `orderId` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `BASE_URL` | nee |
| `send-guest-ticket` | Guest mail | UUID checks | idem | nee |
| `send-table-guest` | Table-guest mail | if-checks | idem | nee |
| `send-password-reset-email` | Reset link mailen | email-regex | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `BASE_URL` | nee |
| `resend-ticket-email` | Mail opnieuw | UUID `ticket_id` regex | + `RESEND_API_KEY` etc | nee |
| `resend-guest-ticket-emails` | Guest-mails opnieuw | if-checks `order_id` | idem | nee |
| `resend-table-guest-email` | Tafel-mail opnieuw | if-checks `table_guest_id` | idem | nee |
| `send-whatsapp-notification` | WhatsApp notificatie | if-checks | + `WHATSAPP_API_KEY`, `WHATSAPP_PHONE`, `WHATSAPP_RECIPIENTS` | nee |

### Public / Misc
| Functie | Doel | Validatie | Env-variabelen | Rate limiting |
|---|---|---|---|---|
| `public-events` | Publieke events ophalen | brand-filter, event-id check | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | nee (in-memory 60s cache) |
| `upload-event-image` | Event poster/logo upload | mime-type + size checks | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | nee |
| `storageHealthCheck` | Storage-bucket health | n.v.t. | idem | nee |

**Samenvatting**: ~9 van 50 functies hebben expliciete rate limiting (`admin-otp`, `create-seat-order`, `create-table-order`, `create-ticket-checkout`, `create-drink-order`, `reserve-tickets`, `hold-seats` + `mollie-webhook` heeft idempotency-lock). Validatie is overwegend handmatige `if`-checks aangevuld met regex voor UUID, e-mail, tokenformaat en passwords. **Er wordt geen `zod` of vergelijkbaar schema-validatie-package gebruikt.**

---

## VRAAG 4 — Secrets in de frontend bundle

### Gebruikte `VITE_*` variabelen
- **`VITE_SUPABASE_URL`** — `src/lib/supabaseClient.ts:3`, `src/services/seatCheckoutService.ts:48,156`, `src/lib/checkoutClient.ts:116`, `src/lib/callEdge.ts:45`, `src/config/brand.ts:4`, `src/components/ScannerUsersManager.tsx:55,92,155,196,241,302`, `src/pages/PaymentSuccess.tsx:227`, `src/pages/TableReservation.tsx:153`, `src/pages/SuperAdmin.tsx:1838,1895,2290,2592`, `src/pages/Admin.tsx:649`, `src/pages/Scanner.tsx:68`, `src/pages/DrinksMenu.tsx:203`, `src/pages/BarOrders.tsx:178`, `src/lib/adminApi.ts:3`.
- **`VITE_SUPABASE_ANON_KEY`** — `src/lib/supabaseClient.ts:4`, `src/services/seatCheckoutService.ts:52,159,160`, `src/lib/checkoutClient.ts:117`, `src/pages/PaymentSuccess.tsx:225,230`, `src/pages/TableReservation.tsx:158`, `src/pages/DrinksMenu.tsx:204`.
- **`VITE_GOOGLE_MAPS_API_KEY`** — `src/pages/Location.tsx:13` (en als placeholder-tekst regel 151).

### `process.env` gebruik
**Geen treffers** in `src/`. Alle environment lookups gaan via `import.meta.env.VITE_*` (Vite-conventie).

### Hardgecodeerde keys / tokens
Grep `re_[A-Za-z0-9_]{16,}|sk_(live|test)_[A-Za-z0-9]+|service_role|eyJhbGc` over `src/`: **geen treffers**.

> **Bevinding:** geen Resend-keys (`re_…`), Stripe-keys (`sk_live_…`/`sk_test_…`), service-role-keys of JWT's hardgecodeerd in de frontend. De anon key in `VITE_SUPABASE_ANON_KEY` is per-design publiek (PostgREST + RLS gating) en hoort daar te staan. Google Maps key (indien gezet) is publiek te exposen mits HTTP-referrer-restriction is ingesteld in Google Cloud Console.

---

## VRAAG 5 — `holds` tabel (niet `seat_holds`)

### Komt de tabel `holds` voor in de codebase?
- **Migratie-SQL**: ja, gedefinieerd in 2 migraties:
  - `supabase/migrations/20251115022109_add_missing_floor_plan_tables.sql:85` — `CREATE TABLE IF NOT EXISTS holds (...)`
  - `supabase/migrations/20251221220953_add_missing_floor_plan_tables.sql:85` — duplicaat met identieke definitie

### Wordt deze tabel gelezen of geschreven?
Grep over `src/` en `supabase/functions/` op het exacte patroon `from('holds')` / `from(\"holds\")`: **geen treffers**.

De variabele `holds` in `src/services/seatService.ts:759,785,793` verwijst naar **lokale JavaScript-variabelen** die rijen voor de `seat_holds` tabel bevatten (zie regel 759-770: `.from('seat_holds').insert(holds)`). Niet de `holds` tabel zelf.

### Conclusie
**Ja, dit is dode code.** De tabel `holds` is via een migratie aangemaakt maar wordt nergens in frontend, services of edge functions geraadpleegd. Het hele hold-systeem werkt via `seat_holds`. Geen RPC's of triggers refereren ernaar voor zover gevonden in app-code.

> **Aanbeveling (geen actie genomen):** verifieer of er niets in DB-triggers, views of RPCs nog leunt op `holds`; zo niet, kan deze tabel in een latere migratie verwijderd worden om verwarring te voorkomen.

---

## VRAAG 6 — `seat_holds` lezen/schrijven door de frontend

### Frontend leest van `seat_holds`
- `src/services/seatPickerService.ts:54-65` — `fetchActiveHoldSeatIds()`:
  ```ts
  const sessionId = getSessionId();
  const { data, error } = await supabase
    .from('seat_holds')
    .select('seat_id')
    .eq('session_id', sessionId)
    .eq('event_id', eventId)
    .eq('status', 'held')
  ```
- `src/services/seatCheckoutService.ts:32-38` — `validateHoldsActive()`:
  ```ts
  .from('seat_holds')
    .select('id, seat_id')
    .eq('session_id', sessionId)
    .eq('event_id', eventId)
    .eq('status', 'held')
  ```
- `src/pages/SeatCheckout.tsx:206-212` — bij init checkout-page; filtert `.eq('session_id', sessionId)` etc.
- `src/pages/SeatCheckout.tsx:472-478` — vóór order-creatie verifieert actieve holds; `.eq('session_id', sessionId)`.
- `src/hooks/useAdminSeatRealtime.ts:127` — admin-side realtime presence (geen session-filter; admin context).

### Frontend schrijft naar `seat_holds`
- `src/services/seatService.ts:768-772` — `holdSeats()` insert:
  ```ts
  .from('seat_holds')
    .insert(holds)
    .select()
  ```
- `src/services/seatService.ts:795-798` — `releaseHolds()`:
  ```ts
  .from('seat_holds')
    .update({ status: 'released' })
    .in('id', holdIds);
  ```
- Indirect via RPC's: `extend_seat_holds` (`seatPickerService.ts:215`), `release_session_holds` (`seatPickerService.ts:226`), `holdSeatsAtomic` (RPC `hold_seats_atomic` aangeroepen vanuit `useSeatPickerState.ts:407`).

### Wordt `.eq('session_id', sessionId)` aan client-zijde toegepast?
**Ja, op alle leesplekken én op één schrijf-pad** — bevestigde locaties:
- `src/services/seatPickerService.ts:59` — read
- `src/services/seatCheckoutService.ts:35` — read
- `src/pages/SeatCheckout.tsx:209` — read
- `src/pages/SeatCheckout.tsx:475` — read
- `src/services/seatService.ts:763` — write (insert met `session_id` veld in payload)

> **Security-implicatie:** filtering op client-side is een UX-bescherming, geen security-bescherming — de echte gating moet in **RLS-policies** op `seat_holds` zitten. De anon-policy verlaagt schrijven via een rate-limit-RPC + atomaire RPC (`hold_seats_atomic`, migratie `20260329080309`). Voor lezen door anon zou de RLS van `seat_holds` idealiter geldige rijen alleen tonen aan de eigen `session_id`-houder; niet uit deze code-analyse na te gaan zonder migratie te lezen.

---

## VRAAG 7 — Order flow (stoel → bevestigde betaling)

### Stappen-overzicht
**Stap 1 — Klant kiest stoelen (UI)**
- Component: `src/pages/SeatPicker.tsx`
- Hook: `src/hooks/useSeatPickerState.ts`
- Selectie alleen client-side (`selectedIds: Set<string>`), max via `MAX_SEATS`-constant in `useSeatPickerState`.

**Stap 2 — Klant bevestigt selectie → atomaire hold**
- `useSeatPickerState.ts:392-451` — `confirmHold()` roept `holdSeatsAtomic([...selectedIds], eventId)` aan.
- RPC: `hold_seats_atomic` (migratie `20260329080309_create_hold_seats_atomic_function.sql`).
- **Tabellen gemuteerd**: `seat_holds` (insert rij met `session_id`, `expires_at`, `status='held'`), `seats` (status → `'reserved'`).
- Hold opgeslagen in `sessionStorage` via `saveHoldToStorage()` (`seatPickerService.ts:36-38`).

**Stap 3 — Navigeert naar checkout-pagina**
- `SeatPicker.tsx:44-60` — `handleNavigateCheckout()` vuurt FB Pixel `AddToCart` event en `onNavigate('seat-checkout?event=…')`.
- `SeatCheckout.tsx` mount → `init()` (regel ~190+):
  - Validates dat `seat_holds` voor session+event nog `'held'` zijn (`SeatCheckout.tsx:206-219`); zo niet, redirect terug.
  - Vuurt FB Pixel `InitiateCheckout` (regel 289-296).

**Stap 4 — Klant vult checkoutformulier in en submit**
- `SeatCheckout.tsx:470-478` — verifieert opnieuw dat `seat_holds` actief zijn (`session_id`-filter).
- `SeatCheckout.tsx:487-501` — roept `createSeatOrder({...})` aan.
- Service: `src/services/seatCheckoutService.ts:45-110` POST naar Edge Function `create-seat-order`.

**Stap 5 — Edge Function `create-seat-order` maakt order + Mollie payment**
- `supabase/functions/create-seat-order/index.ts:144-161` — RPC `create_seat_order_pending`:
  - **Tabellen gemuteerd**: `orders` (insert pending), `tickets` (insert pending rijen), `ticket_seats` (insert link order↔seat), `ticket_types.quantity_sold` (decrement), `seat_holds` (status update).
- `create-seat-order/index.ts` (regels later in de file) — bouwt Mollie payment via `mollieWithRetry()` (regel 36-76) → POST naar `https://api.mollie.com/v2/payments` met `metadata: { orderId, type: 'order' }`.
- Reagent: `redirectUrl` = Mollie checkout-URL.

**Stap 6 — Klant wordt geredirect naar Mollie**
- `SeatCheckout.tsx:506-522` — vóór redirect: FB Pixel `AddPaymentInfo` event met advanced matching.
- `SeatCheckout.tsx:524` — `window.location.href = result.checkoutUrl;` (Mollie hosted page).

**Stap 7 — Klant betaalt bij Mollie**
- Externe flow buiten codebase. Mollie redirectsneer onze `redirectUrl` (success page) en stuurt asynchroon webhook.

**Stap 8 — Mollie webhook arriveert**
- Endpoint: `supabase/functions/mollie-webhook/index.ts`
- Stappen:
  1. CORS / payment-id validatie (regel 211-227)
  2. Idempotency-lock via `webhook_logs` (regel 229-248)
  3. Verify met Mollie API (regel 250-263)
  4. Orderlookup (regel 278-282)
  5. Bij `payment.status === 'paid'` + `order.status in {pending, reserved}` (regel 314):

**Stap 9 — Order naar `paid`, seats naar `sold`**
- `mollie-webhook/index.ts:316-321` — `orders.status = 'paid'`, `paid_at`, `payment_method`, `payment_id`.
- `mollie-webhook/index.ts:323` — `tickets.status = 'valid'` (waar `status='pending'`).
- `mollie-webhook/index.ts:324` — `table_bookings.status = 'PAID'` (indien aanwezig).
- `mollie-webhook/index.ts:349-367` — voor `product_type === 'seat'`:
  - `seats.status = 'sold'` (regel 357)
  - `seat_holds.status = 'converted'` (regel 359-363)
- `mollie-webhook/index.ts:326-347` — FB CAPI Purchase fire (niet-blokkerend, met dedup `event_id = order.id`).

**Stap 10 — Bevestigingsmail + analytics + WhatsApp**
- `mollie-webhook/index.ts:399-476` — `ticket_orders` + `ticket_order_items` analytics-rows ingevoegd (idempotent op `order.order_number`).
- `mollie-webhook/index.ts:478-494` — voor table_bookings: `generate-table-qr` edge function-call.
- `mollie-webhook/index.ts:496-520` — `send-ticket-email` edge function aangeroepen met `{ orderId, resend: false }`.
- `mollie-webhook/index.ts:522-536` — `send-whatsapp-notification` edge function (alleen voor non-TABLE).
- `mollie-webhook/index.ts:600` — finale `webhook_logs.upsert(processed: true)`.

### Antwoorden op de specifieke deelvragen
- **Welke functies/componenten zijn betrokken?**
  Frontend: `SeatPicker`, `useSeatPickerState`, `SeatCheckout`, `CheckoutForm`, `seatPickerService`, `seatCheckoutService`, `seatService`. Edge: `hold-seats` (RPC `hold_seats_atomic`), `create-seat-order`, `create-payment` (niet altijd, hier inline in `create-seat-order`), `mollie-webhook`, `send-ticket-email`, `send-whatsapp-notification`, `generate-table-qr`.
- **Welke tabellen worden gemuteerd?**
  `seat_holds`, `seats`, `orders`, `tickets`, `ticket_seats`, `ticket_types` (quantity_sold), `webhook_logs`, `ticket_orders`, `ticket_order_items`, `table_bookings`.
- **Wanneer wordt de Mollie payment aangemaakt?**
  In **stap 5**, ín `create-seat-order` edge function direct ná RPC `create_seat_order_pending`, vóór dat de redirect-URL aan de browser teruggegeven wordt.
- **Wanneer worden seats van `'reserved'` naar `'sold'` gezet?**
  In **stap 9**, in `mollie-webhook/index.ts:357`, na bevestiging vanuit Mollie API dat de payment `paid` is.
- **Wanneer wordt de bevestigingsmail gestuurd?**
  In **stap 10**, vanuit `mollie-webhook/index.ts:496-520`, ná database-updates en FB CAPI dispatch (niet-blokkerend t.o.v. CAPI).

---

Geen bestaande bestanden gewijzigd.
