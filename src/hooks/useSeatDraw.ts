import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Seat, SeatSection } from '../types/seats';
import type { SeatDrawSettings, DrawSeatType } from '../components/SeatDrawSettingsPanel';

const MAX_SEATS_PER_SECTION = 5000;

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
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
) {
  const [settings, setSettings] = useState<SeatDrawSettings>({
    sectionId: null,
    rowLabel: 'A',
    startNumber: 1,
    seatSpacing: 25,
    seatType: 'regular',
  });

  const [placedInRow, setPlacedInRow] = useState(0);
  const [lastPlacedId, setLastPlacedId] = useState<string | null>(null);
  const nextNumber = useRef(1);
  const drawLineStart = useRef<{ x: number; y: number } | null>(null);
  const isDrawingLine = useRef(false);
  const [linePreview, setLinePreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const getSection = useCallback(
    (id: string | null) => sections.find(s => s.id === id) ?? null,
    [sections],
  );

  const isInsideSection = useCallback(
    (canvasX: number, canvasY: number, section: SeatSection): boolean => {
      return (
        canvasX >= section.position_x &&
        canvasX <= section.position_x + section.width &&
        canvasY >= section.position_y &&
        canvasY <= section.position_y + section.height
      );
    },
    [],
  );

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
    ): Promise<Seat | null> => {
      const { data, error } = await supabase
        .from('seats')
        .insert({
          section_id: sectionId,
          row_label: rowLabel,
          seat_number: seatNumber,
          x_position: relX,
          y_position: relY,
          status: 'available',
          seat_type: seatType,
          is_active: true,
        })
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
      const section = getSection(settings.sectionId);
      if (!section) {
        showToast('Kies eerst een sectie in de instellingen', 'error');
        return;
      }

      if (!isInsideSection(canvasX, canvasY, section)) {
        showToast('Klik binnen een sectie om een stoel te plaatsen', 'info');
        return;
      }

      const currentCount = countSeatsInSection(section.id);
      if (currentCount >= MAX_SEATS_PER_SECTION) {
        showToast(`Maximaal ${MAX_SEATS_PER_SECTION} stoelen per sectie bereikt`, 'error');
        return;
      }

      const relX = canvasX - section.position_x;
      const relY = canvasY - section.position_y;
      const seatNum = nextNumber.current;

      const seat = await insertSeatToDb(
        section.id,
        settings.rowLabel,
        seatNum,
        relX,
        relY,
        settings.seatType,
      );

      if (seat) {
        nextNumber.current = seatNum + 1;
        setSettings(prev => ({ ...prev, startNumber: seatNum + 1 }));
        setPlacedInRow(prev => prev + 1);
        setLastPlacedId(seat.id);

        setSectionSeats(prev => ({
          ...prev,
          [section.id]: [...(prev[section.id] || []), seat],
        }));

        await updateSectionCapacity(section.id, currentCount + 1);
      }
    },
    [settings, getSection, isInsideSection, countSeatsInSection, insertSeatToDb, setSectionSeats, updateSectionCapacity, showToast],
  );

  const placeSeatsAlongLine = useCallback(
    async (x1: number, y1: number, x2: number, y2: number) => {
      const section = getSection(settings.sectionId);
      if (!section) {
        showToast('Kies eerst een sectie in de instellingen', 'error');
        return;
      }

      const dx = x2 - x1;
      const dy = y2 - y1;
      const totalDist = Math.sqrt(dx * dx + dy * dy);
      if (totalDist < 5) {
        await placeSingleSeat(x1, y1);
        return;
      }

      const spacing = settings.seatSpacing;
      const count = Math.max(1, Math.floor(totalDist / spacing) + 1);
      const currentCount = countSeatsInSection(section.id);

      if (currentCount + count > MAX_SEATS_PER_SECTION) {
        showToast(`Dit zou meer dan ${MAX_SEATS_PER_SECTION} stoelen geven`, 'error');
        return;
      }

      const ux = dx / totalDist;
      const uy = dy / totalDist;

      const newSeats: Array<{
        section_id: string;
        row_label: string;
        seat_number: number;
        x_position: number;
        y_position: number;
        status: string;
        seat_type: string;
        is_active: boolean;
      }> = [];

      let seatNum = nextNumber.current;

      for (let i = 0; i < count; i++) {
        const cx = x1 + ux * spacing * i;
        const cy = y1 + uy * spacing * i;

        if (!isInsideSection(cx, cy, section)) continue;

        const relX = cx - section.position_x;
        const relY = cy - section.position_y;

        newSeats.push({
          section_id: section.id,
          row_label: settings.rowLabel,
          seat_number: seatNum,
          x_position: relX,
          y_position: relY,
          status: 'available',
          seat_type: settings.seatType,
          is_active: true,
        });
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
      setSettings(prev => ({ ...prev, startNumber: seatNum }));
      setPlacedInRow(prev => prev + insertedSeats.length);
      if (insertedSeats.length > 0) {
        setLastPlacedId(insertedSeats[insertedSeats.length - 1].id);
      }

      setSectionSeats(prev => ({
        ...prev,
        [section.id]: [...(prev[section.id] || []), ...insertedSeats],
      }));

      await updateSectionCapacity(section.id, currentCount + insertedSeats.length);
    },
    [settings, getSection, isInsideSection, countSeatsInSection, placeSingleSeat, setSectionSeats, updateSectionCapacity, showToast],
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
    const { error } = await supabase.from('seats').delete().eq('id', lastPlacedId);
    if (error) {
      showToast('Fout bij verwijderen stoel', 'error');
      return;
    }

    setSectionSeats(prev => {
      const seats = prev[settings.sectionId!] || [];
      return {
        ...prev,
        [settings.sectionId!]: seats.filter(s => s.id !== lastPlacedId),
      };
    });

    const newCount = countSeatsInSection(settings.sectionId) - 1;
    await updateSectionCapacity(settings.sectionId, Math.max(0, newCount));

    nextNumber.current = Math.max(1, nextNumber.current - 1);
    setSettings(prev => ({ ...prev, startNumber: Math.max(1, prev.startNumber - 1) }));
    setPlacedInRow(prev => Math.max(0, prev - 1));

    const seats = sectionSeats[settings.sectionId] || [];
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
