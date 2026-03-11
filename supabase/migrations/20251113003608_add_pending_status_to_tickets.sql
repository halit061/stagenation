/*
  # Add pending status to tickets

  1. Changes
    - Add 'pending' to the ticket status enum values
    - This allows tickets to be created in pending state before payment confirmation
  
  2. Security
    - No RLS changes needed
*/

-- Drop the existing constraint
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;

-- Add new constraint with pending status
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check 
  CHECK (status IN ('pending', 'sold', 'valid', 'used', 'revoked', 'transferred'));
