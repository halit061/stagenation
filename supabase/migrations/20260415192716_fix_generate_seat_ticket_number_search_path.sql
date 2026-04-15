/*
  # Fix generate_seat_ticket_number search path

  1. Problem
    - The `generate_seat_ticket_number` trigger function uses `gen_random_bytes(8)` 
      from the pgcrypto extension
    - pgcrypto functions live in the `extensions` schema
    - The function's search_path only includes `public`, so `gen_random_bytes` is not found
    - This causes a 500 error when creating seat orders

  2. Fix
    - Recreate the function with `extensions` added to the search_path
    - This allows `gen_random_bytes` to be resolved correctly
*/

CREATE OR REPLACE FUNCTION public.generate_seat_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := 'SN-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
      LPAD(nextval('ticket_number_seq')::TEXT, 6, '0');
  END IF;
  IF NEW.qr_token IS NULL THEN
    NEW.qr_token := encode(gen_random_bytes(8), 'hex');
  END IF;
  IF NEW.ticket_code IS NULL THEN
    NEW.ticket_code := NEW.ticket_number;
  END IF;
  IF NEW.qr_data IS NULL THEN
    NEW.qr_data := 'https://stagenation.be/verify/' || NEW.qr_token;
  END IF;
  RETURN NEW;
END;
$$;