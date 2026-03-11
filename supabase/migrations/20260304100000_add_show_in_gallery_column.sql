-- Add show_in_gallery column to gallery_images
ALTER TABLE public.gallery_images ADD COLUMN IF NOT EXISTS show_in_gallery boolean DEFAULT true;

-- Set existing hero images to not show in gallery by default
UPDATE public.gallery_images SET show_in_gallery = false WHERE category = 'hero';
