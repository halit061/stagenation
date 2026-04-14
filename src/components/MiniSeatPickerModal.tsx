import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { X, Loader2, ZoomIn, ZoomOut, Maximize2, Check } from 'lucide-react';
import { SvgSeatChair } from './SeatIcon';
import type { SeatSection, Seat } from '../types/seats';
import type { SeatAssignment } from './GuestTicketSeatSelector';
import type { FloorplanObject } from '../services/seatPickerService';

interface PickerSeat extends Seat {
  cx: number;
  cy: number;
  sectionId: string;
}

interface Props {
  eventId: string;
  ticketTypeId?: string;
  maxSeats: number;
  currentAssignments: SeatAssignment[];
  onConfirm: (assignments: SeatAssignment[]) => void;
  onClose: () => void;
}

const HEADER_H = 24;
const PAD = 10;
const SEAT_SIZE = 56;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 6;

function computePickerSeats(section: SeatSection, seats: Seat[]): PickerSeat[] {
  if (seats.length === 0) return [];
  const sx = section.position_x;
  const sy = section.position_y;
  const sw = section.width;
  const sh = section.height;
  const bodyTop = sy + HEADER_H + PAD;
  const bodyH = Math.max(1, sh - HEADER_H - PAD * 2);
  const bodyW = Math.max(1, sw - PAD * 2);
  const bodyLeft = sx + PAD;

  const minX = Math.min(...seats.map(s => s.x_position));
  const maxX = Math.max(...seats.map(s => s.x_position));
  const minY = Math.min(...seats.map(s => s.y_position));
  const maxY = Math.max(...seats.map(s => s.y_position));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min(bodyW / rangeX, bodyH / rangeY);
  const fittedW = rangeX * scale;
  const fittedH = rangeY * scale;
  const offsetX = bodyLeft + (bodyW - fittedW) / 2;
  const offsetY = bodyTop + (bodyH - fittedH) / 2;

  return seats.map(seat => ({
    ...seat,
    cx: Math.max(sx + 2, Math.min(sx + sw - 2, offsetX + (seat.x_position - minX) * scale)),
    cy: Math.max(sy + HEADER_H + 2, Math.min(sy + sh - 2, offsetY + (seat.y_position - minY) * scale)),
    sectionId: section.id,
  }));
}

