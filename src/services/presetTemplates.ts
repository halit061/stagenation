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
  description: 'Limburghal Genk (HAL A) - 1882 zitplaatsen, tribunes + plein secties',
  totalSeats: 1882,
  canvasScale: { sourceW: 9000, sourceH: 4500 },
  objects: [
    {
      type: 'STAGE',
      name: 'PODIUM',
      label: 'PODIUM',
      x: 2500,
      y: 80,
      width: 4000,
      height: 400,
      color: '#1e40af',
      fontColor: '#ffffff',
      fontSize: 28,
      fontWeight: 'bold',
    },
    {
      type: 'DECOR_TABLE',
      name: 'FOH',
      label: 'FOH',
      x: 3600,
      y: 3200,
      width: 1800,
      height: 600,
      color: '#991b1b',
      fontColor: '#ffffff',
      fontSize: 20,
      fontWeight: 'bold',
      isVisible: true,
    },
  ],
  sections: [
    {
      name: 'Plein Front Links',
      section_type: 'plein',
      position_x: 1800,
      position_y: 550,
      width: 2600,
      height: 1500,
      rows_count: 19,
      seats_per_row: 18,
      color: '#3b82f6',
      rotation: 0,
      row_curve: 0.25,
      start_row_label: 'A',
      numbering_direction: 'right-to-left',
      row_spacing: 30,
      seat_spacing: 28,
      orientation: 'top',
      price_category: 'Plein Front',
    },
    {
      name: 'Plein Front Rechts',
      section_type: 'plein',
      position_x: 4800,
      position_y: 550,
      width: 2600,
      height: 1500,
      rows_count: 19,
      seats_per_row: 18,
      color: '#3b82f6',
      rotation: 0,
      row_curve: 0.25,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 30,
      seat_spacing: 28,
      orientation: 'top',
      price_category: 'Plein Front',
    },
    {
      name: 'Plein Extra Midden',
      section_type: 'plein',
      position_x: 3800,
      position_y: 600,
      width: 1400,
      height: 300,
      rows_count: 1,
      seats_per_row: 8,
      color: '#0ea5e9',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'X',
      numbering_direction: 'left-to-right',
      row_spacing: 30,
      seat_spacing: 30,
      orientation: 'top',
      price_category: 'Plein Front',
    },
    {
      name: 'Plein Achter Links 1',
      section_type: 'plein',
      position_x: 1200,
      position_y: 2800,
      width: 2100,
      height: 1200,
      rows_count: 14,
      seats_per_row: 18,
      color: '#10b981',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'right-to-left',
      row_spacing: 28,
      seat_spacing: 24,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Plein Achter Links 2',
      section_type: 'plein',
      position_x: 1200,
      position_y: 2200,
      width: 1400,
      height: 500,
      rows_count: 6,
      seats_per_row: 18,
      color: '#10b981',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'right-to-left',
      row_spacing: 28,
      seat_spacing: 22,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Plein Achter Rechts 1',
      section_type: 'plein',
      position_x: 5700,
      position_y: 2800,
      width: 2100,
      height: 1200,
      rows_count: 14,
      seats_per_row: 18,
      color: '#10b981',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 28,
      seat_spacing: 24,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Plein Achter Rechts 2',
      section_type: 'plein',
      position_x: 6400,
      position_y: 2200,
      width: 1400,
      height: 500,
      rows_count: 6,
      seats_per_row: 18,
      color: '#10b981',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 28,
      seat_spacing: 22,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Plein Achter Midden Links',
      section_type: 'plein',
      position_x: 2400,
      position_y: 3400,
      width: 1800,
      height: 900,
      rows_count: 10,
      seats_per_row: 18,
      color: '#06b6d4',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'right-to-left',
      row_spacing: 28,
      seat_spacing: 22,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Plein Achter Midden Rechts',
      section_type: 'plein',
      position_x: 4800,
      position_y: 3400,
      width: 1800,
      height: 900,
      rows_count: 10,
      seats_per_row: 18,
      color: '#06b6d4',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 28,
      seat_spacing: 22,
      orientation: 'top',
      price_category: 'Plein Achter',
    },
    {
      name: 'Tribune Links Boven (A5-A6)',
      section_type: 'tribune',
      position_x: 200,
      position_y: 500,
      width: 1400,
      height: 1800,
      rows_count: 15,
      seats_per_row: 18,
      color: '#f59e0b',
      rotation: 35,
      row_curve: 0.15,
      start_row_label: '1',
      numbering_direction: 'left-to-right',
      row_spacing: 26,
      seat_spacing: 22,
      orientation: 'right',
      price_category: 'Tribune',
    },
    {
      name: 'Tribune Links Onder (A7-A8)',
      section_type: 'tribune',
      position_x: 100,
      position_y: 2400,
      width: 1200,
      height: 1600,
      rows_count: 13,
      seats_per_row: 16,
      color: '#f59e0b',
      rotation: 25,
      row_curve: 0.1,
      start_row_label: '1',
      numbering_direction: 'left-to-right',
      row_spacing: 26,
      seat_spacing: 22,
      orientation: 'right',
      price_category: 'Tribune',
    },
    {
      name: 'Tribune Rechts Boven (A3-A4)',
      section_type: 'tribune',
      position_x: 7400,
      position_y: 500,
      width: 1400,
      height: 1800,
      rows_count: 15,
      seats_per_row: 18,
      color: '#f59e0b',
      rotation: -35,
      row_curve: 0.15,
      start_row_label: '1',
      numbering_direction: 'right-to-left',
      row_spacing: 26,
      seat_spacing: 22,
      orientation: 'left',
      price_category: 'Tribune',
    },
    {
      name: 'Tribune Rechts Onder (A1-A2)',
      section_type: 'tribune',
      position_x: 7700,
      position_y: 2400,
      width: 1200,
      height: 1600,
      rows_count: 13,
      seats_per_row: 16,
      color: '#f59e0b',
      rotation: -25,
      row_curve: 0.1,
      start_row_label: '1',
      numbering_direction: 'right-to-left',
      row_spacing: 26,
      seat_spacing: 22,
      orientation: 'left',
      price_category: 'Tribune',
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
