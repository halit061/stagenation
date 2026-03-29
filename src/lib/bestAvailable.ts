import type { SeatSection, SeatOrientation, BestAvailableStrategy } from '../types/seats';
import type { PickerSeat } from '../hooks/useSeatPickerState';

export interface BestAvailableOptions {
  count: number;
  strategy: BestAvailableStrategy;
  sectionId?: string;
  priceCategory?: string;
  keepTogether: boolean;
  excludeSeatIds?: Set<string>;
}

interface ScoredSeat {
  seat: PickerSeat;
  score: number;
}

function getStageEdge(section: SeatSection): { axis: 'x' | 'y'; stageValue: number } {
  const orientation: SeatOrientation = section.orientation || 'top';
  switch (orientation) {
    case 'top':
      return { axis: 'y', stageValue: section.position_y };
    case 'bottom':
      return { axis: 'y', stageValue: section.position_y + section.height };
    case 'left':
      return { axis: 'x', stageValue: section.position_x };
    case 'right':
      return { axis: 'x', stageValue: section.position_x + section.width };
  }
}

function getSectionCenter(section: SeatSection): { cx: number; cy: number } {
  return {
    cx: section.position_x + section.width / 2,
    cy: section.position_y + section.height / 2,
  };
}

function frontScore(seat: PickerSeat, section: SeatSection): number {
  const edge = getStageEdge(section);
  if (edge.axis === 'y') {
    return 1 - Math.abs(seat.cy - edge.stageValue) / Math.max(section.height, 1);
  }
  return 1 - Math.abs(seat.cx - edge.stageValue) / Math.max(section.width, 1);
}

function centerScore(seat: PickerSeat, section: SeatSection): number {
  const center = getSectionCenter(section);
  const maxDist = Math.sqrt(section.width * section.width + section.height * section.height) / 2;
  const dist = Math.sqrt(
    (seat.cx - center.cx) ** 2 + (seat.cy - center.cy) ** 2,
  );
  return 1 - dist / Math.max(maxDist, 1);
}

function scoreSeat(
  seat: PickerSeat,
  section: SeatSection,
  strategy: BestAvailableStrategy,
  priceRange: { min: number; max: number },
): number {
  const price = seat.price_override ?? Number(section.price_amount);
  const front = frontScore(seat, section);
  const center = centerScore(seat, section);
  const priceDelta = priceRange.max - priceRange.min || 1;
  const priceNorm = (price - priceRange.min) / priceDelta;

  switch (strategy) {
    case 'best':
      return front * 0.5 + center * 0.5;
    case 'front':
      return front * 0.8 + center * 0.2;
    case 'center':
      return center * 0.8 + front * 0.2;
    case 'cheapest':
      return (1 - priceNorm) * 0.7 + center * 0.3;
    case 'expensive':
      return priceNorm * 0.7 + center * 0.3;
  }
}

function getRowKey(seat: PickerSeat): string {
  return `${seat.sectionId}:${seat.row_label}`;
}

function findContiguousGroup(
  rowSeats: PickerSeat[],
  count: number,
  scoreFn: (seat: PickerSeat) => number,
): PickerSeat[] | null {
  const sorted = [...rowSeats].sort((a, b) => a.seat_number - b.seat_number);
  if (sorted.length < count) return null;

  let bestGroup: PickerSeat[] | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i <= sorted.length - count; i++) {
    const isContiguous = sorted
      .slice(i, i + count - 1)
      .every((s, j) => sorted[i + j + 1].seat_number === s.seat_number + 1);

    if (!isContiguous) continue;

    const group = sorted.slice(i, i + count);
    const avgScore = group.reduce((sum, s) => sum + scoreFn(s), 0) / count;
    if (avgScore > bestScore) {
      bestScore = avgScore;
      bestGroup = group;
    }
  }

  return bestGroup;
}

export function findBestAvailable(
  allSeats: PickerSeat[],
  sections: SeatSection[],
  options: BestAvailableOptions,
): PickerSeat[] {
  const sectionMap = new Map<string, SeatSection>();
  for (const s of sections) sectionMap.set(s.id, s);

  let candidates = allSeats.filter(
    (s) => s.status === 'available' && s.is_active,
  );

  if (options.excludeSeatIds && options.excludeSeatIds.size > 0) {
    candidates = candidates.filter((s) => !options.excludeSeatIds!.has(s.id));
  }

  if (options.sectionId) {
    candidates = candidates.filter((s) => s.sectionId === options.sectionId);
  }

  if (options.priceCategory) {
    candidates = candidates.filter((s) => {
      const sec = sectionMap.get(s.sectionId);
      return sec && (sec.price_category || sec.name) === options.priceCategory;
    });
  }

  if (candidates.length < options.count) return [];

  const prices = candidates.map(
    (s) => s.price_override ?? Number(sectionMap.get(s.sectionId)?.price_amount ?? 0),
  );
  const priceRange = { min: Math.min(...prices), max: Math.max(...prices) };

  const scoreFn = (seat: PickerSeat) => {
    const sec = sectionMap.get(seat.sectionId);
    if (!sec) return 0;
    return scoreSeat(seat, sec, options.strategy, priceRange);
  };

  if (options.keepTogether && options.count > 1) {
    const rowMap = new Map<string, PickerSeat[]>();
    for (const s of candidates) {
      const key = getRowKey(s);
      if (!rowMap.has(key)) rowMap.set(key, []);
      rowMap.get(key)!.push(s);
    }

    let bestGroup: PickerSeat[] | null = null;
    let bestScore = -Infinity;

    for (const [, rowSeats] of rowMap) {
      const group = findContiguousGroup(rowSeats, options.count, scoreFn);
      if (group) {
        const avg = group.reduce((sum, s) => sum + scoreFn(s), 0) / group.length;
        if (avg > bestScore) {
          bestScore = avg;
          bestGroup = group;
        }
      }
    }

    if (bestGroup) return bestGroup;
  }

  const scored: ScoredSeat[] = candidates.map((seat) => ({
    seat,
    score: scoreFn(seat),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, options.count).map((s) => s.seat);
}
