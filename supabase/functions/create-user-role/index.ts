import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

interface CreateUserRoleRequest {
  email: string;
  role: string;
  brand?: string | null;
  event_id?: string | null;
  password?: string | null;
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(randomBytes[i] % chars.length);
  }
  return password + '!';
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
      console.error(`[findUserByEmail] Error listing users:`, error.message);
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
      console.error('[AUTH] No authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !requestingUser) {
      console.error('[AUTH] Invalid token:', authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: requesterRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('is_active', true);


    const isSuperAdmin = requesterRoles?.some(r => r.role === 'super_admin' || r.role === 'superadmin');
    const isAdmin = requesterRoles?.some(r => r.role === 'admin');

    if (!isSuperAdmin && !isAdmin) {
      console.error('[AUTH] User is not super admin or admin');
      return new Response(
        JSON.stringify({ success: false, error: 'Only super admins or admins can create user roles' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: CreateUserRoleRequest = await req.json();
    const { email, role, brand, event_id, password: customPassword } = body;

    if (!email || !role) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and role are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email format' }),
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

    if (customPassword) {
      if (customPassword.length < 12) {
        return new Response(
          JSON.stringify({ success: false, error: 'Wachtwoord moet minimaal 12 tekens bevatten' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!/[A-Z]/.test(customPassword) || !/[a-z]/.test(customPassword) ||
          !/[0-9]/.test(customPassword) || !/[^A-Za-z0-9]/.test(customPassword)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Wachtwoord moet hoofdletters, kleine letters, cijfers en speciale tekens bevatten' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!isSuperAdmin && role !== 'scanner') {
      console.error('[AUTH] Admin tried to create non-scanner role:', role);
      return new Response(
        JSON.stringify({ success: false, error: 'Admins can only create scanner users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let userId: string;
    let tempPassword: string | null = null;
    let isNewUser = false;

    const existingUser = await findUserByEmail(supabase, email);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      tempPassword = customPassword || generateTempPassword();

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

      if (createError) {
        console.error('[USER] Create error:', createError.message);

        if (createError.message?.includes('already been registered') ||
            createError.message?.includes('already exists')) {
          const retryUser = await findUserByEmail(supabase, email);
          if (retryUser) {
            userId = retryUser.id;
            tempPassword = null;
          } else {
            return new Response(
              JSON.stringify({
                success: false,
                error: `User exists but could not be found. Please try again or contact support.`
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          return new Response(
            JSON.stringify({ success: false, error: `Failed to create user: ${createError.message}` }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else if (newUser?.user) {
        userId = newUser.user.id;
        isNewUser = true;
      } else {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create user: No user returned' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: existingRoleExact } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .eq('role', role)
      .maybeSingle();

    if (existingRoleExact) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'User already has this role',
          user_id: userId,
          user_email: email,
          temp_password: null,
          is_new_user: false,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: insertError } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role,
        brand: brand || null,
        event_id: event_id || null,
        is_active: true,
      });

    if (insertError) {
      console.error('[ROLE] Insert error:', insertError.message);

      if (insertError.message?.includes('duplicate') || insertError.code === '23505') {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Role already exists for this user',
            user_id: userId,
            user_email: email,
            temp_password: isNewUser ? tempPassword : null,
            is_new_user: isNewUser,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: `Failed to assign role: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Do not log PII

    // SECURITY: Only return temp password for new users so admin can share it.
    // The password is generated server-side with crypto.getRandomValues and is
    // only returned once. After this response, it cannot be retrieved again.
    return new Response(
      JSON.stringify({
        success: true,
        message: isNewUser
          ? 'New user created and role assigned. Share the temporary password securely.'
          : 'Role assigned to existing user',
        user_id: userId,
        user_email: email,
        temp_password: isNewUser ? tempPassword : null,
        is_new_user: isNewUser,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('========================================');
    console.error('ERROR in create-user-role:', error);
    console.error('========================================');
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});