/*
  # Apply tribune position shifts with backup

  1. Backup
    - Creates `seat_position_backups` table to preserve original x/y per seat before any shift
    - Backs up only seats whose ticket_type belongs to one of the four tribune groups
    - Idempotent: re-running the migration will not duplicate backup rows
  2. Position updates
    - Tribune Kabouter Plop: dx=-13.5, dy=-7
    - Tribune Spotz-On: dx=-13.5, dy=+7
    - Tribune Maya De Bij: dx=+172, dy=-5.5
    - Tribune Samson & Marie: dx=-228, dy=+5.5
    - Plein groups, ticket_types, seat_sections, row_labels, seat_numbers and ids are NOT touched
  3. Security
    - RLS enabled on backup table
    - Only super_admin can read the backup table; nobody can modify it via PostgREST
*/

CREATE TABLE IF NOT EXISTS seat_position_backups (
  seat_id uuid PRIMARY KEY REFERENCES seats(id) ON DELETE CASCADE,
  original_x numeric NOT NULL,
  original_y numeric NOT NULL,
  ticket_type_name text,
  reason text,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE seat_position_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin can read seat backups" ON seat_position_backups;
CREATE POLICY "Super admin can read seat backups"
  ON seat_position_backups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'super_admin'
        AND COALESCE(ur.is_active, true) = true
    )
  );

INSERT INTO seat_position_backups (seat_id, original_x, original_y, ticket_type_name, reason)
SELECT s.id, s.x_position, s.y_position, tt.name, 'tribune_inward_shift_2026_04_26'
FROM seats s
JOIN ticket_types tt ON tt.id = s.ticket_type_id
WHERE tt.name IN (
  'Tribune Kabouter Plop',
  'Tribune Spotz-On',
  'Tribune Maya De Bij',
  'Tribune Samson & Marie'
)
ON CONFLICT (seat_id) DO NOTHING;

UPDATE seats s
SET x_position = s.x_position + 172,
    y_position = s.y_position - 5.5
FROM ticket_types tt
WHERE tt.id = s.ticket_type_id
  AND tt.name = 'Tribune Maya De Bij';

UPDATE seats s
SET x_position = s.x_position - 228,
    y_position = s.y_position + 5.5
FROM ticket_types tt
WHERE tt.id = s.ticket_type_id
  AND tt.name = 'Tribune Samson & Marie';

UPDATE seats s
SET x_position = s.x_position - 13.5,
    y_position = s.y_position - 7
FROM ticket_types tt
WHERE tt.id = s.ticket_type_id
  AND tt.name = 'Tribune Kabouter Plop';

UPDATE seats s
SET x_position = s.x_position - 13.5,
    y_position = s.y_position + 7
FROM ticket_types tt
WHERE tt.id = s.ticket_type_id
  AND tt.name = 'Tribune Spotz-On';
