/*
  # Fix gallery_images public read access

  ## Summary
  The homepage loads hero images from gallery_images for all visitors including
  anonymous users. The existing SELECT policy only allows authenticated users,
  so anonymous visitors cannot see the hero background images.

  This migration adds a public SELECT policy for active gallery images so the
  homepage hero background works for all visitors.
*/

CREATE POLICY "Anyone can view active gallery images"
  ON public.gallery_images FOR SELECT
  TO anon
  USING (is_active = true);
