import { createClient } from 'npm:@supabase/supabase-js@2';
import { Image } from 'npm:imagescript@1.3.0';
import { getCorsHeaders } from "../_shared/cors.ts";

interface UploadRequest {
  eventId: string;
  imageType: 'poster' | 'logo';
  imageData: string;
  fileName: string;
  logoLabel?: string;
}

async function resizeImage(buffer: Uint8Array, maxWidth: number): Promise<Uint8Array> {
  try {
    const image = await Image.decode(buffer);

    if (image.width > maxWidth) {
      const ratio = maxWidth / image.width;
      const newHeight = Math.round(image.height * ratio);
      const resized = image.resize(maxWidth, newHeight);
      return await resized.encodeJPEG(85);
    }

    return await image.encodeJPEG(85);
  } catch (error) {
    console.error('Image resize error:', error);
    throw new Error('Failed to process image');
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const base64Clean = base64.replace(/^data:image\/[a-z]+;base64,/, '');
  const binary = atob(base64Clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function getFileExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  // SECURITY: Only allow image extensions to prevent malicious file uploads
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return 'jpg';
  }
  return ext;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[upload-event-image] Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'MISSING_JWT',
          error: 'Missing Authorization header',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const token = authHeader.slice(7);

    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const { data: { user }, error: authError } = await userSupabase.auth.getUser();

    if (authError || !user) {
      console.error('[upload-event-image] Auth validation failed:', authError);
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'INVALID_JWT',
          error: 'Invalid or expired JWT token',
          details: authError ? authError.message : 'No user found',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userRole } = await serviceSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'admin'])
      .maybeSingle();

    if (!userRole) {
      console.error('[upload-event-image] User lacks admin permissions');
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'FORBIDDEN',
          error: 'Insufficient permissions',
          details: 'admin or super_admin role required',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body: UploadRequest = await req.json();
    const { eventId, imageType, imageData, fileName, logoLabel } = body;

    if (!eventId || !imageType || !imageData || !fileName) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Missing required fields',
          details: 'eventId, imageType, imageData, and fileName are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const sizeInMB = (imageData.length * 0.75) / (1024 * 1024);
    const maxSize = imageType === 'poster' ? 10 : 5;

    if (sizeInMB > maxSize) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `File too large. Max size: ${maxSize}MB`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const imageBytes = base64ToUint8Array(imageData);
    const ext = getFileExtension(fileName);

    const uploadId = crypto.randomUUID();

    const fullSize = imageType === 'poster' ? 1600 : 600;
    const thumbSize = imageType === 'poster' ? 400 : 200;

    const fullImage = await resizeImage(imageBytes, fullSize);
    const thumbImage = await resizeImage(imageBytes, thumbSize);

    const bucketName = 'event-images';
    const basePath = imageType === 'poster'
      ? `events/${eventId}/poster`
      : `events/${eventId}/logos/${uploadId}`;

    const fullPath = `${basePath}.${ext}`;
    const thumbPath = `${basePath}_thumb.${ext}`;

    const { error: fullError } = await serviceSupabase.storage
      .from(bucketName)
      .upload(fullPath, fullImage, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });

    if (fullError) {
      console.error('[upload-event-image] Full image upload error:', fullError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Failed to upload full image',
          details: fullError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { error: thumbError } = await serviceSupabase.storage
      .from(bucketName)
      .upload(thumbPath, thumbImage, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });

    if (thumbError) {
      console.error('[upload-event-image] Thumb image upload error:', thumbError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Failed to upload thumbnail',
          details: thumbError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: fullData } = serviceSupabase.storage
      .from(bucketName)
      .getPublicUrl(fullPath);

    const { data: thumbData } = serviceSupabase.storage
      .from(bucketName)
      .getPublicUrl(thumbPath);

    const fullUrl = fullData.publicUrl;
    const thumbUrl = thumbData.publicUrl;

    if (imageType === 'poster') {
      const { error: dbError } = await serviceSupabase
        .from('events')
        .update({
          poster_url: fullUrl,
          poster_thumb_url: thumbUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      if (dbError) {
        console.error('[upload-event-image] Database update error:', dbError);
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Failed to update event with poster URL',
            details: dbError.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } else {
      const { data: maxOrder } = await serviceSupabase
        .from('event_logos')
        .select('display_order')
        .eq('event_id', eventId)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const newOrder = (maxOrder?.display_order || 0) + 1;

      const { error: dbError } = await serviceSupabase
        .from('event_logos')
        .insert({
          id: uploadId,
          event_id: eventId,
          logo_url: fullUrl,
          logo_thumb_url: thumbUrl,
          label: logoLabel || null,
          display_order: newOrder,
        });

      if (dbError) {
        console.error('[upload-event-image] Database insert error:', dbError);
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Failed to insert logo record',
            details: dbError.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        imageType,
        fullUrl,
        thumbUrl,
        uploadId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[upload-event-image] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Unexpected error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
