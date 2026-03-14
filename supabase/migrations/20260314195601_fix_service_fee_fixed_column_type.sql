/*
  # Fix service_fee_fixed column type in ticket_types

  ## Problem
  The `service_fee_fixed` column in `ticket_types` is stored as `integer`,
  but the UI sends decimal euro values like 3.49, causing a PostgreSQL error:
  "invalid input syntax for type integer: '3.49'"

  ## Changes
  - `ticket_types.service_fee_fixed`: changed from `integer` to `numeric(10,4)`
    to support decimal euro amounts (e.g. 3.49)

  ## Notes
  - Existing integer values are safely cast to numeric with no data loss
  - `service_fee_percent` is already `numeric`, no change needed
  - `price` remains integer (stored in cents) — not touched
*/

ALTER TABLE public.ticket_types
  ALTER COLUMN service_fee_fixed TYPE numeric(10,4) USING service_fee_fixed::numeric;

NOTIFY pgrst, 'reload schema';
