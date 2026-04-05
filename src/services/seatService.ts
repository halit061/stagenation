import { supabase } from '../lib/supabaseClient';
import type {
  Brand,
  VenueLayout,
  SeatSection,
  Seat,
  SeatHold,
  SeatStatus,
  SeatWithSection,
  GenerateSeatsConfig,
  BestAvailablePreferences,
  TicketTypeSection,
  TicketType,
} from '../types/seats';

async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Niet geautoriseerd');
  return session;
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export async function getActiveBrands(): Promise<Brand[]> {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Layout CRUD
// ---------------------------------------------------------------------------

export async function getAllLayouts(): Promise<VenueLayout[]> {
  const { data, error } = await supabase
    .from('venue_layouts')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getLayoutsByBrand(brandId: string): Promise<VenueLayout[]> {
  const { data, error } = await supabase
    .from('venue_layouts')
    .select('*')
    .eq('brand_id', brandId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTemplates(brandId?: string): Promise<VenueLayout[]> {
  let query = supabase
    .from('venue_layouts')
    .select('*')
    .eq('is_template', true)
    .order('name');
  if (brandId) query = query.eq('brand_id', brandId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getEventLayouts(brandId?: string): Promise<VenueLayout[]> {
  let query = supabase
    .from('venue_layouts')
    .select('*')
    .eq('is_template', false)
    .not('event_id', 'is', null)
    .order('updated_at', { ascending: false });
  if (brandId) query = query.eq('brand_id', brandId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function copyTemplateForEvent(
  templateId: string,
  eventId: string,
  newName?: string,
): Promise<string> {
  await requireAuth();
  const { data, error } = await supabase.rpc('copy_template_for_event', {
    p_template_id: templateId,
    p_event_id: eventId,
    p_new_name: newName ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function getEventsList(): Promise<Array<{ id: string; name: string; start_date: string; slug: string }>> {
  const { data, error } = await supabase
    .from('events')
    .select('id, name, start_date, slug')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTicketTypesForEvent(eventId: string): Promise<TicketType[]> {
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as TicketType[];
}

export async function createTicketType(tt: {
  event_id: string;
  name: string;
  price: number;
  description?: string;
  quantity_total?: number;
  sale_start?: string;
  sale_end?: string;
}): Promise<TicketType> {
  await requireAuth();
  const { data, error } = await supabase
    .from('ticket_types')
    .insert({
      event_id: tt.event_id,
      name: tt.name,
      price: tt.price,
      description: tt.description ?? null,
      quantity_total: tt.quantity_total ?? 0,
      sale_start: tt.sale_start ?? null,
      sale_end: tt.sale_end ?? null,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TicketType;
}

export async function getLayoutByEvent(eventId: string): Promise<VenueLayout | null> {
  const { data, error } = await supabase
    .from('venue_layouts')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLayoutById(layoutId: string): Promise<VenueLayout | null> {
  const { data, error } = await supabase
    .from('venue_layouts')
    .select('*')
    .eq('id', layoutId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveLayout(
  layout: Partial<VenueLayout> & Pick<VenueLayout, 'name'>
): Promise<VenueLayout> {
  await requireAuth();

  if (layout.id) {
    const updatePayload: Record<string, unknown> = {
      name: layout.name,
      venue_id: layout.venue_id,
      event_id: layout.event_id,
      layout_data: layout.layout_data ?? {},
      brand_id: layout.brand_id,
      is_template: layout.is_template,
    };
    if (layout.background_image_url !== undefined) updatePayload.background_image_url = layout.background_image_url;
    if (layout.background_opacity !== undefined) updatePayload.background_opacity = layout.background_opacity;
    if (layout.background_position_x !== undefined) updatePayload.background_position_x = layout.background_position_x;
    if (layout.background_position_y !== undefined) updatePayload.background_position_y = layout.background_position_y;
    if (layout.background_width !== undefined) updatePayload.background_width = layout.background_width;
    if (layout.background_height !== undefined) updatePayload.background_height = layout.background_height;
    if (layout.background_rotation !== undefined) updatePayload.background_rotation = layout.background_rotation;
    if (layout.background_locked !== undefined) updatePayload.background_locked = layout.background_locked;

    const { data, error } = await supabase
      .from('venue_layouts')
      .update(updatePayload)
      .eq('id', layout.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('venue_layouts')
    .insert({
      name: layout.name,
      venue_id: layout.venue_id ?? null,
      event_id: layout.event_id ?? null,
      layout_data: layout.layout_data ?? {},
      brand_id: layout.brand_id ?? null,
      is_template: layout.is_template ?? false,
      source_template_id: layout.source_template_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLayout(layoutId: string): Promise<void> {
  await requireAuth();
  const { error } = await supabase
    .from('venue_layouts')
    .delete()
    .eq('id', layoutId);
  if (error) throw error;
}

export async function duplicateLayout(
  sourceId: string,
  newName: string
): Promise<VenueLayout> {
  await requireAuth();

  const source = await getLayoutById(sourceId);
  if (!source) throw new Error('Layout niet gevonden');

  const { data: newLayout, error: layoutErr } = await supabase
    .from('venue_layouts')
    .insert({
      name: newName,
      venue_id: source.venue_id,
      event_id: null,
      layout_data: source.layout_data,
    })
    .select()
    .single();
  if (layoutErr) throw layoutErr;

  const sections = await getSectionsByLayout(sourceId);
  for (const sec of sections) {
    const { data: newSec, error: secErr } = await supabase
      .from('seat_sections')
      .insert({
        layout_id: newLayout.id,
        name: sec.name,
        section_type: sec.section_type,
        capacity: sec.capacity,
        color: sec.color,
        price_category: sec.price_category,
        price_amount: sec.price_amount,
        position_x: sec.position_x,
        position_y: sec.position_y,
        width: sec.width,
        height: sec.height,
        rotation: sec.rotation,
        orientation: sec.orientation,
        rows_count: sec.rows_count,
        seats_per_row: sec.seats_per_row,
        row_curve: sec.row_curve,
        sort_order: sec.sort_order,
        is_active: true,
        start_row_label: sec.start_row_label || 'A',
        numbering_direction: sec.numbering_direction || 'left-to-right',
        row_label_direction: sec.row_label_direction || 'top-to-bottom',
        row_spacing: sec.row_spacing || 35,
        seat_spacing: sec.seat_spacing || 25,
      })
      .select()
      .single();
    if (secErr) throw secErr;

    const seats = await getSeatsBySection(sec.id);
    if (seats.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < seats.length; i += BATCH) {
        const batch = seats.slice(i, i + BATCH).map((s) => ({
          section_id: newSec.id,
          row_label: s.row_label,
          seat_number: s.seat_number,
          x_position: s.x_position,
          y_position: s.y_position,
          status: 'available' as const,
          seat_type: s.seat_type,
          price_override: s.price_override,
          metadata: s.metadata,
          is_active: true,
        }));
        const { error: seatErr } = await supabase.from('seats').insert(batch);
        if (seatErr) throw seatErr;
      }
    }
  }

  return newLayout;
}

// ---------------------------------------------------------------------------
// Section CRUD
// ---------------------------------------------------------------------------

export async function getSectionsByLayout(layoutId: string): Promise<SeatSection[]> {
  const { data, error } = await supabase
    .from('seat_sections')
    .select('*')
    .eq('layout_id', layoutId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createSection(
  section: Omit<SeatSection, 'id' | 'created_at' | 'updated_at'>
): Promise<SeatSection> {
  await requireAuth();
  const { data, error } = await supabase
    .from('seat_sections')
    .insert(section)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSection(
  id: string,
  updates: Partial<Omit<SeatSection, 'id' | 'created_at' | 'updated_at'>>
): Promise<SeatSection> {
  await requireAuth();
  const { data, error } = await supabase
    .from('seat_sections')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSection(id: string): Promise<void> {
  await requireAuth();
  const { error } = await supabase
    .from('seat_sections')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Seat queries
// ---------------------------------------------------------------------------

export async function getSeatsBySection(sectionId: string): Promise<Seat[]> {
  const { data, error } = await supabase
    .from('seats')
    .select('*')
    .eq('section_id', sectionId)
    .eq('is_active', true)
    .order('row_label', { ascending: true })
    .order('seat_number', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getSeatsByLayout(layoutId: string): Promise<SeatWithSection[]> {
  const { data: sections, error: secErr } = await supabase
    .from('seat_sections')
    .select('id')
    .eq('layout_id', layoutId)
    .eq('is_active', true);
  if (secErr) throw secErr;
  if (!sections || sections.length === 0) return [];

  const sectionIds = sections.map((s) => s.id);

  const { data: seats, error: seatErr } = await supabase
    .from('seats')
    .select('*, section:seat_sections(*)')
    .in('section_id', sectionIds)
    .eq('is_active', true)
    .order('row_label', { ascending: true })
    .order('seat_number', { ascending: true });
  if (seatErr) throw seatErr;
  return (seats ?? []) as SeatWithSection[];
}

// ---------------------------------------------------------------------------
// Seat generation
// ---------------------------------------------------------------------------

function nextRowLabel(current: string): string {
  if (/^\d+$/.test(current)) return String(Number(current) + 1);
  const chars = current.split('');
  let carry = true;
  for (let i = chars.length - 1; i >= 0 && carry; i--) {
    const code = chars[i].charCodeAt(0);
    if (code < 90) {
      chars[i] = String.fromCharCode(code + 1);
      carry = false;
    } else {
      chars[i] = 'A';
    }
  }
  if (carry) chars.unshift('A');
  return chars.join('');
}

export async function generateSeats(config: GenerateSeatsConfig): Promise<Seat[]> {
  await requireAuth();

  const {
    section_id,
    rows,
    seats_per_row,
    start_row_label,
    numbering_direction,
    row_label_direction = 'top-to-bottom',
    row_spacing,
    seat_spacing,
    curve,
    orientation = 'top',
  } = config;

  const { error: delErr } = await supabase
    .from('seats')
    .delete()
    .eq('section_id', section_id);
  if (delErr) throw delErr;

  const isVertical = orientation === 'left' || orientation === 'right';

  const newSeats: Array<{
    section_id: string;
    row_label: string;
    seat_number: number;
    x_position: number;
    y_position: number;
    status: SeatStatus;
    seat_type: string;
  }> = [];

  const rowLabels: string[] = [];
  let rl = start_row_label;
  for (let r = 0; r < rows; r++) {
    rowLabels.push(rl);
    rl = nextRowLabel(rl);
  }
  if (row_label_direction === 'bottom-to-top') {
    rowLabels.reverse();
  }

  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < seats_per_row; s++) {
      let xPos: number;
      let yPos: number;

      if (!isVertical) {
        const centerOffset = s - (seats_per_row - 1) / 2;
        xPos = centerOffset * seat_spacing;
        const baseCurve = curve * r * r * 0.5;
        const yCurve = baseCurve * Math.abs(centerOffset) / ((seats_per_row - 1) / 2 || 1);
        yPos = orientation === 'top'
          ? r * row_spacing + yCurve
          : (rows - 1 - r) * row_spacing + yCurve;
      } else {
        const centerOffset = s - (seats_per_row - 1) / 2;
        yPos = centerOffset * seat_spacing;
        const baseCurve = curve * r * r * 0.5;
        const xCurve = baseCurve * Math.abs(centerOffset) / ((seats_per_row - 1) / 2 || 1);
        xPos = orientation === 'right'
          ? r * row_spacing + xCurve
          : (rows - 1 - r) * row_spacing + xCurve;
      }

      let seatNum: number;
      if (numbering_direction === 'right-to-left') {
        seatNum = seats_per_row - s;
      } else if (numbering_direction === 'center-out') {
        const mid = Math.floor(seats_per_row / 2);
        seatNum = s <= mid ? mid - s + 1 : s - mid + (seats_per_row % 2 === 0 ? 1 : 0);
      } else {
        seatNum = s + 1;
      }

      newSeats.push({
        section_id,
        row_label: rowLabels[r],
        seat_number: seatNum,
        x_position: xPos,
        y_position: yPos,
        status: 'available',
        seat_type: 'regular',
      });
    }
  }

  const BATCH_SIZE = 500;
  const allInserted: Seat[] = [];

  for (let i = 0; i < newSeats.length; i += BATCH_SIZE) {
    const batch = newSeats.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('seats')
      .insert(batch)
      .select();
    if (error) throw error;
    if (data) allInserted.push(...data);
  }

  await supabase
    .from('seat_sections')
    .update({ capacity: newSeats.length, rows_count: rows, seats_per_row })
    .eq('id', section_id);

  return allInserted;
}

// ---------------------------------------------------------------------------
// Seat bulk operations
// ---------------------------------------------------------------------------

export async function updateSeatStatus(
  seatIds: string[],
  status: SeatStatus
): Promise<void> {
  await requireAuth();
  const { error } = await supabase
    .from('seats')
    .update({ status })
    .in('id', seatIds);
  if (error) throw error;
}

export async function updateSeatPrice(
  seatIds: string[],
  priceOverride: number | null
): Promise<void> {
  await requireAuth();
  const { error } = await supabase
    .from('seats')
    .update({ price_override: priceOverride })
    .in('id', seatIds);
  if (error) throw error;
}

export async function updateSeat(
  seatIds: string[],
  updates: Partial<Pick<Seat, 'status' | 'seat_type' | 'price_override'>>
): Promise<void> {
  await requireAuth();
  const { error } = await supabase
    .from('seats')
    .update(updates)
    .in('id', seatIds);
  if (error) throw error;
}

export async function deleteSeatsById(seatIds: string[]): Promise<void> {
  await requireAuth();
  const { error } = await supabase
    .from('seats')
    .delete()
    .in('id', seatIds);
  if (error) throw error;
}

export async function insertSeats(
  seats: Array<{
    section_id: string;
    row_label: string;
    seat_number: number;
    x_position: number;
    y_position: number;
    status: SeatStatus;
    seat_type: string;
  }>
): Promise<Seat[]> {
  await requireAuth();
  const { data, error } = await supabase
    .from('seats')
    .insert(seats)
    .select();
  if (error) throw error;
  return data ?? [];
}

export async function updateSeatNumbers(
  updates: Array<{ id: string; seat_number: number }>
): Promise<void> {
  await requireAuth();
  for (const u of updates) {
    const { error } = await supabase
      .from('seats')
      .update({ seat_number: u.seat_number })
      .eq('id', u.id);
    if (error) throw error;
  }
}

export async function updateSectionCapacity(sectionId: string, capacity: number): Promise<void> {
  await requireAuth();
  const { error } = await supabase
    .from('seat_sections')
    .update({ capacity })
    .eq('id', sectionId);
  if (error) throw error;
}

export async function updateSeatPositions(
  updates: Array<{ id: string; x_position: number; y_position: number }>
): Promise<void> {
  await requireAuth();
  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await Promise.all(
      batch.map(u =>
        supabase
          .from('seats')
          .update({ x_position: u.x_position, y_position: u.y_position })
          .eq('id', u.id)
      )
    );
  }
}

export async function deleteSeatsBySection(sectionId: string): Promise<void> {
  await requireAuth();
  const { error } = await supabase
    .from('seats')
    .delete()
    .eq('section_id', sectionId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Hold management
// ---------------------------------------------------------------------------

export async function holdSeats(
  seatIds: string[],
  eventId: string,
  userId: string | null,
  sessionId: string | null,
  holdMinutes = 10
): Promise<SeatHold[]> {
  await supabase.rpc('release_expired_holds');

  const { data: allowed } = await supabase.rpc('check_seat_hold_rate_limit', {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  if (!allowed) throw new Error('Te veel reserveringen. Probeer het later opnieuw.');

  const { data: seats, error: checkErr } = await supabase
    .from('seats')
    .select('id, status')
    .in('id', seatIds)
    .eq('is_active', true);
  if (checkErr) throw checkErr;

  const unavailable = (seats ?? []).filter((s) => s.status !== 'available');
  if (unavailable.length > 0) {
    throw new Error('Een of meer stoelen zijn niet meer beschikbaar');
  }

  if ((seats ?? []).length !== seatIds.length) {
    throw new Error('Een of meer stoelen niet gevonden');
  }

  const expiresAt = new Date(Date.now() + holdMinutes * 60_000).toISOString();

  const holds = seatIds.map((seat_id) => ({
    seat_id,
    event_id: eventId,
    user_id: userId,
    session_id: sessionId,
    expires_at: expiresAt,
    status: 'held' as const,
  }));

  const { data: holdData, error: holdErr } = await supabase
    .from('seat_holds')
    .insert(holds)
    .select();
  if (holdErr) throw holdErr;

  const { error: statusErr } = await supabase
    .from('seats')
    .update({ status: 'reserved' })
    .in('id', seatIds);
  if (statusErr) throw statusErr;

  return holdData ?? [];
}

export async function releaseHolds(holdIds: string[]): Promise<void> {
  const { data: holds, error: fetchErr } = await supabase
    .from('seat_holds')
    .select('seat_id')
    .in('id', holdIds)
    .eq('status', 'held');
  if (fetchErr) throw fetchErr;

  const seatIds = (holds ?? []).map((h) => h.seat_id);

  const { error: updateErr } = await supabase
    .from('seat_holds')
    .update({ status: 'released' })
    .in('id', holdIds);
  if (updateErr) throw updateErr;

  if (seatIds.length > 0) {
    const { error: seatErr } = await supabase
      .from('seats')
      .update({ status: 'available' })
      .in('id', seatIds);
    if (seatErr) throw seatErr;
  }
}

// ---------------------------------------------------------------------------
// Best-available algorithm
// ---------------------------------------------------------------------------

export async function findBestAvailable(
  layoutId: string,
  count: number,
  preferences: BestAvailablePreferences = {}
): Promise<Seat[]> {
  const { data: sections, error: secErr } = await supabase
    .from('seat_sections')
    .select('*')
    .eq('layout_id', layoutId)
    .eq('is_active', true);
  if (secErr) throw secErr;
  if (!sections || sections.length === 0) return [];

  let filteredSections = sections;
  if (preferences.section_id) {
    filteredSections = sections.filter((s) => s.id === preferences.section_id);
  }
  if (preferences.price_category) {
    filteredSections = filteredSections.filter(
      (s) => s.price_category === preferences.price_category
    );
  }

  const sectionIds = filteredSections.map((s) => s.id);

  const { data: seats, error: seatErr } = await supabase
    .from('seats')
    .select('*')
    .in('section_id', sectionIds)
    .eq('status', 'available')
    .eq('is_active', true)
    .order('row_label', { ascending: true })
    .order('seat_number', { ascending: true });
  if (seatErr) throw seatErr;
  if (!seats || seats.length === 0) return [];

  let available = seats as Seat[];
  if (preferences.seat_type) {
    available = available.filter((s) => s.seat_type === preferences.seat_type);
  }

  const sectionMap = new Map(filteredSections.map((s) => [s.id, s]));

  const scored = available.map((seat) => {
    const section = sectionMap.get(seat.section_id);
    const sectionW = section?.width ?? 200;
    const sectionH = section?.height ?? 150;

    const centerX = sectionW / 2;
    const centerY = sectionH / 2;
    const dx = seat.x_position - centerX;
    const dy = seat.y_position - centerY;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
    const centerScore = 1 - distFromCenter / (maxDist || 1);

    const frontScore = 1 - seat.y_position / (sectionH || 1);

    const score = centerScore * 0.6 + frontScore * 0.4;
    return { seat, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (preferences.keep_together && count > 1) {
    const byRow = new Map<string, typeof scored>();
    for (const item of scored) {
      const key = `${item.seat.section_id}::${item.seat.row_label}`;
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key)!.push(item);
    }

    let bestGroup: typeof scored | null = null;
    let bestGroupScore = -1;

    for (const rowSeats of byRow.values()) {
      rowSeats.sort((a, b) => a.seat.seat_number - b.seat.seat_number);

      for (let i = 0; i <= rowSeats.length - count; i++) {
        let contiguous = true;
        for (let j = 1; j < count; j++) {
          if (
            rowSeats[i + j].seat.seat_number !==
            rowSeats[i + j - 1].seat.seat_number + 1
          ) {
            contiguous = false;
            break;
          }
        }
        if (!contiguous) continue;

        const group = rowSeats.slice(i, i + count);
        const groupScore = group.reduce((sum, g) => sum + g.score, 0) / count;
        if (groupScore > bestGroupScore) {
          bestGroupScore = groupScore;
          bestGroup = group;
        }
      }
    }

    if (bestGroup) return bestGroup.map((g) => g.seat);
  }

  return scored.slice(0, count).map((s) => s.seat);
}

// ---------------------------------------------------------------------------
// Ticket Type ↔ Section linking
// ---------------------------------------------------------------------------

export async function getSectionsForTicketType(ticketTypeId: string): Promise<TicketTypeSection[]> {
  const { data, error } = await supabase
    .from('ticket_type_sections')
    .select('*')
    .eq('ticket_type_id', ticketTypeId);
  if (error) throw error;
  return data ?? [];
}

export async function getLinkedSectionIds(ticketTypeId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('ticket_type_sections')
    .select('section_id')
    .eq('ticket_type_id', ticketTypeId);
  if (error) throw error;
  return (data ?? []).map(r => r.section_id);
}

export async function linkTicketTypeToSections(
  ticketTypeId: string,
  sectionIds: string[],
): Promise<void> {
  await requireAuth();
  const { error: delErr } = await supabase
    .from('ticket_type_sections')
    .delete()
    .eq('ticket_type_id', ticketTypeId);
  if (delErr) throw delErr;

  if (sectionIds.length === 0) return;

  const rows = sectionIds.map(section_id => ({
    ticket_type_id: ticketTypeId,
    section_id,
  }));
  const { error } = await supabase
    .from('ticket_type_sections')
    .insert(rows);
  if (error) throw error;
}

export async function unlinkTicketTypeFromSection(
  ticketTypeId: string,
  sectionId: string,
): Promise<void> {
  await requireAuth();
  const { error } = await supabase
    .from('ticket_type_sections')
    .delete()
    .eq('ticket_type_id', ticketTypeId)
    .eq('section_id', sectionId);
  if (error) throw error;
}

export async function getAllTicketTypeSectionsForEvent(eventId: string): Promise<TicketTypeSection[]> {
  const { data: ttRows, error: ttErr } = await supabase
    .from('ticket_types')
    .select('id')
    .eq('event_id', eventId);
  if (ttErr) throw ttErr;
  const ttIds = (ttRows ?? []).map(r => r.id);
  if (ttIds.length === 0) return [];

  const { data, error } = await supabase
    .from('ticket_type_sections')
    .select('id, ticket_type_id, section_id, created_at')
    .in('ticket_type_id', ttIds);
  if (error) throw error;
  return (data ?? []) as TicketTypeSection[];
}

// ---------------------------------------------------------------------------
// Realtime subscription
// ---------------------------------------------------------------------------

export function subscribeToSeatChanges(
  layoutId: string,
  callback: (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Partial<Seat>;
    old: Partial<Seat>;
  }) => void
) {
  const channel = supabase
    .channel(`seats-layout-${layoutId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'seats',
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Partial<Seat>,
          old: payload.old as Partial<Seat>,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