export function MiniSeatPickerModal({ eventId, ticketTypeId, maxSeats, currentAssignments, onConfirm, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<SeatSection[]>([]);
  const [allSeats, setAllSeats] = useState<PickerSeat[]>([]);
  const [floorplanObjects, setFloorplanObjects] = useState<FloorplanObject[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentAssignments.map(a => a.seat_id)));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredSeat, setHoveredSeat] = useState<PickerSeat | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const didPan = useRef(false);

  useEffect(() => {
    loadData();
  }, [eventId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: layouts } = await supabase
        .from('venue_layouts')
        .select('id')
        .eq('event_id', eventId)
        .eq('is_template', false)
        .limit(10000);

      if (!layouts || layouts.length === 0) { setLoading(false); return; }

      const layoutIds = layouts.map(l => l.id);
      const [sectionsRes, objectsRes] = await Promise.all([
        supabase
          .from('seat_sections')
          .select('*')
          .in('layout_id', layoutIds)
          .eq('is_active', true)
          .order('sort_order')
          .limit(10000),
        supabase
          .from('floorplan_objects')
          .select('*')
          .eq('event_id', eventId)
          .eq('is_visible', true)
          .eq('is_active', true)
          .limit(10000),
      ]);

      let secs = (sectionsRes.data || []) as SeatSection[];
      setFloorplanObjects((objectsRes.data || []) as FloorplanObject[]);

      if (ticketTypeId) {
        const { data: tts } = await supabase
          .from('ticket_type_sections')
          .select('section_id')
          .eq('ticket_type_id', ticketTypeId)
          .limit(10000);
        if (tts && tts.length > 0) {
          const allowedIds = new Set(tts.map(t => t.section_id));
          secs = secs.filter(s => allowedIds.has(s.id));
        }
      }

      setSections(secs);

      const sectionIds = secs.map(s => s.id);
      if (sectionIds.length === 0) { setLoading(false); return; }

      const allSeatData: Seat[] = [];
      const PAGE = 1000;
      for (let i = 0; i < sectionIds.length; i += 5) {
        const batch = sectionIds.slice(i, i + 5);
        const promises = batch.map(async (sid) => {
          const rows: Seat[] = [];
          let from = 0;
          while (true) {
            const { data, error } = await supabase
              .from('seats')
              .select('*')
              .eq('section_id', sid)
              .eq('is_active', true)
              .order('row_label')
              .order('seat_number')
              .range(from, from + PAGE - 1);
            if (error) throw error;
            const chunk = (data ?? []) as Seat[];
            rows.push(...chunk);
            if (chunk.length < PAGE) break;
            from += PAGE;
          }
          return rows;
        });
        const results = await Promise.all(promises);
        results.forEach(r => allSeatData.push(...r));
      }

      const computed: PickerSeat[] = [];
      for (const sec of secs) {
        const secSeats = allSeatData.filter(s => s.section_id === sec.id);
        computed.push(...computePickerSeats(sec, secSeats));
      }
      setAllSeats(computed);
    } catch (e) {
      console.error('MiniSeatPicker load error:', e);
    } finally {
      setLoading(false);
    }
  }

  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of allSeats) {
      if (s.cx - SEAT_SIZE / 2 < minX) minX = s.cx - SEAT_SIZE / 2;
      if (s.cy - SEAT_SIZE / 2 < minY) minY = s.cy - SEAT_SIZE / 2;
      if (s.cx + SEAT_SIZE / 2 > maxX) maxX = s.cx + SEAT_SIZE / 2;
      if (s.cy + SEAT_SIZE / 2 > maxY) maxY = s.cy + SEAT_SIZE / 2;
    }
    for (const obj of floorplanObjects) {
      if (obj.x < minX) minX = obj.x;
      if (obj.y < minY) minY = obj.y;
      if (obj.x + obj.width > maxX) maxX = obj.x + obj.width;
      if (obj.y + obj.height > maxY) maxY = obj.y + obj.height;
    }
    for (const sec of sections) {
      if (sec.position_x < minX) minX = sec.position_x;
      if (sec.position_y < minY) minY = sec.position_y;
      if (sec.position_x + sec.width > maxX) maxX = sec.position_x + sec.width;
      if (sec.position_y + sec.height > maxY) maxY = sec.position_y + sec.height;
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    return { minX, minY, maxX, maxY };
  }, [allSeats, floorplanObjects, sections]);

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
    if (contentW <= 0 || contentH <= 0) return;
    const padding = 40;
    const z = Math.min((cw - padding * 2) / contentW, (ch - padding * 2) / contentH);
    const cx = bounds.minX + contentW / 2;
    const cy = bounds.minY + contentH / 2;
    setZoom(z);
    setPan({ x: cw / 2 - cx * z, y: ch / 2 - cy * z });
  }, [bounds]);

  useEffect(() => {
    if (!loading && allSeats.length > 0) {
      requestAnimationFrame(() => fitToView());
    }
  }, [loading, allSeats.length, fitToView]);

  const seatsBySection = useMemo(() => {
    const map = new Map<string, PickerSeat[]>();
    for (const s of allSeats) {
      const arr = map.get(s.sectionId) || [];
      arr.push(s);
      map.set(s.sectionId, arr);
    }
    return map;
  }, [allSeats]);

  const sectionMap = useMemo(() => {
    const m = new Map<string, SeatSection>();
    for (const s of sections) m.set(s.id, s);
    return m;
  }, [sections]);

  const handleSeatClick = (seat: PickerSeat) => {
    if (seat.status !== 'available' && !selectedIds.has(seat.id)) return;

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(seat.id)) {
        next.delete(seat.id);
      } else {
        if (next.size >= maxSeats) return prev;
        next.add(seat.id);
      }
      return next;
    });
  };

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    const ratio = newZoom / zoom;
    setPan({ x: mx - (mx - pan.x) * ratio, y: my - (my - pan.y) * ratio });
    setZoom(newZoom);
  }, [zoom, pan]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    didPan.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan.current = true;
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
  };

  const handleMouseUp = () => { isDragging.current = false; };

  const handleSeatPointerDown = (e: React.PointerEvent, seat: PickerSeat) => {
    e.stopPropagation();
  };

  const handleSeatPointerUp = (e: React.PointerEvent, seat: PickerSeat) => {
    e.stopPropagation();
    if (didPan.current) return;
    handleSeatClick(seat);
  };

  const handleConfirm = () => {
    const assignments: SeatAssignment[] = [];
    for (const id of selectedIds) {
      const seat = allSeats.find(s => s.id === id);
      if (!seat) continue;
      const section = sectionMap.get(seat.sectionId);
      if (!section) continue;
      assignments.push({
        seat_id: seat.id,
        section_name: section.name,
        row_label: seat.row_label,
        seat_number: seat.seat_number,
      });
    }
    onConfirm(assignments);
  };

  const handleZoomIn = () => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth / 2;
    const ch = el.clientHeight / 2;
    const newZoom = Math.min(MAX_ZOOM, zoom * 1.4);
    const ratio = newZoom / zoom;
    setPan({ x: cw - (cw - pan.x) * ratio, y: ch - (ch - pan.y) * ratio });
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth / 2;
    const ch = el.clientHeight / 2;
    const newZoom = Math.max(MIN_ZOOM, zoom / 1.4);
    const ratio = newZoom / zoom;
    setPan({ x: cw - (cw - pan.x) * ratio, y: ch - (ch - pan.y) * ratio });
    setZoom(newZoom);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden"
        style={{ width: '85vw', height: '85vh', maxWidth: 1400, maxHeight: 900 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800/50">
          <div>
            <h3 className="text-lg font-semibold text-white">Kies stoelen op zaalplan</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              Klik op groene stoelen om te selecteren ({selectedIds.size}/{maxSeats})
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selectedIds.size === maxSeats && (
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 transition-colors"
              >
                <Check className="w-4 h-4" />
                Bevestig selectie
              </button>
            )}
            {selectedIds.size > 0 && selectedIds.size < maxSeats && (
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
              >
                <Check className="w-4 h-4" />
                Bevestig ({selectedIds.size})
              </button>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-3 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Zaalplan laden...</span>
              </div>
            </div>
          ) : (
            <>
              <div
                ref={containerRef}
                className="w-full h-full overflow-hidden"
                style={{ touchAction: 'none', cursor: isDragging.current ? 'grabbing' : 'grab' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <svg width="100%" height="100%">
                  <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {floorplanObjects.map(obj => {
                      const typeColors: Record<string, { bg: string; border: string }> = {
                        STAGE: { bg: 'rgba(239,68,68,0.08)', border: '#ef4444' },
                        BAR: { bg: 'rgba(168,85,247,0.08)', border: '#a855f7' },
                        DANCEFLOOR: { bg: 'rgba(59,130,246,0.08)', border: '#3b82f6' },
                      };
                      const colors = typeColors[obj.type] || { bg: 'rgba(148,163,184,0.06)', border: '#64748b' };
                      return (
                        <g key={obj.id} style={{ pointerEvents: 'none' }}>
                          <rect
                            x={obj.x} y={obj.y} width={obj.width} height={obj.height}
                            rx={6} fill={colors.bg} stroke={colors.border} strokeWidth={1} strokeOpacity={0.3}
                            transform={obj.rotation ? `rotate(${obj.rotation}, ${obj.x + obj.width / 2}, ${obj.y + obj.height / 2})` : undefined}
                          />
                          <text
                            x={obj.x + obj.width / 2} y={obj.y + obj.height / 2}
                            textAnchor="middle" dominantBaseline="central"
                            fill="#94a3b8" fontSize={obj.font_size || 13} fontWeight="600" letterSpacing="0.05em"
                          >
                            {(obj.name || obj.type).toUpperCase()}
                          </text>
                        </g>
                      );
                    })}

                    {sections.map(section => {
                      const secSeats = seatsBySection.get(section.id) || [];
                      const color = section.color || '#3b82f6';
                      return (
                        <g key={section.id}>
                          <rect
                            x={section.position_x} y={section.position_y}
                            width={section.width} height={section.height}
                            rx={8} fill={color} fillOpacity={0.05}
                            stroke={color} strokeWidth={1} strokeOpacity={0.15}
                            style={{ pointerEvents: 'none' }}
                          />
                          <text
                            x={section.position_x + section.width / 2}
                            y={section.position_y + 14}
                            textAnchor="middle" fill={color} fillOpacity={0.6}
                            fontSize="11" fontWeight="600" letterSpacing="0.04em"
                            style={{ pointerEvents: 'none' }}
                          >
                            {section.name}
                          </text>

                          {secSeats.map(seat => {
                            const isSelected = selectedIds.has(seat.id);
                            const isSold = seat.status === 'sold';
                            const isReserved = seat.status === 'reserved';
                            const isBlocked = seat.status === 'blocked';
                            const isAvailable = seat.status === 'available';
                            const clickable = isAvailable || isSelected;

                            let fillColor: string;
                            let borderColor: string;
                            let fillOpacity = 1;

                            if (isSelected) {
                              fillColor = '#3b82f6';
                              borderColor = '#1d4ed8';
                            } else if (isSold) {
                              fillColor = '#f87171';
                              borderColor = '#dc2626';
                              fillOpacity = 0.85;
                            } else if (isReserved) {
                              fillColor = '#fb923c';
                              borderColor = '#ea580c';
                              fillOpacity = 0.9;
                            } else if (isBlocked) {
                              fillColor = '#d1d5db';
                              borderColor = '#9ca3af';
                              fillOpacity = 0.5;
                            } else {
                              fillColor = '#4ade80';
                              borderColor = '#16a34a';
                            }

                            return (
                              <SvgSeatChair
                                key={seat.id}
                                cx={seat.cx}
                                cy={seat.cy}
                                size={SEAT_SIZE}
                                color={fillColor}
                                opacity={fillOpacity}
                                selected={isSelected}
                                strokeColor={borderColor}
                                strokeWidth={isSelected ? 2.5 : 1.5}
                                style={{
                                  cursor: clickable ? 'pointer' : isSold || isBlocked ? 'not-allowed' : 'default',
                                  pointerEvents: clickable ? 'all' : 'none',
                                }}
                                onPointerDown={(e) => handleSeatPointerDown(e, seat)}
                                onPointerUp={(e) => handleSeatPointerUp(e, seat)}
                                onPointerEnter={(e) => {
                                  setHoveredSeat(seat);
                                  const rect = containerRef.current?.getBoundingClientRect();
                                  if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                                }}
                                onPointerLeave={() => { setHoveredSeat(null); setTooltipPos(null); }}
                              />
                            );
                          })}
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>

              {hoveredSeat && tooltipPos && (
                <div
                  className="absolute z-20 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl pointer-events-none"
                  style={{ left: tooltipPos.x + 14, top: tooltipPos.y - 10, maxWidth: 220 }}
                >
                  <p className="text-white text-xs font-semibold">
                    {sectionMap.get(hoveredSeat.sectionId)?.name}
                  </p>
                  <p className="text-slate-300 text-xs">
                    Rij {hoveredSeat.row_label} - Stoel {hoveredSeat.seat_number}
                  </p>
                  <p className="text-xs mt-1" style={{ color: selectedIds.has(hoveredSeat.id) ? '#3b82f6' : hoveredSeat.status === 'available' ? '#4ade80' : '#f87171' }}>
                    {selectedIds.has(hoveredSeat.id) ? 'Geselecteerd' : hoveredSeat.status === 'available' ? 'Beschikbaar' : hoveredSeat.status}
                  </p>
                </div>
              )}

              <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-10">
                <button
                  onClick={handleZoomIn}
                  className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 shadow-sm transition-colors"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleZoomOut}
                  className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 shadow-sm transition-colors"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={fitToView}
                  className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 shadow-sm transition-colors"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              <div className="absolute bottom-4 left-4 flex items-center gap-4 bg-slate-800/90 border border-slate-700 rounded-lg px-4 py-2.5 z-10">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
                  <span className="text-xs text-slate-300">Vrij</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                  <span className="text-xs text-slate-300">Gekozen</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
                  <span className="text-xs text-slate-300">Bezet</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />
                  <span className="text-xs text-slate-300">Geblokkeerd</span>
                </div>
              </div>

              {selectedIds.size > 0 && (
                <div className="absolute top-4 left-4 bg-slate-800/90 border border-slate-700 rounded-lg px-4 py-3 z-10 max-w-xs">
                  <p className="text-xs text-slate-400 font-medium mb-2">
                    Geselecteerd ({selectedIds.size}/{maxSeats})
                  </p>
                  <div className="space-y-1">
                    {Array.from(selectedIds).map(id => {
                      const seat = allSeats.find(s => s.id === id);
                      if (!seat) return null;
                      const sec = sectionMap.get(seat.sectionId);
                      return (
                        <div key={id} className="flex items-center justify-between text-xs">
                          <span className="text-white">
                            {sec?.name} - Rij {seat.row_label} - Stoel {seat.seat_number}
                          </span>
                          <button
                            onClick={() => setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; })}
                            className="text-slate-500 hover:text-red-400 ml-2 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
