import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

interface ListEventsRequest {
  brand?: string;
  include_inactive?: boolean;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let filters: ListEventsRequest = {};
    if (req.method === 'POST') {
      try {
        filters = await req.json();
      } catch (e) {
      }
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role, brand, event_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const isSuperAdmin = roles?.some(r => r.role === 'super_admin') || false;

    let query = supabase
      .from('events')
      .select('id, name, slug, brand, venue_name, venue_address, event_start, event_end, scan_open_at, scan_close_at, is_active, created_at');

    if (!filters.include_inactive) {
      query = query.eq('is_active', true);
    }

    if (filters.brand) {
      query = query.eq('brand', filters.brand);
    }

    if (!isSuperAdmin && roles) {
      const accessibleEventIds = roles
        .filter(r => r.event_id !== null)
        .map(r => r.event_id);

      if (accessibleEventIds.length > 0) {
        query = query.in('id', accessibleEventIds);
      } else {
        return new Response(
          JSON.stringify({ events: [] }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    query = query.order('event_start', { ascending: false });

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch events' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        events: events || [],
        is_super_admin: isSuperAdmin,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('List accessible events error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});