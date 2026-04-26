/*
  # Add RPC for ticket availability

  1. New Function
    - `get_ticket_availability(p_event_id uuid)` returns ticket_type_id and available_count
    - Counts directly from `seats` table where status='available' and is_active=true
    - Single source of truth for public availability display
  2. Security
    - SECURITY INVOKER so it respects existing RLS
    - GRANT EXECUTE to anon and authenticated
*/

CREATE OR REPLACE FUNCTION public.get_ticket_availability(p_event_id uuid)
RETURNS TABLE (ticket_type_id uuid, available_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.ticket_type_id, COUNT(*)::bigint
  FROM public.seats s
  JOIN public.ticket_types tt ON tt.id = s.ticket_type_id
  WHERE tt.event_id = p_event_id
    AND s.is_active = true
    AND s.status = 'available'
    AND s.ticket_type_id IS NOT NULL
  GROUP BY s.ticket_type_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_ticket_availability(uuid) TO anon, authenticated;