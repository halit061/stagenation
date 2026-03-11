import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

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
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const userSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: userError } = await userSupabase.auth.getUser();

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'INVALID_JWT',
          error: userError ? `Invalid JWT: ${userError.message}` : 'Unauthorized - no user found'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userRoles, error: rolesError } = await serviceSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError || !userRoles || userRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No roles found' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const isSuperAdmin = userRoles.some(r => r.role === 'super_admin');

    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body = await req.json();
    const { event_id, drink_id, stock_initial, stock_current } = body;

    if (!event_id || !drink_id) {
      return new Response(
        JSON.stringify({ error: 'event_id and drink_id are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: existingStock } = await serviceSupabase
      .from('drink_stock')
      .select('id')
      .eq('event_id', event_id)
      .eq('drink_id', drink_id)
      .maybeSingle();

    let stock;
    let error;

    if (existingStock) {
      const updates: any = {};
      if (stock_initial !== undefined) updates.stock_initial = stock_initial;
      if (stock_current !== undefined) updates.stock_current = stock_current;

      const result = await serviceSupabase
        .from('drink_stock')
        .update(updates)
        .eq('id', existingStock.id)
        .select()
        .single();

      stock = result.data;
      error = result.error;
    } else {
      const result = await serviceSupabase
        .from('drink_stock')
        .insert({
          event_id,
          drink_id,
          stock_initial: stock_initial || 0,
          stock_current: stock_current !== undefined ? stock_current : (stock_initial || 0),
        })
        .select()
        .single();

      stock = result.data;
      error = result.error;
    }

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ stock }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});