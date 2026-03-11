import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

interface ToggleUserActiveRequest {
  user_role_id: string;
  is_active: boolean;
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

    const { data: requesterRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('role', 'super_admin')
      .eq('is_active', true)
      .maybeSingle();

    if (!requesterRole) {
      throw new Error('Only super admins can toggle user active status');
    }

    const body: ToggleUserActiveRequest = await req.json();
    const { user_role_id, is_active } = body;

    if (!user_role_id || is_active === undefined) {
      throw new Error('user_role_id and is_active are required');
    }

    const { error: updateError } = await supabase
      .from('user_roles')
      .update({
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', user_role_id);

    if (updateError) {
      throw new Error(`Failed to update user status: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in admin-toggle-user-active:', error);
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
