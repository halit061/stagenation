import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Seat, SeatSection } from '../types/seats';
import type { SeatDrawSettings, DrawSeatType } from '../components/SeatDrawSettingsPanel';

const MAX_SEATS_PER_SECTION = 5000;
const FREE_SECTION_NAME = 'Vrije Plaatsing';

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

export function useSeatDraw(
  sections: SeatSection[],
  sectionSeats: Record<string, Seat[]>,
  setSectionSeats: React.Dispatch<React.SetStateAction<Record<string, Seat[]>>>,
  setSeatSections: React.Dispatch<React.SetStateAction<SeatSection[]>>,
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  layoutId: string | null,
  canvasW: number,
  canvasH: number,
) {
  const [settings, setSettings] = useState<SeatDrawSettings>({
    sectionId: null,
    rowLabel: 'A',
    startNumber: 1,
    seatSpacing: 25,
    seatType: 'regular',
    ticketTypeId: null,
  });

  const [placedInRow, setPlacedInRow] = useState(0);
  const [lastPlacedId, setLastPlacedId] = useState<string | null>(null);
  const nextNumber = useRef(1);
  const drawLineStart = useRef<{ x: number; y: number } | null>(null);
  const isDrawingLine = useRef(false);
  const [linePreview, setLinePreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const autoSectionCreating = useRef(false);

  const getOrCreateFreeSection = useCallback(async (): Promise<string | null> => {
    if (settings.sectionId) {
      const existing = sections.find(s => s.id === settings.sectionId);
      if (existing) return settings.sectionId;
    }

    const freeSection = sections.find(s => s.name === FREE_SECTION_NAME);
    if (freeSection) {
      setSettings(prev => ({ ...prev, sectionId: freeSection.id }));
      return freeSection.id;
    }

    if (!layoutId) {
      showToast('Sla eerst een layout op', 'error');
      return null;
    }

    if (autoSectionCreating.current) return null;
    autoSectionCreating.current = true;

    try {
      const { data, error } = await supabase
        .from('seat_sections')
        .insert({
          layout_id: layoutId,
          name: FREE_SECTION_NAME,
          section_type: 'plein',
          capacity: 0,
          color: 'transparent',
          price_category: '',
          price_amount: 0,
          position_x: 0,
          position_y: 0,
          width: canvasW,
          height: canvasH,
          rotation: 0,
          orientation: 'top',
          rows_count: 0,
          seats_per_row: 0,
          row_curve: 0,
          sort_order: 9999,
          is_active: true,
          start_row_label: 'A',
          numbering_direction: 'left-to-right',
          row_label_direction: 'top-to-bottom',
          row_spacing: 35,
          seat_spacing: 25,
        })
        .select()
        .single();

      if (error) {
        showToast(`Fout bij aanmaken sectie: ${error.message}`, 'error');
        return null;
      }

      const newSection = data as SeatSection;
      setSeatSections(prev => [...prev, newSection]);
      setSectionSeats(prev => ({ ...prev, [newSection.id]: [] }));
      setSettings(prev => ({ ...prev, sectionId: newSection.id }));
      return newSection.id;
    } finally {
      autoSectionCreating.current = false;
    }
  }, [settings.sectionId, sections, layoutId, canvasW, canvasH, setSeatSections, setSectionSeats, showToast]);

  const countSeatsInSection = useCallback(
    (sectionId: string) => (sectionSeats[sectionId] || []).length,
    [sectionSeats],
  );

  const insertSeatToDb = useCallback(
    async (
      sectionId: string,
      rowLabel: string,
      seatNumber: number,
      relX: number,
      relY: number,
      seatType: DrawSeatType,
      ticketTypeId: string | null,
    ): Promise<Seat | null> => {
      const row: Record<string, unknown> = {
        section_id: sectionId,
        row_label: rowLabel,
        seat_number: seatNumber,
        x_position: relX,
        y_position: relY,
        status: 'available',
        seat_type: seatType,
        is_active: true,
      };
      if (ticketTypeId) row.ticket_type_id = ticketTypeId;
      const { data, error } = await supabase
        .from('seats')
        .insert(row)
        .select()
        .single();
      if (error) {
        showToast(`Fout bij plaatsen stoel: ${error.message}`, 'error');
        return null;
      }
      return data as Seat;
    },
    [showToast],
  );

  const updateSectionCapacity = useCallback(async (sectionId: string, newCount: number) => {
    await supabase.from('seat_sections').update({ capacity: newCount }).eq('id', sectionId);
  }, []);

  const placeSingleSeat = useCallback(
    async (canvasX: number, canvasY: number) => {
      const sectionId = await getOrCreateFreeSection();
      if (!sectionId) return;

      const currentCount = countSeatsInSection(sectionId);
      if (currentCount >= MAX_SEATS_PER_SECTION) {
        showToast(`Maximaal ${MAX_SEATS_PER_SECTION} stoelen per sectie bereikt`, 'error');
        return;
      }

      const seatNum = nextNumber.current;

      const seat = await insertSeatToDb(
        sectionId,
        settings.rowLabel,
        seatNum,
        canvasX,
        canvasY,
        settings.seatType,
        settings.ticketTypeId,
      );

      if (seat) {
        nextNumber.current = seatNum + 1;
        setSettings(prev => ({ ...prev, startNumber: seatNum + 1, sectionId }));
        setPlacedInRow(prev => prev + 1);
        setLastPlacedId(seat.id);

        setSectionSeats(prev => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] || []), seat],
        }));

        await updateSectionCapacity(sectionId, currentCount + 1);
      }
    },
    [settings, getOrCreateFreeSection, countSeatsInSection, insertSeatToDb, setSectionSeats, updateSectionCapacity, showToast],
  );

  const placeSeatsAlongLine = useCallback(
    async (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const totalDist = Math.sqrt(dx * dx + dy * dy);
      if (totalDist < 5) {
        await placeSingleSeat(x1, y1);
        return;
      }

      const sectionId = await getOrCreateFreeSection();
      if (!sectionId) return;

      const spacing = settings.seatSpacing;
      const count = Math.max(1, Math.floor(totalDist / spacing) + 1);
      const currentCount = countSeatsInSection(sectionId);

      if (currentCount + count > MAX_SEATS_PER_SECTION) {
        showToast(`Dit zou meer dan ${MAX_SEATS_PER_SECTION} stoelen geven`, 'error');
        return;
      }

      const ux = dx / totalDist;
      const uy = dy / totalDist;

      const newSeats: Array<Record<string, unknown>> = [];

      let seatNum = nextNumber.current;

      for (let i = 0; i < count; i++) {
        const cx = x1 + ux * spacing * i;
        const cy = y1 + uy * spacing * i;

        const row: Record<string, unknown> = {
          section_id: sectionId,
          row_label: settings.rowLabel,
          seat_number: seatNum,
          x_position: cx,
          y_position: cy,
          status: 'available',
          seat_type: settings.seatType,
          is_active: true,
        };
        if (settings.ticketTypeId) row.ticket_type_id = settings.ticketTypeId;
        newSeats.push(row);
        seatNum++;
      }

      if (newSeats.length === 0) return;

      const { data, error } = await supabase
        .from('seats')
        .insert(newSeats)
        .select();

      if (error) {
        showToast(`Fout bij plaatsen stoelen: ${error.message}`, 'error');
        return;
      }

      const insertedSeats = (data ?? []) as Seat[];
      nextNumber.current = seatNum;
      setSettings(prev => ({ ...prev, startNumber: seatNum, sectionId }));
      setPlacedInRow(prev => prev + insertedSeats.length);
      if (insertedSeats.length > 0) {
        setLastPlacedId(insertedSeats[insertedSeats.length - 1].id);
      }

      setSectionSeats(prev => ({
        ...prev,
        [sectionId]: [...(prev[sectionId] || []), ...insertedSeats],
      }));

      await updateSectionCapacity(sectionId, currentCount + insertedSeats.length);
    },
    [settings, getOrCreateFreeSection, countSeatsInSection, placeSingleSeat, setSectionSeats, updateSectionCapacity, showToast],
  );

  const handleCanvasMouseDown = useCallback(
    (canvasX: number, canvasY: number) => {
      drawLineStart.current = { x: canvasX, y: canvasY };
      isDrawingLine.current = false;
      setLinePreview(null);
    },
    [],
  );

  const handleCanvasMouseMove = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!drawLineStart.current) return;
      const dx = canvasX - drawLineStart.current.x;
      const dy = canvasY - drawLineStart.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        isDrawingLine.current = true;
        setLinePreview({
          x1: drawLineStart.current.x,
          y1: drawLineStart.current.y,
          x2: canvasX,
          y2: canvasY,
        });
      }
    },
    [],
  );

  const handleCanvasMouseUp = useCallback(
    async (canvasX: number, canvasY: number) => {
      if (isDrawingLine.current && drawLineStart.current) {
        await placeSeatsAlongLine(
          drawLineStart.current.x,
          drawLineStart.current.y,
          canvasX,
          canvasY,
        );
      } else if (drawLineStart.current) {
        await placeSingleSeat(canvasX, canvasY);
      }
      drawLineStart.current = null;
      isDrawingLine.current = false;
      setLinePreview(null);
    },
    [placeSingleSeat, placeSeatsAlongLine],
  );

  const deleteLastPlaced = useCallback(async () => {
    if (!lastPlacedId || !settings.sectionId) return;
    const sectionId = settings.sectionId;
    const { error } = await supabase.from('seats').delete().eq('id', lastPlacedId);
    if (error) {
      showToast('Fout bij verwijderen stoel', 'error');
      return;
    }

    setSectionSeats(prev => {
      const seats = prev[sectionId] || [];
      return { ...prev, [sectionId]: seats.filter(s => s.id !== lastPlacedId) };
    });

    const newCount = countSeatsInSection(sectionId) - 1;
    await updateSectionCapacity(sectionId, Math.max(0, newCount));

    nextNumber.current = Math.max(1, nextNumber.current - 1);
    setSettings(prev => ({ ...prev, startNumber: Math.max(1, prev.startNumber - 1) }));
    setPlacedInRow(prev => Math.max(0, prev - 1));

    const seats = sectionSeats[sectionId] || [];
    const remaining = seats.filter(s => s.id !== lastPlacedId);
    setLastPlacedId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
  }, [lastPlacedId, settings.sectionId, sectionSeats, setSectionSeats, countSeatsInSection, updateSectionCapacity, showToast]);

  const advanceRow = useCallback(() => {
    const newLabel = nextRowLabel(settings.rowLabel);
    nextNumber.current = 1;
    setSettings(prev => ({ ...prev, rowLabel: newLabel, startNumber: 1 }));
    setPlacedInRow(0);
    setLastPlacedId(null);
    showToast(`Volgende rij: ${newLabel}`, 'info');
  }, [settings.rowLabel, showToast]);

  const adjustSpacing = useCallback((delta: number) => {
    setSettings(prev => ({
      ...prev,
      seatSpacing: Math.max(10, Math.min(50, prev.seatSpacing + delta)),
    }));
  }, []);

  const updateSettings = useCallback((newSettings: SeatDrawSettings) => {
    setSettings(newSettings);
    nextNumber.current = newSettings.startNumber;
  }, []);

  const resetDrawState = useCallback(() => {
    setPlacedInRow(0);
    setLastPlacedId(null);
    nextNumber.current = settings.startNumber;
  }, [settings.startNumber]);

  const deleteSeatById = useCallback(async (seatId: string, sectionId: string) => {
    const { error } = await supabase.from('seats').delete().eq('id', seatId);
    if (error) {
      showToast('Fout bij verwijderen stoel', 'error');
      return;
    }

    setSectionSeats(prev => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).filter(s => s.id !== seatId),
    }));

    const newCount = countSeatsInSection(sectionId) - 1;
    await updateSectionCapacity(sectionId, Math.max(0, newCount));
    showToast('Stoel verwijderd', 'success');
  }, [setSectionSeats, countSeatsInSection, updateSectionCapacity, showToast]);

  const updateSeatRowLabel = useCallback(async (seatId: string, sectionId: string, newLabel: string) => {
    const { error } = await supabase.from('seats').update({ row_label: newLabel }).eq('id', seatId);
    if (error) {
      showToast('Fout bij wijzigen rij label', 'error');
      return;
    }

    setSectionSeats(prev => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).map(s =>
        s.id === seatId ? { ...s, row_label: newLabel } : s,
      ),
    }));
  }, [setSectionSeats, showToast]);

  const updateSeatNumber = useCallback(async (seatId: string, sectionId: string, newNumber: number) => {
    const { error } = await supabase.from('seats').update({ seat_number: newNumber }).eq('id', seatId);
    if (error) {
      showToast('Fout bij wijzigen stoelnummer', 'error');
      return;
    }

    setSectionSeats(prev => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).map(s =>
        s.id === seatId ? { ...s, seat_number: newNumber } : s,
      ),
    }));
  }, [setSectionSeats, showToast]);

  return {
    settings,
    updateSettings,
    placedInRow,
    lastPlacedId,
    linePreview,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    deleteLastPlaced,
    advanceRow,
    adjustSpacing,
    resetDrawState,
    deleteSeatById,
    updateSeatRowLabel,
    updateSeatNumber,
  };
}
