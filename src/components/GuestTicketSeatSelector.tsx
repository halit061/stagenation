import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Armchair, Loader2, AlertCircle, ChevronDown, Map, X } from 'lucide-react';
import { MiniSeatPickerModal } from './MiniSeatPickerModal';

export interface SeatAssignment {
  seat_id: string;
  section_name: string;
  row_label: string;
  seat_number: number;
}

interface SectionWithCount {
  id: string;
  name: string;
  available_count: number;
}

interface SeatOption {
  id: string;
  row_label: string;
  seat_number: number;
  status: string;
}

interface Props {
  eventId: string;
  ticketTypeId?: string;
  personsCount: number;
  assignments: SeatAssignment[];
  onChange: (assignments: SeatAssignment[]) => void;
}

interface SingleSeatPickerProps {
  index: number;
  sections: SectionWithCount[];
  assignment: SeatAssignment | null;
  otherSelectedSeatIds: string[];
  onChange: (assignment: SeatAssignment | null) => void;
}

function SingleSeatPicker({ index, sections, assignment, otherSelectedSeatIds, onChange }: SingleSeatPickerProps) {
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedRowLabel, setSelectedRowLabel] = useState('');
  const [rows, setRows] = useState<string[]>([]);
  const [seats, setSeats] = useState<SeatOption[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingSeats, setLoadingSeats] = useState(false);

  useEffect(() => {
    if (assignment) {
      const section = sections.find(s => s.name === assignment.section_name);
      if (section && section.id !== selectedSectionId) {
        setSelectedSectionId(section.id);
        setSelectedRowLabel(assignment.row_label);
        loadRows(section.id);
        loadSeats(section.id, assignment.row_label);
      }
    }
  }, [assignment?.seat_id]);

  const loadRows = useCallback(async (sectionId: string) => {
    if (!sectionId) { setRows([]); setSeats([]); return; }
    setLoadingRows(true);
    try {
      const allLabels: string[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('seats')
          .select('row_label')
          .eq('section_id', sectionId)
          .eq('is_active', true)
          .order('row_label')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const chunk = data ?? [];
        for (const s of chunk) allLabels.push(s.row_label);
        if (chunk.length < PAGE) break;
        from += PAGE;
      }
      setRows([...new Set(allLabels)]);
    } catch (e) {
      console.error('Error loading rows:', e);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  const loadSeats = useCallback(async (sectionId: string, rowLabel: string) => {
    if (!sectionId || !rowLabel) { setSeats([]); return; }
    setLoadingSeats(true);
    try {
      const { data } = await supabase
        .from('seats')
        .select('id, row_label, seat_number, status')
        .eq('section_id', sectionId)
        .eq('row_label', rowLabel)
        .eq('is_active', true)
        .order('seat_number')
        .limit(10000);
      setSeats(data || []);
    } catch (e) {
      console.error('Error loading seats:', e);
    } finally {
      setLoadingSeats(false);
    }
  }, []);

  const handleSectionChange = (sectionId: string) => {
    setSelectedSectionId(sectionId);
    setSelectedRowLabel('');
    setSeats([]);
    onChange(null);
    if (sectionId) loadRows(sectionId);
  };

  const handleRowChange = (rowLabel: string) => {
    setSelectedRowLabel(rowLabel);
    onChange(null);
    if (selectedSectionId && rowLabel) loadSeats(selectedSectionId, rowLabel);
  };

  const handleSeatChange = (seatId: string) => {
    if (!seatId) { onChange(null); return; }
    const seat = seats.find(s => s.id === seatId);
    const section = sections.find(s => s.id === selectedSectionId);
    if (seat && section) {
      onChange({
        seat_id: seat.id,
        section_name: section.name,
        row_label: seat.row_label,
        seat_number: seat.seat_number,
      });
    }
  };

  const handleClear = () => {
    setSelectedSectionId('');
    setSelectedRowLabel('');
    setSeats([]);
    setRows([]);
    onChange(null);
  };

  return (
    <div className="bg-slate-700/40 border border-slate-600 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Armchair className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-blue-400">Ticket {index + 1}</span>
        {assignment && (
          <>
            <span className="ml-auto text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
              {assignment.section_name} - Rij {assignment.row_label} - Stoel {assignment.seat_number}
            </span>
            <button onClick={handleClear} className="text-slate-400 hover:text-red-400 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Sectie</label>
          <div className="relative">
            <select
              value={selectedSectionId}
              onChange={(e) => handleSectionChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
            >
              <option value="">Kies sectie</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.available_count} vrij)
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Rij {loadingRows && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}
          </label>
          <div className="relative">
            <select
              value={selectedRowLabel}
              onChange={(e) => handleRowChange(e.target.value)}
              disabled={!selectedSectionId || rows.length === 0}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 appearance-none"
            >
              <option value="">Kies rij</option>
              {rows.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Stoel {loadingSeats && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}
          </label>
          <div className="relative">
            <select
              value={assignment?.seat_id || ''}
              onChange={(e) => handleSeatChange(e.target.value)}
              disabled={!selectedRowLabel || seats.length === 0}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 appearance-none"
            >
              <option value="">Kies stoel</option>
              {seats.map(s => {
                const takenByOther = otherSelectedSeatIds.includes(s.id);
                const isUnavailable = s.status !== 'available' || takenByOther;
                return (
                  <option key={s.id} value={s.id} disabled={isUnavailable}>
                    Stoel {s.seat_number}{isUnavailable ? (takenByOther ? ' (al gekozen)' : ` (${s.status})`) : ''}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function GuestTicketSeatSelector({ eventId, ticketTypeId, personsCount, assignments, onChange }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [sections, setSections] = useState<SectionWithCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLayout, setHasLayout] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setSections([]);
      setHasLayout(false);
      setEnabled(false);
      onChange([]);
      return;
    }
    onChange([]);
    loadSections();
  }, [eventId, ticketTypeId]);

  useEffect(() => {
    if (!enabled) {
      onChange([]);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled && assignments.length > personsCount) {
      onChange(assignments.slice(0, personsCount));
    }
  }, [personsCount]);

  async function loadSections() {
    setLoading(true);
    try {
      const { data: layouts } = await supabase
        .from('venue_layouts')
        .select('id')
        .eq('event_id', eventId)
        .eq('is_template', false)
        .limit(10000);

      if (!layouts || layouts.length === 0) {
        setHasLayout(false);
        setSections([]);
        setLoading(false);
        return;
      }

      const layoutIds = layouts.map(l => l.id);
      const { data: allSectionData } = await supabase
        .from('seat_sections')
        .select('id, name')
        .in('layout_id', layoutIds)
        .eq('is_active', true)
        .order('sort_order')
        .limit(10000);

      if (!allSectionData || allSectionData.length === 0) {
        setHasLayout(false);
        setSections([]);
        setLoading(false);
        return;
      }

      let sectionData = allSectionData;
      if (ticketTypeId) {
        const { data: tts } = await supabase
          .from('ticket_type_sections')
          .select('section_id')
          .eq('ticket_type_id', ticketTypeId)
          .limit(10000);
        if (tts && tts.length > 0) {
          const allowedIds = new Set(tts.map(t => t.section_id));
          sectionData = allSectionData.filter(s => allowedIds.has(s.id));
        }
      }

      if (sectionData.length === 0) {
        setHasLayout(true);
        setSections([]);
        setLoading(false);
        return;
      }

      const sectionIds = sectionData.map(s => s.id);
      const countMap: Record<string, number> = {};
      await Promise.all(sectionIds.map(async (sid) => {
        const { count } = await supabase
          .from('seats')
          .select('id', { count: 'exact', head: true })
          .eq('section_id', sid)
          .eq('status', 'available')
          .eq('is_active', true);
        countMap[sid] = count ?? 0;
      }));

      const sectionsWithCounts: SectionWithCount[] = sectionData.map(s => ({
        id: s.id,
        name: s.name,
        available_count: countMap[s.id] || 0,
      }));

      setSections(sectionsWithCounts);
      setHasLayout(true);
    } catch (e) {
      console.error('Error loading sections:', e);
    } finally {
      setLoading(false);
    }
  }

  const handleSingleChange = (index: number, assignment: SeatAssignment | null) => {
    const updated = [...assignments];
    if (assignment) {
      updated[index] = assignment;
    } else {
      updated[index] = undefined as any;
    }
    const filtered = [];
    for (let i = 0; i < personsCount; i++) {
      if (updated[i]) filtered.push(updated[i]);
    }
    onChange(filtered);
  };

  const getOtherSelectedSeatIds = (index: number): string[] => {
    return assignments
      .filter((_, i) => i !== index)
      .map(a => a?.seat_id)
      .filter(Boolean) as string[];
  };

  const handleMapConfirm = (selected: SeatAssignment[]) => {
    onChange(selected);
    setShowMapPicker(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-slate-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Zaalplan laden...
      </div>
    );
  }

  if (!hasLayout) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-3 cursor-pointer group">
          <div
            className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-slate-600'}`}
            onClick={() => {
              const next = !enabled;
              setEnabled(next);
              if (next) setShowMapPicker(true);
            }}
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors">
            Specifieke stoel toewijzen
          </span>
        </label>
        {enabled && (
          <span className="text-xs text-slate-400">
            {assignments.filter(Boolean).length}/{personsCount} stoelen gekozen
          </span>
        )}
      </div>

      {enabled && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowMapPicker(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm font-medium hover:bg-blue-600/30 hover:border-blue-500/50 transition-all"
          >
            <Map className="w-4 h-4" />
            Kies {personsCount > 1 ? `${personsCount} stoelen` : 'stoel'} op zaalplan
          </button>

          {assignments.filter(Boolean).length < personsCount && assignments.filter(Boolean).length > 0 && (
            <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Wijs voor elk ticket een stoel toe ({personsCount - assignments.filter(Boolean).length} resterend)
            </div>
          )}

          {Array.from({ length: personsCount }).map((_, index) => (
            <SingleSeatPicker
              key={index}
              index={index}
              sections={sections}
              assignment={assignments[index] || null}
              otherSelectedSeatIds={getOtherSelectedSeatIds(index)}
              onChange={(a) => handleSingleChange(index, a)}
            />
          ))}
        </div>
      )}

      {showMapPicker && (
        <MiniSeatPickerModal
          eventId={eventId}
          ticketTypeId={ticketTypeId}
          maxSeats={personsCount}
          currentAssignments={assignments}
          onConfirm={handleMapConfirm}
          onClose={() => setShowMapPicker(false)}
        />
      )}
    </div>
  );
}
