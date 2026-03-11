-- Add phase system to ticket_types for sequential unlock
-- phase_group: groups related phases (e.g., "golden_circle", "regular")
-- phase_order: sequence within group (0 = always available, 1 = first phase, 2 = next, etc.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'phase_group'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN phase_group text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'phase_order'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN phase_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ticket_types_phase
  ON ticket_types(event_id, phase_group, phase_order);
