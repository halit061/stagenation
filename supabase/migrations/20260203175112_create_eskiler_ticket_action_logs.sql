/*
  # Create Eskiler Ticket Action Log Tables

  1. New Tables
    - `eskiler_email_logs`
      - `id` (uuid, primary key)
      - `ticket_id` (uuid, references tickets)
      - `email` (text, recipient email)
      - `action` (text, default 'resend')
      - `sent_at` (timestamptz, default now())
      - `admin_user_id` (uuid, admin who performed action)
    
    - `eskiler_ticket_actions`
      - `id` (uuid, primary key)
      - `ticket_id` (uuid, ticket that was acted upon)
      - `action` (text, action type like 'deleted')
      - `admin_user_id` (uuid, admin who performed action)
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on both tables
    - Only admins and superadmins can read/write these tables
*/

-- Create eskiler_email_logs table
CREATE TABLE IF NOT EXISTS public.eskiler_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  email text NOT NULL,
  action text DEFAULT 'resend',
  sent_at timestamptz DEFAULT now(),
  admin_user_id uuid,
  ticket_number text,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL
);

-- Create eskiler_ticket_actions table
CREATE TABLE IF NOT EXISTS public.eskiler_ticket_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid,
  ticket_number text,
  action text NOT NULL,
  admin_user_id uuid,
  created_at timestamptz DEFAULT now(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  details jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.eskiler_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eskiler_ticket_actions ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_eskiler_email_logs_ticket_id ON public.eskiler_email_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_eskiler_email_logs_admin_user_id ON public.eskiler_email_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_eskiler_ticket_actions_ticket_id ON public.eskiler_ticket_actions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_eskiler_ticket_actions_admin_user_id ON public.eskiler_ticket_actions(admin_user_id);

-- RLS Policies for eskiler_email_logs
CREATE POLICY "Admins can view eskiler_email_logs"
  ON public.eskiler_email_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'superadmin', 'super_admin', 'organizer')
    )
  );

CREATE POLICY "Admins can insert eskiler_email_logs"
  ON public.eskiler_email_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'superadmin', 'super_admin', 'organizer')
    )
  );

-- RLS Policies for eskiler_ticket_actions
CREATE POLICY "Admins can view eskiler_ticket_actions"
  ON public.eskiler_ticket_actions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'superadmin', 'super_admin', 'organizer')
    )
  );

CREATE POLICY "Admins can insert eskiler_ticket_actions"
  ON public.eskiler_ticket_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'superadmin', 'super_admin', 'organizer')
    )
  );
