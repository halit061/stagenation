/**
 * Timezone utilities for consistent date/time handling
 * All times use Europe/Brussels timezone explicitly
 * This ensures correct handling regardless of browser timezone
 */

const TIMEZONE = 'Europe/Brussels';

/**
 * Get Brussels timezone offset in minutes for a given date
 * Brussels uses CET (UTC+1) in winter and CEST (UTC+2) in summer
 */
function getBrusselsOffset(date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find(p => p.type === 'timeZoneName');
  if (tzPart) {
    const match = tzPart.value.match(/GMT([+-])(\d{1,2})/);
    if (match) {
      const sign = match[1] === '+' ? 1 : -1;
      const hours = parseInt(match[2], 10);
      return sign * hours * 60;
    }
  }
  return 60;
}

/**
 * Converts a UTC ISO string from database to local datetime string for datetime-local input
 * Always converts to Europe/Brussels timezone regardless of browser timezone
 * Example: "2026-02-07T20:30:00+00:00" -> "2026-02-07T21:30" (in Brussels)
 */
export function utcToLocalInput(utcString: string): string {
  if (!utcString) return '';

  const date = new Date(utcString);

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const formatted = formatter.format(date);
  return formatted.replace(' ', 'T');
}

/**
 * Converts local datetime string from datetime-local input to UTC ISO string for database
 * Interprets the input as Europe/Brussels time regardless of browser timezone
 * Example: "2026-02-07T21:30" (Brussels) -> "2026-02-07T20:30:00.000Z"
 */
export function localInputToUtc(localString: string): string {
  if (!localString) return '';

  const [datePart, timePart] = localString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);

  const tempDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
  const brusselsOffset = getBrusselsOffset(tempDate);
  const utcTime = tempDate.getTime() - brusselsOffset * 60 * 1000;

  return new Date(utcTime).toISOString();
}

/**
 * Format date for display in local timezone
 */
export function formatDate(dateString: string, locale: string = 'nl-BE'): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIMEZONE,
  });
}

/**
 * Format time for display in local timezone
 */
export function formatTime(dateString: string, locale: string = 'nl-BE'): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
}

/**
 * Format date and time for display
 */
export function formatDateTime(dateString: string, locale: string = 'nl-BE'): string {
  const date = new Date(dateString);
  return date.toLocaleString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
}

/**
 * Get day name in local timezone
 */
export function getDayName(dateString: string, locale: string = 'nl-BE'): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    timeZone: TIMEZONE,
  });
}

/**
 * Get month and day for calendar display
 */
export function getMonthDay(dateString: string, locale: string = 'nl-BE'): { day: number; month: string } {
  const date = new Date(dateString);
  const day = date.toLocaleDateString(locale, {
    day: 'numeric',
    timeZone: TIMEZONE,
  });
  const month = date.toLocaleDateString(locale, {
    month: 'short',
    timeZone: TIMEZONE,
  });
  return { day: parseInt(day), month };
}
