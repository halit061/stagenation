import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

interface UpdateUserRoleRequest {
  user_role_id: string;
  new_role: string;
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
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !requestingUser) {
      throw new Error('Unauthorized');
    }

    const { data: requesterRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('is_active', true);

    const isSuperAdmin = requesterRoles?.some(r => r.role === 'super_admin' || r.role === 'superadmin');
    const isAdmin = requesterRoles?.some(r => r.role === 'admin');

    if (!isSuperAdmin && !isAdmin) {
      throw new Error('Only super admins or admins can update user roles');
    }

    const body: UpdateUserRoleRequest = await req.json();
    const { user_role_id, new_role } = body;

    if (!user_role_id || !new_role) {
      throw new Error('user_role_id and new_role are required');
    }

    const validRoles = ['scanner', 'admin', 'super_admin'];
    if (!validRoles.includes(new_role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    const { data: targetRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('id', user_role_id)
      .maybeSingle();

    if (!isSuperAdmin) {
      if (new_role !== 'scanner') {
        throw new Error('Admins can only assign scanner role');
      }
      if (targetRole && targetRole.role !== 'scanner') {
        throw new Error('Admins can only modify scanner users');
      }
    }

    const { error: updateError } = await supabase
      .from('user_roles')
      .update({
        role: new_role,
        updated_at: new Date().toISOString()
      })
      .eq('id', user_role_id);

    if (updateError) {
      throw new Error(`Failed to update role: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Role updated successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in admin-update-user-role:', error);
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
