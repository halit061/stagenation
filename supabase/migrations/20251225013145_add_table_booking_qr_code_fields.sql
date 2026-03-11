/*
  # Add QR Code Fields to Table Bookings

  1. Changes
    - Add `qr_payload` (jsonb) to store structured QR code data
    - Add `qr_code` (text) to optionally store the QR code image/SVG
    - Add `checked_in_at` (timestamptz) to track check-in time
    - Add `checked_in_by` (text) to track who performed the check-in
    - Add `check_in_count` (integer) to count check-in attempts
  
  2. QR Payload Format
    ```json
    {
      "v": 1,
      "type": "TABLE",
      "booking_id": "<uuid>",
      "event_id": "<uuid>",
      "table_id": "<uuid>"
    }
    ```
  
  3. Security
    - No RLS changes needed (table_bookings already has RLS enabled)
    - QR codes are generated server-side only
*/

-- Add QR code related fields to table_bookings
ALTER TABLE table_bookings 
ADD COLUMN IF NOT EXISTS qr_payload jsonb,
ADD COLUMN IF NOT EXISTS qr_code text,
ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
ADD COLUMN IF NOT EXISTS checked_in_by text,
ADD COLUMN IF NOT EXISTS check_in_count integer DEFAULT 0;

-- Create index for faster QR payload lookups
CREATE INDEX IF NOT EXISTS idx_table_bookings_qr_payload 
ON table_bookings USING gin (qr_payload);

-- Create index for check-in queries
CREATE INDEX IF NOT EXISTS idx_table_bookings_checked_in_at 
ON table_bookings(checked_in_at) 
WHERE checked_in_at IS NOT NULL;
