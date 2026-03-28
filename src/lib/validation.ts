export function sanitizeText(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

export function validateSectionName(name: string): string | null {
  const clean = sanitizeText(name);
  if (!clean) return 'Sectie naam is verplicht';
  if (clean.length > 100) return 'Sectie naam mag maximaal 100 karakters zijn';
  return null;
}

export function validateLayoutName(name: string): string | null {
  const clean = sanitizeText(name);
  if (!clean) return 'Layout naam is verplicht';
  if (clean.length > 200) return 'Layout naam mag maximaal 200 karakters zijn';
  return null;
}

export function validateRows(rows: number): string | null {
  if (!Number.isInteger(rows) || rows < 1) return 'Minimaal 1 rij';
  if (rows > 50) return 'Maximaal 50 rijen';
  return null;
}

export function validateSeatsPerRow(seats: number): string | null {
  if (!Number.isInteger(seats) || seats < 1) return 'Minimaal 1 stoel per rij';
  if (seats > 100) return 'Maximaal 100 stoelen per rij';
  return null;
}

export function validatePrice(price: number): string | null {
  if (price < 0) return 'Prijs mag niet negatief zijn';
  if (price > 99999.99) return 'Prijs mag maximaal 99999.99 zijn';
  return null;
}

export function validatePriceCategory(cat: string): string | null {
  if (cat.length > 50) return 'Prijscategorie mag maximaal 50 karakters zijn';
  return null;
}
