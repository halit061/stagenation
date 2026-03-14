/*
  # Create guest_tickets, guest_ticket_qrs, email_logs, table_guests tables

  ## Purpose
  These tables are actively used throughout the codebase (admin panel, edge functions,
  scanner) but were missing from the database.

  ## New Tables

  ### guest_tickets
  - Tickets sent manually by admins to guests (not purchased via checkout)
  - Links to orders for tracking, has persons_count for multi-person tickets

  ### guest_ticket_qrs
  - Individual QR codes for each person in a multi-person guest ticket
  - Each guest ticket can have multiple QR entries (one per person)

  ### email_logs
  - Tracks all outgoing emails (ticket emails, table guest emails, etc.)
  - Used by resend functions to check if emails were already sent

  ### table_guests
  - Individual guest records for table bookings
  - Each table booking can have multiple guests with their own QR code
*/

-- guest_tickets
CREATE TABLE IF NOT EXISTS public.guest_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  holder_name text NOT NULL,
  holder_email text NOT NULL,
  ticket_type_id uuid REFERENCES public.ticket_types(id) ON DELETE SET NULL,
  persons_count integer DEFAULT 1,
  send_mode text DEFAULT 'email',
  sent_by text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.guest_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view guest tickets"
  ON public.guest_tickets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert guest tickets"
  ON public.guest_tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update guest tickets"
  ON public.guest_tickets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can delete guest tickets"
  ON public.guest_tickets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- guest_ticket_qrs
CREATE TABLE IF NOT EXISTS public.guest_ticket_qrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_ticket_id uuid REFERENCES public.guest_tickets(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  person_index integer DEFAULT 1,
  name text,
  qr_data text,
  qr_code text,
  token text UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  used_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.guest_ticket_qrs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view guest QRs"
  ON public.guest_ticket_qrs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert guest QRs"
  ON public.guest_ticket_qrs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update guest QRs"
  ON public.guest_ticket_qrs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can delete guest QRs"
  ON public.guest_ticket_qrs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- email_logs
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  recipient_email text,
  subject text,
  template text,
  status text DEFAULT 'sent',
  provider_message_id text,
  error_message text,
  metadata jsonb DEFAULT '{}',
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email logs"
  ON public.email_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- table_guests
CREATE TABLE IF NOT EXISTS public.table_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_booking_id uuid REFERENCES public.table_bookings(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  guest_name text,
  guest_email text,
  qr_code text,
  qr_data text,
  token text UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  person_index integer DEFAULT 1,
  used_at timestamptz,
  email_sent boolean DEFAULT false,
  email_error text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.table_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view table guests"
  ON public.table_guests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert table guests"
  ON public.table_guests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update table guests"
  ON public.table_guests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can delete table guests"
  ON public.table_guests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guest_tickets_event_id ON public.guest_tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_tickets_order_id ON public.guest_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_guest_ticket_qrs_guest_ticket_id ON public.guest_ticket_qrs(guest_ticket_id);
CREATE INDEX IF NOT EXISTS idx_guest_ticket_qrs_order_id ON public.guest_ticket_qrs(order_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_order_id ON public.email_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_ticket_id ON public.email_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_table_guests_booking_id ON public.table_guests(table_booking_id);
CREATE INDEX IF NOT EXISTS idx_table_guests_event_id ON public.table_guests(event_id);

NOTIFY pgrst, 'reload schema';
