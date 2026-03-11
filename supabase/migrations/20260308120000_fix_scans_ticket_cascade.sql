-- ============================================================================
-- FIX: scans.ticket_id CASCADE → SET NULL
-- Preserves scan history when a ticket is deleted
-- ============================================================================

-- First allow NULL on the column
DO $$ BEGIN
  ALTER TABLE public.scans ALTER COLUMN ticket_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped drop NOT NULL: %', SQLERRM;
END $$;

-- Then change CASCADE to SET NULL
DO $$ BEGIN
  ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_ticket_id_fkey;
  ALTER TABLE public.scans ADD CONSTRAINT scans_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped scans.ticket_id: %', SQLERRM;
END $$;
