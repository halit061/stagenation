import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

interface AssignRoleRequest {
  email: string;
  role: string;
  brand?: string | null;
  event_id?: string | null;
}

async function findUserByEmail(supabase: any, email: string): Promise<any | null> {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    const users = data?.users || [];
    const found = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      return found;
    }

    if (users.length < perPage) {
      break;
    }

    page++;
    if (page > 100) {
      break;
    }
  }

  return null;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: callerRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .eq('is_active', true);

    const isSuperAdmin = callerRoles?.some(r =>
      r.role === 'super_admin' || r.role === 'superadmin'
    );

    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden - only super_admin can assign roles' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: AssignRoleRequest = await req.json();
    const { email, role, brand, event_id } = body;

    if (!email || !role) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and role are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validRoles = ['scanner', 'admin', 'super_admin', 'superadmin', 'organizer'];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const targetUser = await findUserByEmail(supabase, email);

    if (!targetUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not found in Auth' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: upsertError } = await supabase
      .from('user_roles')
      .upsert(
        {
          user_id: targetUser.id,
          role,
          brand: brand || null,
          event_id: event_id || null,
          is_active: true,
        },
        {
          onConflict: 'user_id,role',
          ignoreDuplicates: false,
        }
      );

    if (upsertError) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to assign role: ${upsertError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Role '${role}' assigned to ${email}`,
        user_id: targetUser.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
