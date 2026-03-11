import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

interface CacheEntry {
  data: unknown;
  expiry: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const brand = url.searchParams.get('brand') || '';
    const eventId = url.searchParams.get('id') || '';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (eventId) {
      const cacheKey = `event:${eventId}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60, s-maxage=60',
          },
        });
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data: event, error } = await supabase
        .from('events')
        .select('id, name, slug, brand_slug, start_date, end_date, location, location_address, venue_name, poster_url, logo_url, is_active')
        .eq('id', eventId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch event' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!event) {
        return new Response(
          JSON.stringify({ error: 'Event not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: ticketTypes } = await supabase
        .from('ticket_types')
        .select('id, name, description, price, quantity_total, is_active, theme')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('price', { ascending: true });

      const result = { event, ticket_types: ticketTypes || [] };
      setCache(cacheKey, result);

      return new Response(JSON.stringify(result), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, s-maxage=60',
        },
      });
    }

    const cacheKey = `events:list:${brand}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, s-maxage=60',
        },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    let query = supabase
      .from('events')
      .select('id, name, slug, brand_slug, start_date, end_date, location, location_address, venue_name, poster_url, logo_url, is_active')
      .eq('is_active', true)
      .gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true });

    if (brand) {
      query = query.eq('brand_slug', brand);
    }

    const { data: events, error } = await query;

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch events' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = { events: events || [] };
    setCache(cacheKey, result);

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });

  } catch (error) {
    console.error('public-events error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
