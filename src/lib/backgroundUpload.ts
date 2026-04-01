import { supabase } from './supabaseClient';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function validateBackgroundFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Ongeldig bestandstype. Toegestaan: PDF, PNG, JPG, SVG`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `Bestand te groot (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB`;
  }
  return null;
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf';
}

export async function uploadBackgroundImage(
  layoutId: string,
  fileOrBlob: File | Blob,
  originalName: string
): Promise<string> {
  const ext = originalName.includes('.pdf') ? 'png' : originalName.split('.').pop()?.toLowerCase() || 'png';
  const timestamp = Date.now();
  const storagePath = `layouts/${layoutId}/background-${timestamp}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('floorplan-backgrounds')
    .upload(storagePath, fileOrBlob, {
      upsert: true,
      contentType: fileOrBlob instanceof File ? fileOrBlob.type : 'image/png',
    });

  if (uploadError) {
    throw new Error(`Upload gefaald: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from('floorplan-backgrounds')
    .getPublicUrl(storagePath);

  return publicUrlData.publicUrl;
}

export async function deleteBackgroundImage(imageUrl: string): Promise<void> {
  const pathMatch = imageUrl.match(/floorplan-backgrounds\/(.+)$/);
  if (!pathMatch) return;

  const { error } = await supabase.storage
    .from('floorplan-backgrounds')
    .remove([pathMatch[1]]);

  if (error) {
    console.error('Failed to delete background image:', error);
  }
}

export interface BackgroundSettings {
  background_image_url: string | null;
  background_opacity: number;
  background_position_x: number;
  background_position_y: number;
  background_width: number | null;
  background_height: number | null;
  background_rotation: number;
  background_locked: boolean;
}

export async function saveBackgroundSettings(
  layoutId: string,
  settings: Partial<BackgroundSettings>
): Promise<void> {
  const { error } = await supabase
    .from('venue_layouts')
    .update(settings)
    .eq('id', layoutId);

  if (error) throw error;
}
