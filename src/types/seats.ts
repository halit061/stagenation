export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VenueLayout {
  id: string;
  venue_id: string | null;
  event_id: string | null;
  brand_id: string | null;
  name: string;
  layout_data: Record<string, unknown>;
  is_template: boolean;
  source_template_id: string | null;
  created_at: string;
  updated_at: string;
  background_image_url: string | null;
  background_opacity: number;
  background_position_x: number;
  background_position_y: number;
  background_width: number | null;
  background_height: number | null;
  background_rotation: number;
  background_locked: boolean;
}

export interface TicketTypeSection {
  id: string;
  ticket_type_id: string;
  section_id: string;
  created_at: string;
}

export interface TicketType {
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
  metadata: Record<string, unknown>;
  created_at: string;
  service_fee_mode: string;
  service_fee_fixed: number;
  service_fee_percent: number;
  theme: Record<string, unknown> | null;
  phase_group: string | null;
  phase_order: number;
}

export interface SeatPickerConfig {
  event_id: string;
  layout_id: string;
  ticket_type_id: string | null;
  allowed_section_ids: string[];
  max_seats: number;
}

export type SeatOrientation = 'top' | 'bottom' | 'left' | 'right';

export interface SeatSection {
  id: string;
  layout_id: string;
  name: string;
  section_type: 'tribune' | 'plein';
  capacity: number;
  color: string;
  price_category: string | null;
  price_amount: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  orientation: SeatOrientation;
  rows_count: number;
  seats_per_row: number;
  row_curve: number;
  sort_order: number;
  is_active: boolean;
  start_row_label: string;
  numbering_direction: NumberingDirection;
  row_label_direction: RowLabelDirection;
  row_spacing: number;
  seat_spacing: number;
  created_at: string;
  updated_at: string;
}

export type SeatStatus = 'available' | 'blocked' | 'reserved' | 'sold';
export type SeatType = 'regular' | 'wheelchair' | 'companion' | 'vip' | 'restricted_view';

export interface Seat {
  id: string;
  section_id: string;
  row_label: string;
  seat_number: number;
  seat_label: string;
  x_position: number;
  y_position: number;
  status: SeatStatus;
  price_override: number | null;
  seat_type: SeatType;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export type SeatHoldStatus = 'held' | 'released' | 'converted';

export interface SeatHold {
  id: string;
  seat_id: string;
  event_id: string;
  user_id: string | null;
  session_id: string | null;
  held_at: string;
  expires_at: string;
  status: SeatHoldStatus;
  created_at: string;
}

export interface TicketSeat {
  id: string;
  ticket_id: string;
  seat_id: string;
  event_id: string;
  price_paid: number;
  assigned_at: string;
}

export interface SeatWithSection extends Seat {
  section: SeatSection;
}

export interface SectionWithSeats extends SeatSection {
  seats: Seat[];
}

export type NumberingDirection = 'left-to-right' | 'right-to-left' | 'center-out';
export type RowLabelDirection = 'top-to-bottom' | 'bottom-to-top';

export interface GenerateSeatsConfig {
  section_id: string;
  rows: number;
  seats_per_row: number;
  start_row_label: string;
  numbering_direction: NumberingDirection;
  row_label_direction?: RowLabelDirection;
  row_spacing: number;
  seat_spacing: number;
  curve: number;
  orientation?: SeatOrientation;
}

export interface SeatSelectionState {
  layout_id: string;
  event_id: string;
  selected_seat_ids: string[];
  hold_ids: string[];
  total_price: number;
  expires_at: string | null;
}

export type BestAvailableStrategy =
  | 'best'
  | 'front'
  | 'center'
  | 'cheapest'
  | 'expensive';

export interface BestAvailablePreferences {
  section_id?: string;
  price_category?: string;
  seat_type?: SeatType;
  keep_together?: boolean;
  strategy?: BestAvailableStrategy;
  exclude_seat_ids?: string[];
}
