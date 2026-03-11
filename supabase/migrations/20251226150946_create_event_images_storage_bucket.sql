/*
  # Create Event Images Storage Bucket

  1. Storage
    - Create "event-images" bucket for event posters and logos
    - Set bucket to public for read access
    - Configure proper size limits and file types

  2. Security (RLS Policies)
    - Allow authenticated admins to upload images
    - Allow authenticated admins to update images (upsert)
    - Allow authenticated admins to delete images
    - Allow public read access to all images

  3. Notes
    - Bucket is public for easy image access
    - Only admins can upload/modify/delete
    - Supports JPG, PNG, WEBP formats
    - Max file size handled at application level
*/

-- Create the event-images bucket if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE name = 'event-images'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'event-images',
      'event-images',
      true,
      10485760, -- 10MB max
      ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    );
  END IF;
END $$;

-- Drop existing policies if they exist (to allow recreation)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can upload event images" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can update event images" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete event images" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can view event images" ON storage.objects;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Policy 1: Allow admins to upload (INSERT) images
CREATE POLICY "Admins can upload event images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-images'
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  )
);

-- Policy 2: Allow admins to update images (for upsert operations)
CREATE POLICY "Admins can update event images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  )
)
WITH CHECK (
  bucket_id = 'event-images'
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  )
);

-- Policy 3: Allow admins to delete images
CREATE POLICY "Admins can delete event images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  )
);

-- Policy 4: Allow public read access to all images in the bucket
CREATE POLICY "Anyone can view event images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-images');
