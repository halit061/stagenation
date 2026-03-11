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
    const authHeader = req.headers.get('Authorization') || '';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[admin-update-drink-category] Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'MISSING_JWT',
          error: 'Missing Authorization header',
          details: 'Authorization header must be in format: Bearer <token>'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const token = authHeader.slice(7);

    const userSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const { data: { user }, error: userError } = await userSupabase.auth.getUser();

    if (userError || !user) {
      console.error('[admin-update-drink-category] Auth validation failed:', userError);
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'INVALID_JWT',
          error: 'Invalid or expired JWT token',
          details: userError ? userError.message : 'No user found'
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
      console.error('[admin-update-drink-category] No roles found for user');
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'NO_ROLES',
          error: 'No roles found',
          details: rolesError?.message || 'User has no assigned roles'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const isSuperAdmin = userRoles.some(r => r.role === 'super_admin');

    if (!isSuperAdmin) {
      console.error('[admin-update-drink-category] User is not super_admin');
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'FORBIDDEN',
          error: 'Insufficient permissions',
          details: 'super_admin role required'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body = await req.json();
    const { id, name_nl, name_tr, sort_order, is_active } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'id is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const updates: any = {};
    if (name_nl !== undefined) updates.name_nl = name_nl;
    if (name_tr !== undefined) updates.name_tr = name_tr;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: category, error: updateError } = await serviceSupabase
      .from('drink_categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ category }),
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