import { supabase } from './supabaseClient';

interface UploadImageParams {
  eventId: string;
  file: File;
  imageType: 'poster' | 'logo';
  logoLabel?: string;
}

interface UploadImageResult {
  success: boolean;
  fullUrl?: string;
  thumbUrl?: string;
  uploadId?: string;
  posterPath?: string;
  error?: string;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// SECURITY: Upload permission is now checked via database roles, not hardcoded emails
export async function checkUploadPermission(): Promise<{ allowed: boolean; email?: string }> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user || !user.email) {
      return { allowed: false };
    }

    // Check user role from database instead of hardcoded email list
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const allowed = roles?.some(
      (r: { role: string }) => r.role === 'admin' || r.role === 'super_admin'
    ) ?? false;

    return { allowed, email: user.email };
  } catch (error) {
    console.error('[checkUploadPermission] Error:', error);
    return { allowed: false };
  }
}

function getFileExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext || 'jpg';
}

export async function uploadEventImage({
  eventId,
  file,
}: UploadImageParams): Promise<UploadImageResult> {
  try {
    const permission = await checkUploadPermission();
    if (!permission.allowed) {
      throw new Error('Geen rechten om afbeeldingen te uploaden');
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(
        `Ongeldig bestandstype: ${file.type}\n` +
        `Toegestaan: PNG, JPG, JPEG, WEBP`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `Bestand te groot: ${(file.size / 1024 / 1024).toFixed(2)} MB\n` +
        `Maximum: 5 MB`
      );
    }

    const ext = getFileExtension(file.name);
    const timestamp = Date.now();
    const storagePath = `events/${eventId}/poster-${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('event-images')
      .upload(storagePath, file, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      throw new Error(
        `Upload gefaald: ${uploadError.message}\n` +
        `Details: ${uploadError.name || 'Unknown error'}`
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from('event-images')
      .getPublicUrl(storagePath);

    const posterUrl = publicUrlData.publicUrl;

    const { error: dbError } = await supabase
      .from('events')
      .update({
        poster_url: posterUrl,
        poster_thumb_url: posterUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (dbError) {
      console.error('[uploadEventImage] Database update error:', dbError);
      throw new Error(
        `Upload geslaagd maar database update gefaald: ${dbError.message}`
      );
    }

    return {
      success: true,
      fullUrl: posterUrl,
      thumbUrl: posterUrl,
      posterPath: storagePath,
    };
  } catch (error: any) {
    console.error('[uploadEventImage] Upload error:', error);

    return {
      success: false,
      error: error.message || 'Upload gefaald',
    };
  }
}

export async function deleteEventLogo(logoId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('event_logos')
      .delete()
      .eq('id', logoId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Delete logo error:', error);
    return false;
  }
}

export async function reorderEventLogos(
  eventId: string,
  logoIds: string[]
): Promise<boolean> {
  try {
    // Update display_order for each logo
    const updates = logoIds.map((id, index) =>
      supabase
        .from('event_logos')
        .update({ display_order: index + 1 })
        .eq('id', id)
        .eq('event_id', eventId)
    );

    await Promise.all(updates);
    return true;
  } catch (error) {
    console.error('Reorder logos error:', error);
    return false;
  }
}
