-- Create gallery_images table for media management
CREATE TABLE IF NOT EXISTS public.gallery_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text,
  category text NOT NULL,
  image_url text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

-- Public read access for active images
CREATE POLICY "gallery_images_public_read" ON public.gallery_images
  FOR SELECT
  USING (is_active = true);

-- Admin full access
CREATE POLICY "gallery_images_admin_all" ON public.gallery_images
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
        AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
        AND is_active = true
    )
  );

-- Index for ordering
CREATE INDEX idx_gallery_images_display_order ON public.gallery_images (display_order);
CREATE INDEX idx_gallery_images_category ON public.gallery_images (category);
