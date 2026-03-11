import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

export async function verifySession(): Promise<{
  valid: boolean;
  session: any | null;
  error?: string;
}> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      return { valid: false, session: null, error: error.message };
    }

    if (!session) {
      return { valid: false, session: null, error: 'No session' };
    }

    return { valid: true, session };
  } catch (error: any) {
    return { valid: false, session: null, error: error.message };
  }
}

export async function ensureValidSession(): Promise<{
  valid: boolean;
  session: any | null;
  error?: string;
}> {
  const sessionCheck = await verifySession();

  if (!sessionCheck.valid) {
    if (typeof window !== 'undefined') {
      window.location.href = '/#/login';
    }
  }

  return sessionCheck;
}

export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          name: string;
          slug: string;
          brand: string;
          brand_slug: string | null;
          description: string | null;
          location: string;
          location_address: string;
          start_date: string;
          end_date: string;
          is_active: boolean;
          poster_url: string | null;
          poster_thumb_url: string | null;
          poster_updated_at: string | null;
          metadata: any;
          created_at: string;
          updated_at: string;
          venue_map_config: any;
        };
        Insert: Omit<Database['public']['Tables']['events']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['events']['Insert']>;
      };
      ticket_types: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          description: string | null;
          price: number;
          quantity_total: number;
          quantity_sold: number;
          sale_start: string | null;
          sale_end: string | null;
          is_active: boolean;
          show_remaining_tickets: boolean;
          remaining_display_threshold: number | null;
          service_fee_mode: 'none' | 'fixed' | 'percent';
          service_fee_fixed: number;
          service_fee_percent: number;
          color: string | null;
          theme: any;
          metadata: any;
          created_at: string;
          phase_group: string | null;
          phase_order: number;
        };
      };
      orders: {
        Row: {
          id: string;
          event_id: string;
          order_number: string;
          payer_email: string;
          payer_name: string;
          payer_phone: string | null;
          total_amount: number;
          status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
          payment_provider: string;
          payment_id: string | null;
          payment_method: string | null;
          promo_code: string | null;
          discount_amount: number;
          service_fee_total_cents: number;
          platform_fee_total_cents: number;
          provider_fee_total_cents: number;
          net_revenue_cents: number;
          metadata: any;
          created_at: string;
          updated_at: string;
          paid_at: string | null;
        };
      };
      tickets: {
        Row: {
          id: string;
          order_id: string;
          event_id: string;
          ticket_type_id: string;
          ticket_number: string;
          token: string;
          token_expires_at: string | null;
          status: 'sold' | 'valid' | 'used' | 'revoked' | 'transferred';
          holder_name: string | null;
          holder_email: string | null;
          qr_data: string | null;
          issued_at: string;
          used_at: string | null;
          revoked_at: string | null;
          revoked_reason: string | null;
          metadata: any;
        };
      };
      scans: {
        Row: {
          id: string;
          ticket_id: string;
          scanner_id: string | null;
          event_id: string;
          result: 'valid' | 'already_used' | 'invalid' | 'revoked' | 'expired';
          location_id: string | null;
          device_info: any;
          latitude: number | null;
          longitude: number | null;
          scanned_at: string;
          metadata: any;
        };
      };
      scanners: {
        Row: {
          id: string;
          user_id: string | null;
          event_id: string | null;
          name: string;
          role: 'scanner' | 'supervisor' | 'admin';
          device_info: any;
          is_active: boolean;
          active_until: string | null;
          last_scan_at: string | null;
          created_at: string;
        };
      };
      promo_codes: {
        Row: {
          id: string;
          event_id: string;
          code: string;
          discount_type: 'percentage' | 'fixed';
          discount_value: number;
          max_uses: number | null;
          used_count: number;
          valid_from: string | null;
          valid_until: string | null;
          is_active: boolean;
          created_at: string;
        };
      };
      gallery_images: {
        Row: {
          id: string;
          title: string | null;
          category: string;
          image_url: string;
          display_order: number;
          is_active: boolean;
          show_in_gallery: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['gallery_images']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['gallery_images']['Insert']>;
      };
      floorplan_tables: {
        Row: {
          id: string;
          event_id: string;
          table_number: string;
          label: string | null;
          x: number;
          y: number;
          width: number;
          height: number;
          rotation: number;
          shape: string;
          seats: number;
          capacity: number;
          price: number;
          status: string;
          manual_status: string | null;
          is_vip: boolean;
          color: string | null;
          table_type: string | null;
          package_id: string | null;
          included_items: any;
          included_people: number | null;
          created_at: string;
          updated_at: string;
        };
      };
      table_bookings: {
        Row: {
          id: string;
          event_id: string;
          table_id: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string | null;
          guests: number;
          status: string;
          payment_id: string | null;
          total_amount: number;
          special_requests: string | null;
          created_at: string;
          updated_at: string;
          paid_at: string | null;
        };
      };
      table_packages: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          description: string | null;
          price: number;
          base_price: number;
          included_items: any;
          included_people: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      venue_zones: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          color: string;
          ticket_type_id: string | null;
          zone_type: 'polygon' | 'rect' | 'ellipse';
          svg_path: string | null;
          x: number;
          y: number;
          width: number;
          height: number;
          rotation: number;
          label_x: number | null;
          label_y: number | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
      };
    };
  };
};
