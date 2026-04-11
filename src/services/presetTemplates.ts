import { supabase } from '../lib/supabaseClient';
import { saveLayout, createSection, generateSeats } from './seatService';
import type { VenueLayout } from '../types/seats';

interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  totalSeats: number;
  canvasScale: { sourceW: number; sourceH: number };
  objects: Array<{
    type: string;
    name: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    fontColor?: string;
    fontSize?: number;
    fontWeight?: string;
    isVisible?: boolean;
  }>;
  sections: Array<{
    name: string;
    section_type: 'tribune' | 'plein';
    position_x: number;
    position_y: number;
    width: number;
    height: number;
    rows_count: number;
    seats_per_row: number;
    color: string;
    rotation: number;
    row_curve: number;
    start_row_label: string;
    numbering_direction: 'left-to-right' | 'right-to-left' | 'center-out';
    row_spacing: number;
    seat_spacing: number;
    orientation?: 'top' | 'bottom' | 'left' | 'right';
    price_category?: string;
    row_label_direction?: 'top-to-bottom' | 'bottom-to-top';
  }>;
}

const LIMBURGHAL_TEMPLATE: PresetTemplate = {
  id: 'limburghal-genk-1882',
  name: 'Limburghal Genk - Zaalopstelling',
  description: 'Limburghal Genk (HAL A) - 1882 zitplaatsen, 4 tribunes + plein secties',
  totalSeats: 1882,
  canvasScale: { sourceW: 9000, sourceH: 4500 },
  objects: [
    {
      type: 'STAGE',
      name: 'PODIUM',
      label: 'PODIUM',
      x: 2000,
      y: 30,
      width: 5000,
      height: 350,
      color: '#334155',
      fontColor: '#ffffff',
      fontSize: 28,
      fontWeight: 'bold',
    },
    {
      type: 'DECOR_TABLE',
      name: 'FOH',
      label: 'FOH',
      x: 4050,
      y: 2780,
      width: 900,
      height: 350,
      color: '#64748b',
      fontColor: '#ffffff',
      fontSize: 14,
      fontWeight: 'bold',
      isVisible: true,
    },
  ],
  sections: [
    {
      name: 'Plein Front Links',
      section_type: 'plein',
      position_x: 2200,
      position_y: 500,
      width: 2200,
      height: 1400,
      rows_count: 19,
      seats_per_row: 18,
      color: '#3b82f6',
      rotation: 0,
      row_curve: 0.3,
      start_row_label: 'A',
      numbering_direction: 'right-to-left',
      row_spacing: 28,
      seat_spacing: 26,
      orientation: 'top',
      price_category: 'Plein Front',
    },
    {
      name: 'Plein Front Rechts',
      section_type: 'plein',
      position_x: 4700,
      position_y: 500,
      width: 2200,
      height: 1400,
      rows_count: 19,
      seats_per_row: 18,
      color: '#3b82f6',
      rotation: 0,
      row_curve: 0.3,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 28,
      seat_spacing: 26,
      orientation: 'top',
      price_category: 'Plein Front',
    },
    {
      name: 'Midden Extra',
      section_type: 'plein',
      position_x: 4050,
      position_y: 530,
      width: 900,
      height: 200,
      rows_count: 1,
      seats_per_row: 16,
      color: '#0ea5e9',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'X',
      numbering_direction: 'left-to-right',
      row_spacing: 28,
      seat_spacing: 24,
      orientation: 'top',
      price_category: 'Plein Front',
    },
    {
      name: 'Tribune Links Boven',
      section_type: 'tribune',
      position_x: 350,
      position_y: 550,
      width: 1500,
      height: 1650,
      rows_count: 14,
      seats_per_row: 16,
      color: '#78716c',
      rotation: 30,
      row_curve: 0.12,
      start_row_label: '1',
      numbering_direction: 'left-to-right',
      row_spacing: 24,
      seat_spacing: 20,
      orientation: 'right',
      price_category: 'Tribune',
    },
    {
      name: 'Tribune Links Onder',
      section_type: 'tribune',
      position_x: 150,
      position_y: 2350,
      width: 1350,
      height: 1600,
      rows_count: 12,
      seats_per_row: 14,
      color: '#78716c',
      rotation: 18,
      row_curve: 0.08,
      start_row_label: '1',
      numbering_direction: 'left-to-right',
      row_spacing: 24,
      seat_spacing: 20,
      orientation: 'right',
      price_category: 'Tribune',
    },
    {
      name: 'Tribune Rechts Boven',
      section_type: 'tribune',
      position_x: 7150,
      position_y: 550,
      width: 1500,
      height: 1650,
      rows_count: 14,
      seats_per_row: 16,
      color: '#78716c',
      rotation: -30,
      row_curve: 0.12,
      start_row_label: '1',
      numbering_direction: 'right-to-left',
      row_spacing: 24,
      seat_spacing: 20,
      orientation: 'left',
      price_category: 'Tribune',
    },
    {
      name: 'Tribune Rechts Onder',
      section_type: 'tribune',
      position_x: 7500,
      position_y: 2350,
      width: 1350,
      height: 1600,
      rows_count: 12,
      seats_per_row: 14,
      color: '#78716c',
      rotation: -18,
      row_curve: 0.08,
      start_row_label: '1',
      numbering_direction: 'right-to-left',
      row_spacing: 24,
      seat_spacing: 20,
      orientation: 'left',
      price_category: 'Tribune',
    },
    {
      name: 'Achter Links Buiten',
      section_type: 'plein',
      position_x: 1350,
      position_y: 2950,
      width: 1500,
      height: 1350,
      rows_count: 16,
      seats_per_row: 18,
      color: '#64748b',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'right-to-left',
      row_spacing: 26,
      seat_spacing: 22,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Achter Links Binnen',
      section_type: 'plein',
      position_x: 1650,
      position_y: 2200,
      width: 1200,
      height: 650,
      rows_count: 11,
      seats_per_row: 18,
      color: '#64748b',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'right-to-left',
      row_spacing: 26,
      seat_spacing: 22,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Achter Midden Links',
      section_type: 'plein',
      position_x: 2900,
      position_y: 3300,
      width: 1250,
      height: 1000,
      rows_count: 7,
      seats_per_row: 15,
      color: '#64748b',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'right-to-left',
      row_spacing: 26,
      seat_spacing: 22,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Achter Rechts Buiten',
      section_type: 'plein',
      position_x: 6150,
      position_y: 2950,
      width: 1500,
      height: 1350,
      rows_count: 16,
      seats_per_row: 18,
      color: '#64748b',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 26,
      seat_spacing: 22,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Achter Rechts Binnen',
      section_type: 'plein',
      position_x: 6150,
      position_y: 2200,
      width: 1200,
      height: 650,
      rows_count: 11,
      seats_per_row: 18,
      color: '#64748b',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 26,
      seat_spacing: 22,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Achter Midden Rechts',
      section_type: 'plein',
      position_x: 4850,
      position_y: 3300,
      width: 1250,
      height: 1000,
      rows_count: 7,
      seats_per_row: 15,
      color: '#64748b',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 26,
      seat_spacing: 22,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
  ],
};

export const PRESET_TEMPLATES: PresetTemplate[] = [LIMBURGHAL_TEMPLATE];

export interface PresetProgress {
  step: string;
  current: number;
  total: number;
}

export async function applyPresetTemplate(
  presetId: string,
  eventId: string | null,
  onProgress?: (p: PresetProgress) => void,
): Promise<VenueLayout> {
  const preset = PRESET_TEMPLATES.find(t => t.id === presetId);
  if (!preset) throw new Error('Preset template niet gevonden');

  const total = 1 + preset.objects.length + preset.sections.length * 2;
  let current = 0;
  const report = (step: string) => {
    current++;
    onProgress?.({ step, current, total });
  };

  report('Layout aanmaken...');
  const layout = await saveLayout({
    name: preset.name,
    event_id: eventId,
    is_template: !eventId,
    layout_data: {},
  });

  for (const obj of preset.objects) {
    report(`Object "${obj.name}" aanmaken...`);
    const { error } = await supabase
      .from('floorplan_objects')
      .insert({
        object_type: obj.type.toLowerCase(),
        type: obj.type,
        name: obj.name,
        label: obj.label,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        rotation: 0,
        color: obj.color,
        font_color: obj.fontColor ?? '#ffffff',
        font_size: obj.fontSize ?? 18,
        font_weight: obj.fontWeight ?? 'bold',
        is_active: true,
        is_visible: obj.isVisible ?? true,
      });
    if (error) throw new Error(`Object "${obj.name}" aanmaken mislukt: ${error.message}`);
  }

  for (let i = 0; i < preset.sections.length; i++) {
    const sec = preset.sections[i];

    report(`Sectie "${sec.name}" aanmaken...`);
    const section = await createSection({
      layout_id: layout.id,
      name: sec.name,
      section_type: sec.section_type,
      capacity: 0,
      color: sec.color,
      price_category: sec.price_category ?? null,
      price_amount: 0,
      position_x: sec.position_x,
      position_y: sec.position_y,
      width: sec.width,
      height: sec.height,
      rotation: sec.rotation,
      orientation: sec.orientation ?? 'top',
      rows_count: sec.rows_count,
      seats_per_row: sec.seats_per_row,
      row_curve: sec.row_curve,
      sort_order: i,
      is_active: true,
      start_row_label: sec.start_row_label,
      numbering_direction: sec.numbering_direction,
      row_label_direction: sec.row_label_direction ?? 'top-to-bottom',
      row_spacing: sec.row_spacing,
      seat_spacing: sec.seat_spacing,
    });

    report(`Stoelen voor "${sec.name}" genereren...`);
    await generateSeats({
      section_id: section.id,
      rows: sec.rows_count,
      seats_per_row: sec.seats_per_row,
      start_row_label: sec.start_row_label,
      numbering_direction: sec.numbering_direction,
      row_label_direction: sec.row_label_direction ?? 'top-to-bottom',
      row_spacing: sec.row_spacing,
      seat_spacing: sec.seat_spacing,
      curve: sec.row_curve,
      orientation: sec.orientation ?? 'top',
    });
  }

  return layout;
}
