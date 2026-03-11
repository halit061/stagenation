import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    // SECURITY: Require admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (supabaseUrl && supabaseServiceKey && supabaseAnonKey) {
      const jwtToken = authHeader.replace('Bearer ', '');
      // Reject anon key
      if (jwtToken === supabaseAnonKey) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Admin authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Only allow service role key or authenticated admin/super_admin
      if (jwtToken !== supabaseServiceKey) {
        const authClient = createClient(supabaseUrl, supabaseServiceKey);
        const { data: { user }, error: authError } = await authClient.auth.getUser(jwtToken);
        if (authError || !user) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Invalid or expired token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const { data: userRoles } = await authClient
          .from('user_roles')
          .select('role, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true);
        const isAdminUser = userRoles?.some(
          (r: { role: string }) => r.role === 'admin' || r.role === 'super_admin' || r.role === 'superadmin'
        );
        if (!isAdminUser) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Admin access required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    const hasUrl = !!supabaseUrl;
    const hasServiceKey = !!supabaseServiceKey;

    if (!hasUrl || !hasServiceKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Missing required environment variables',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: buckets, error: bucketsError } = await serviceClient.storage.listBuckets();

    if (bucketsError) {
      console.error('[storageHealthCheck] Bucket list error:', bucketsError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Failed to list buckets',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const bucketNames = buckets?.map((b) => b.name) || [];
    const hasEventImagesBucket = bucketNames.includes('event-images');

    return new Response(
      JSON.stringify({
        ok: true,
        bucketCount: bucketNames.length,
        hasEventImagesBucket,
        message: hasEventImagesBucket
          ? 'Storage is healthy'
          : 'Warning: event-images bucket not found',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[storageHealthCheck] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Unexpected error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
