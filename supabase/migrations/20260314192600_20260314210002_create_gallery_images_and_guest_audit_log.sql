/*
  # Create gallery_images and guest_ticket_audit_log tables

  ## Problem
  SuperAdmin.tsx references these tables that don't exist in the database,
  causing runtime errors when the media management and guest audit tabs are used.

  ## New Tables

  ### gallery_images
  - Stores images for the public gallery page
  - `id` (uuid), `title` (text), `category` (text), `image_url` (text)
  - `display_order` (integer), `is_active` (boolean), `show_in_gallery` (boolean)
  - `created_at`, `updated_at` timestamps

  ### guest_ticket_audit_log
  - Tracks changes/actions on guest tickets for auditing
  - `id` (uuid), `event_id` (uuid), `ticket_id` (uuid nullable)
  - `action` (text), `actor_email` (text), `details` (jsonb)
  - `created_at` timestamp

  ## Security
  - RLS enabled on both tables
  - gallery_images: public read, admin write
  - guest_ticket_audit_log: admin read only, no direct write (service_role inserts)
*/

-- gallery_images table
CREATE TABLE IF NOT EXISTS public.gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  category text NOT NULL DEFAULT 'gallery',
  image_url text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  show_in_gallery boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active gallery images"
  ON public.gallery_images FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Admins can view all gallery images"
  ON public.gallery_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert gallery images"
  ON public.gallery_images FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update gallery images"
  ON public.gallery_images FOR UPDATE
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

CREATE POLICY "Admins can delete gallery images"
  ON public.gallery_images FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- guest_ticket_audit_log table
CREATE TABLE IF NOT EXISTS public.guest_ticket_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  ticket_id uuid,
  action text NOT NULL,
  actor_email text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.guest_ticket_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view guest audit log"
  ON public.guest_ticket_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_gallery_images_category ON public.gallery_images(category);
CREATE INDEX IF NOT EXISTS idx_gallery_images_display_order ON public.gallery_images(display_order);
CREATE INDEX IF NOT EXISTS idx_guest_audit_log_event_id ON public.guest_ticket_audit_log(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_audit_log_created_at ON public.guest_ticket_audit_log(created_at DESC);

NOTIFY pgrst, 'reload schema';
