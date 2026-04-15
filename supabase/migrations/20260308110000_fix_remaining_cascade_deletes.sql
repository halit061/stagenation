-- ============================================================================
-- FIX: Remaining CASCADE DELETE constraints missed in first migration
-- ============================================================================

-- refund_claims.order_id → RESTRICT
DO $$ BEGIN
  ALTER TABLE public.refund_claims DROP CONSTRAINT IF EXISTS refund_claims_order_id_fkey;
  ALTER TABLE public.refund_claims ADD CONSTRAINT refund_claims_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped refund_claims.order_id: %', SQLERRM;
END $$;

-- refund_claims.event_id → RESTRICT
DO $$ BEGIN
  ALTER TABLE public.refund_claims DROP CONSTRAINT IF EXISTS refund_claims_event_id_fkey;
  ALTER TABLE public.refund_claims ADD CONSTRAINT refund_claims_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped refund_claims.event_id: %', SQLERRM;
END $$;

-- refund_protection_config.event_id → RESTRICT
DO $$ BEGIN
  ALTER TABLE public.refund_protection_config DROP CONSTRAINT IF EXISTS refund_protection_config_event_id_fkey;
  ALTER TABLE public.refund_protection_config ADD CONSTRAINT refund_protection_config_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped refund_protection_config.event_id: %', SQLERRM;
END $$;

-- table_guests.ticket_id → SET NULL (preserve guest record when ticket deleted)
DO $$ BEGIN
  ALTER TABLE public.table_guests DROP CONSTRAINT IF EXISTS table_guests_ticket_id_fkey;
  ALTER TABLE public.table_guests ADD CONSTRAINT table_guests_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped table_guests.ticket_id: %', SQLERRM;
END $$;

-- stagenation_email_logs.ticket_id → SET NULL (preserve email log when ticket deleted)
DO $$ BEGIN
  ALTER TABLE public.stagenation_email_logs DROP CONSTRAINT IF EXISTS stagenation_email_logs_ticket_id_fkey;
  ALTER TABLE public.stagenation_email_logs ADD CONSTRAINT stagenation_email_logs_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipped stagenation_email_logs.ticket_id: %', SQLERRM;
END $$;
