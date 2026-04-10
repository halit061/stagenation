export interface SectionColor {
  hex: string;
  name: string;
  category: 'premium' | 'standard' | 'basic' | 'accent';
}

export const SECTION_COLORS: SectionColor[] = [
  { hex: '#D4AF37', name: 'Goud (VIP)', category: 'premium' },
  { hex: '#C0A040', name: 'Donker Goud', category: 'premium' },
  { hex: '#B8860B', name: 'Antiek Goud', category: 'premium' },
  { hex: '#1e40af', name: 'Koningsblauw', category: 'premium' },
  { hex: '#2563eb', name: 'Blauw (Premium)', category: 'premium' },

  { hex: '#3b82f6', name: 'Blauw', category: 'standard' },
  { hex: '#0ea5e9', name: 'Lichtblauw', category: 'standard' },
  { hex: '#0d9488', name: 'Teal', category: 'standard' },
  { hex: '#059669', name: 'Smaragd', category: 'standard' },
  { hex: '#22c55e', name: 'Groen', category: 'standard' },

  { hex: '#ef4444', name: 'Rood', category: 'accent' },
  { hex: '#dc2626', name: 'Donkerrood', category: 'accent' },
  { hex: '#f97316', name: 'Oranje', category: 'accent' },
  { hex: '#f59e0b', name: 'Amber', category: 'accent' },
  { hex: '#ec4899', name: 'Roze', category: 'accent' },
  { hex: '#8b5cf6', name: 'Paars', category: 'accent' },

  { hex: '#64748b', name: 'Grijs', category: 'basic' },
  { hex: '#475569', name: 'Donkergrijs', category: 'basic' },
  { hex: '#78716c', name: 'Warm Grijs', category: 'basic' },
  { hex: '#92400e', name: 'Bruin', category: 'basic' },
];

export const COLOR_CATEGORIES = [
  { key: 'premium' as const, label: 'Premium / VIP' },
  { key: 'standard' as const, label: 'Standaard' },
  { key: 'accent' as const, label: 'Accent' },
  { key: 'basic' as const, label: 'Basis' },
];

export function getColorName(hex: string): string {
  const found = SECTION_COLORS.find(c => c.hex.toLowerCase() === hex.toLowerCase());
  return found?.name || hex;
}

export function getColorCategory(hex: string): SectionColor['category'] | null {
  const found = SECTION_COLORS.find(c => c.hex.toLowerCase() === hex.toLowerCase());
  return found?.category || null;
}
