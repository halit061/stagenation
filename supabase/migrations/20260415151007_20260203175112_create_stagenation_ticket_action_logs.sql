/*
  # Create StageNation Ticket Action Log Tables

  1. New Tables
    - `stagenation_email_logs` - logs email actions by admins on tickets
    - `stagenation_ticket_actions` - logs admin actions (delete, etc.) on tickets

  2. Security
    - Enable RLS on both tables
    - Only admins and superadmins can read/write these tables
*/

CREATE TABLE IF NOT EXISTS public.stagenation_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  email text NOT NULL,
  action text DEFAULT 'resend',
  sent_at timestamptz DEFAULT now(),
  admin_user_id uuid,
  ticket_number text,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.stagenation_ticket_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid,
  ticket_number text,
  action text NOT NULL,
  admin_user_id uuid,
  created_at timestamptz DEFAULT now(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  details jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.stagenation_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stagenation_ticket_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stagenation_email_logs_ticket_id ON public.stagenation_email_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_stagenation_email_logs_admin_user_id ON public.stagenation_email_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_stagenation_ticket_actions_ticket_id ON public.stagenation_ticket_actions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_stagenation_ticket_actions_admin_user_id ON public.stagenation_ticket_actions(admin_user_id);

CREATE POLICY "Admins can view stagenation_email_logs"
  ON public.stagenation_email_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role IN ('admin', 'superadmin', 'super_admin', 'organizer')));

CREATE POLICY "Admins can insert stagenation_email_logs"
  ON public.stagenation_email_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role IN ('admin', 'superadmin', 'super_admin', 'organizer')));

CREATE POLICY "Admins can view stagenation_ticket_actions"
  ON public.stagenation_ticket_actions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role IN ('admin', 'superadmin', 'super_admin', 'organizer')));

CREATE POLICY "Admins can insert stagenation_ticket_actions"
  ON public.stagenation_ticket_actions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role IN ('admin', 'superadmin', 'super_admin', 'organizer')));
