import { supabase } from '../lib/supabaseClient';
import { saveLayout, createSection, generateSeats } from './seatService';
import type { VenueLayout, SeatSection } from '../types/seats';

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
  }>;
}

const SX = 9000 / 2000;
const SY = 4500 / 1400;

const STUDIO_100_TEMPLATE: PresetTemplate = {
  id: 'studio-100-limburghal',
  name: 'Studio 100 Zingt - Limburghal Genk',
  description: 'Limburghal Genk (HAL A) - 3442 zitplaatsen, 2 tribunes, 4 plein secties',
  totalSeats: 3442,
  canvasScale: { sourceW: 2000, sourceH: 1400 },
  objects: [
    {
      type: 'STAGE',
      name: 'PODIUM',
      label: 'PODIUM',
      x: 700,
      y: 50,
      width: 600,
      height: 150,
      color: '#1e40af',
      fontColor: '#ffffff',
      fontSize: 24,
      fontWeight: 'bold',
    },
    {
      type: 'DECOR_TABLE',
      name: 'FOH',
      label: 'FOH',
      x: 850,
      y: 1050,
      width: 300,
      height: 150,
      color: '#ef4444',
      fontColor: '#ffffff',
      fontSize: 18,
      fontWeight: 'bold',
      isVisible: true,
    },
  ],
  sections: [
    {
      name: 'Plein Front Links',
      section_type: 'plein',
      position_x: 350,
      position_y: 350,
      width: 500,
      height: 550,
      rows_count: 20,
      seats_per_row: 18,
      color: '#3b82f6',
      rotation: 0,
      row_curve: 0.15,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 28,
      seat_spacing: 26,
      price_category: 'Plein Front',
    },
    {
      name: 'Plein Front Rechts',
      section_type: 'plein',
      position_x: 1050,
      position_y: 350,
      width: 500,
      height: 550,
      rows_count: 20,
      seats_per_row: 18,
      color: '#3b82f6',
      rotation: 0,
      row_curve: 0.15,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 28,
      seat_spacing: 26,
      price_category: 'Plein Front',
    },
    {
      name: 'Plein Achter Links',
      section_type: 'plein',
      position_x: 250,
      position_y: 950,
      width: 450,
      height: 350,
      rows_count: 14,
      seats_per_row: 42,
      color: '#8b5cf6',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 24,
      seat_spacing: 10,
      price_category: 'Plein Achter',
    },
    {
      name: 'Plein Achter Rechts',
      section_type: 'plein',
      position_x: 1100,
      position_y: 950,
      width: 450,
      height: 350,
      rows_count: 14,
      seats_per_row: 42,
      color: '#8b5cf6',
      rotation: 0,
      row_curve: 0,
      start_row_label: 'A',
      numbering_direction: 'left-to-right',
      row_spacing: 24,
      seat_spacing: 10,
      price_category: 'Plein Achter',
    },
    {
      name: 'Tribune Links',
      section_type: 'tribune',
      position_x: 30,
      position_y: 350,
      width: 300,
      height: 700,
      rows_count: 30,
      seats_per_row: 26,
      color: '#f59e0b',
      rotation: 0,
      row_curve: 0,
      start_row_label: '1',
      numbering_direction: 'left-to-right',
      row_spacing: 11,
      seat_spacing: 11,
      orientation: 'right',
      price_category: 'Tribune',
    },
    {
      name: 'Tribune Rechts',
      section_type: 'tribune',
      position_x: 1650,
      position_y: 350,
      width: 300,
      height: 700,
      rows_count: 30,
      seats_per_row: 26,
      color: '#f59e0b',
      rotation: 0,
      row_curve: 0,
      start_row_label: '1',
      numbering_direction: 'left-to-right',
      row_spacing: 11,
      seat_spacing: 11,
      orientation: 'left',
      price_category: 'Tribune',
    },
  ],
};

export const PRESET_TEMPLATES: PresetTemplate[] = [STUDIO_100_TEMPLATE];

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
        x: Math.round(obj.x * SX),
        y: Math.round(obj.y * SY),
        width: Math.round(obj.width * SX),
        height: Math.round(obj.height * SY),
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

  const createdSections: SeatSection[] = [];

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
      position_x: Math.round(sec.position_x * SX),
      position_y: Math.round(sec.position_y * SY),
      width: Math.round(sec.width * SX),
      height: Math.round(sec.height * SY),
      rotation: sec.rotation,
      orientation: sec.orientation ?? 'top',
      rows_count: sec.rows_count,
      seats_per_row: sec.seats_per_row,
      row_curve: sec.row_curve,
      sort_order: i,
      is_active: true,
      start_row_label: sec.start_row_label,
      numbering_direction: sec.numbering_direction,
      row_label_direction: 'top-to-bottom',
      row_spacing: sec.row_spacing,
      seat_spacing: sec.seat_spacing,
    });

    createdSections.push(section);

    report(`Stoelen voor "${sec.name}" genereren...`);
    await generateSeats({
      section_id: section.id,
      rows: sec.rows_count,
      seats_per_row: sec.seats_per_row,
      start_row_label: sec.start_row_label,
      numbering_direction: sec.numbering_direction,
      row_label_direction: 'top-to-bottom',
      row_spacing: sec.row_spacing,
      seat_spacing: sec.seat_spacing,
      curve: sec.row_curve,
      orientation: sec.orientation ?? 'top',
    });
  }

  return layout;
}
