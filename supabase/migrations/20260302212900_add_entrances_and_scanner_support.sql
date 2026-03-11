/*
  # Add Entrances and Scanner Support

  ## Summary
  Adds entrance management and scanner tracking for BizimEvents ticket scanning.

  ## New Tables
  1. `entrances`
     - `id` (uuid, primary key)
     - `event_id` (uuid, FK to events)
     - `name` (text) - entrance label e.g. "Hoofdingang", "VIP ingang"
     - `created_at` (timestamptz)

  ## Modified Tables
  1. `ticket_types`
     - New column: `entrance_id` (uuid, nullable FK to entrances) - which entrance this ticket type uses
     - New column: `color` (text, nullable) - display color for scanner UI

  2. `tickets`
     - New column: `scanned_entrance_id` (uuid, nullable FK to entrances)
     - New column: `scan_device_id` (text, nullable)
     - NOTE: ticket_type_id, scanned_by, scanned_at already exist - skipped

  ## New Indexes
  - `idx_tickets_qr_data` on tickets(qr_data)
  - `idx_tickets_ticket_type_id` on tickets(ticket_type_id)
  - `idx_tickets_scanned_at` on tickets(scanned_at)
  - NOTE: idx_tickets_event_id, idx_tickets_ticket_number, idx_tickets_qr_code already exist - skipped

  ## Security
  - RLS enabled on entrances
  - Admins/organizers can manage entrances for their events
  - Authenticated users can read entrances (needed by scanner)
*/

-- ============================================================
-- 1. Create entrances table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.entrances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entrances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read entrances"
  ON public.entrances
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert entrances for their events"
  ON public.entrances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'organizer', 'superadmin', 'super_admin')
        AND (user_roles.event_id = entrances.event_id OR user_roles.event_id IS NULL)
    )
  );

CREATE POLICY "Admins can update entrances for their events"
  ON public.entrances
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'organizer', 'superadmin', 'super_admin')
        AND (user_roles.event_id = entrances.event_id OR user_roles.event_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'organizer', 'superadmin', 'super_admin')
        AND (user_roles.event_id = entrances.event_id OR user_roles.event_id IS NULL)
    )
  );

CREATE POLICY "Admins can delete entrances for their events"
  ON public.entrances
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'organizer', 'superadmin', 'super_admin')
        AND (user_roles.event_id = entrances.event_id OR user_roles.event_id IS NULL)
    )
  );

-- ============================================================
-- 2. Add entrance_id and color to ticket_types
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'entrance_id'
  ) THEN
    ALTER TABLE public.ticket_types
      ADD COLUMN entrance_id uuid REFERENCES public.entrances(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'color'
  ) THEN
    ALTER TABLE public.ticket_types ADD COLUMN color text;
  END IF;
END $$;

-- ============================================================
-- 3. Add scanner tracking columns to tickets
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'scanned_entrance_id'
  ) THEN
    ALTER TABLE public.tickets
      ADD COLUMN scanned_entrance_id uuid REFERENCES public.entrances(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'scan_device_id'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN scan_device_id text;
  END IF;
END $$;

-- ============================================================
-- 4. Add missing indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tickets_qr_data
  ON public.tickets(qr_data);

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id
  ON public.tickets(ticket_type_id);

CREATE INDEX IF NOT EXISTS idx_tickets_scanned_at
  ON public.tickets(scanned_at);

CREATE INDEX IF NOT EXISTS idx_entrances_event_id
  ON public.entrances(event_id);

CREATE INDEX IF NOT EXISTS idx_ticket_types_entrance_id
  ON public.ticket_types(entrance_id);
