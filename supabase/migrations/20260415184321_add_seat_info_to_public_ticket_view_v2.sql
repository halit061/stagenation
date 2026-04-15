/*
  # Add seat info to public_ticket_view

  1. Modified Views
    - `public_ticket_view` - Dropped and recreated with seat assignment information
      - All existing columns preserved
      - New: `seat_section_name` (text) - Name of the seat section
      - New: `seat_row_label` (text) - Row label (e.g. "A", "B")
      - New: `seat_number` (integer) - Seat number within the row

  2. Important Notes
    - Seat info comes from ticket_seats (live purchases) OR guest_ticket_qrs (guest tickets)
    - Only position data is exposed - no sensitive info
    - COALESCE picks whichever source has data
    - View grants are re-applied to maintain access
*/

DROP VIEW IF EXISTS public_ticket_view;

CREATE VIEW public_ticket_view AS
SELECT
  t.id,
  t.public_token,
  t.ticket_number,
  t.holder_name,
  t.holder_email,
  t.status,
  t.qr_data,
  t.qr_code,
  t.issued_at,
  t.used_at,
  t.metadata,
  tt.name AS ticket_type_name,
  tt.theme AS ticket_type_theme,
  tt.color AS ticket_type_color,
  e.name AS event_name,
  e.start_date AS event_start_date,
  e.end_date AS event_end_date,
  e.event_start,
  e.event_end,
  e.location AS event_location,
  e.venue_name AS event_venue_name,
  e.poster_url AS event_poster_url,
  COALESCE(sec.name, gq.section_name) AS seat_section_name,
  COALESCE(s.row_label, gq.row_label) AS seat_row_label,
  COALESCE(s.seat_number, gq.seat_number) AS seat_number
FROM tickets t
LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
LEFT JOIN events e ON e.id = t.event_id
LEFT JOIN LATERAL (
  SELECT ts2.seat_id
  FROM ticket_seats ts2
  WHERE ts2.ticket_id = t.id
  LIMIT 1
) ts_lat ON true
LEFT JOIN seats s ON s.id = ts_lat.seat_id
LEFT JOIN seat_sections sec ON sec.id = s.section_id
LEFT JOIN LATERAL (
  SELECT gqr.section_name, gqr.row_label, gqr.seat_number
  FROM guest_ticket_qrs gqr
  WHERE gqr.order_id = t.order_id
  AND gqr.seat_id IS NOT NULL
  LIMIT 1
) gq ON ts_lat.seat_id IS NULL
WHERE t.public_token IS NOT NULL;

GRANT SELECT ON public_ticket_view TO anon;
GRANT SELECT ON public_ticket_view TO authenticated;
GRANT SELECT ON public_ticket_view TO service_role;
