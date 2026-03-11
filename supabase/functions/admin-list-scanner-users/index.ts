import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

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
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !requestingUser) {
      throw new Error('Unauthorized');
    }

    const { data: requesterRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .in('role', ['super_admin', 'superadmin'])
      .eq('is_active', true)
      .maybeSingle();

    if (!requesterRole) {
      throw new Error('Only super admins can list scanner users');
    }

    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*')
      .in('role', ['scanner', 'admin'])
      .order('created_at', { ascending: false });

    if (rolesError) {
      throw new Error(`Failed to fetch user roles: ${rolesError.message}`);
    }

    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      throw new Error(`Failed to list users: ${usersError.message}`);
    }

    const scannerUsers = userRoles?.map(role => {
      const authUser = users.find(u => u.id === role.user_id);
      return {
        id: role.id,
        user_id: role.user_id,
        email: authUser?.email || 'Unknown',
        role: role.role,
        is_active: role.is_active,
        event_id: role.event_id,
        created_at: role.created_at,
        last_sign_in_at: authUser?.last_sign_in_at || null,
      };
    }) || [];

    return new Response(
      JSON.stringify({
        success: true,
        users: scannerUsers,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in admin-list-scanner-users:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
