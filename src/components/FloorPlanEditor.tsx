import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Save, Trash2, ZoomIn, ZoomOut, Maximize2, Move, Grid3x3, Square, Circle, Copy, Rows3, Armchair, CreditCard as Edit, BoxSelect, Undo2, Redo2, HelpCircle, Image, Eye, EyeOff, Ruler, PenTool } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from './Toast';
import { LayoutToolbar } from './LayoutToolbar';
import { SectionConfigModal } from './SectionConfigModal';
import { SeatSectionRenderer } from './SeatSectionRenderer';
import { SectionPropertiesPanel } from './SectionPropertiesPanel';
import { SeatInteractionLayer } from './SeatInteractionLayer';
import { SeatPropertiesPanel } from './SeatPropertiesPanel';
import { SelectionCounter } from './SelectionCounter';
import { SeatActionBar } from './SeatActionBar';
import { SeatContextMenu } from './SeatContextMenu';
import { SeatLegend } from './SeatLegend';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { AdminViewerCount } from './AdminViewerCount';
import { AdminEventStatus } from './AdminEventStatus';
import { AdminSalesWidget } from './AdminSalesWidget';
import { OrderToast } from './AdminNotifications';
import { FloatingToolbar } from './FloatingToolbar';
import { BackgroundUploadModal } from './BackgroundUploadModal';
import { DimensionsPanel } from './DimensionsPanel';
import { useAdminSeatRealtime } from '../hooks/useAdminSeatRealtime';
import type { BackgroundSettings } from '../lib/backgroundUpload';
import type { SectionFormData } from './SectionConfigModal';
import type { VenueLayout, SeatSection, Seat, TicketType } from '../types/seats';
import { getSectionsByLayout, createSection, updateSection, deleteSection, generateSeats, getSeatsBySection, updateSeat as updateSeatDb, deleteSeatsById, updateSectionCapacity, updateSeatPositions, getTicketTypesForEvent, getAllTicketTypeSectionsForEvent, linkTicketTypeToSections, loadAllSeatsBatched } from '../services/seatService';
import { useSeatHistory } from '../hooks/useSeatHistory';
import { useSeatDrag } from '../hooks/useSeatDrag';
import { useSeatDraw } from '../hooks/useSeatDraw';
import { SeatDrawSettingsPanel } from './SeatDrawSettingsPanel';
import { SeatDrawContextMenu } from './SeatDrawContextMenu';
import { SeatCanvasLayer } from './SeatCanvasLayer';
import type { CanvasSeat } from './SeatCanvasLayer';
import { SeatLoadingProgress } from './SeatLoadingProgress';
import { useViewportCulling } from '../hooks/useViewportCulling';

interface FloorplanTable {
  id: string;
  table_number: string;
  table_type: string;
  capacity: number;
  price: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  is_active: boolean;
  manual_status: string;
  package_id: string | null;
  max_guests: number | null;
  included_text: string | null;
  included_items: any[];
  created_at: string;
  updated_at: string;
}

interface FloorplanObject {
  id: string;
  event_id: string | null;
  type: string;
  object_type: string;
  name: string;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  font_size: number | null;
  font_color: string | null;
  font_weight: string | null;
  is_active: boolean;
  is_visible: boolean;
  name_nl: string | null;
  name_tr: string | null;
  name_fr: string | null;
  name_de: string | null;
  included_text: string | null;
  created_at: string;
  updated_at: string;
}

interface TablePackage {
  id: string;
  name: string;
  base_price: number;
}

type EditorTool = 'select' | 'draw_seat' | 'add_seated' | 'add_standing' | 'add_decor' | 'add_bar' | 'add_stage' | 'add_dancefloor' | 'add_tribune';
type ObjectType = 'BAR' | 'STAGE' | 'DANCEFLOOR' | 'DECOR_TABLE' | 'DJ_BOOTH' | 'ENTRANCE' | 'EXIT' | 'RESTROOM' | 'TRIBUNE';
type SelectedItemType = { type: 'table' | 'object' | 'section'; data: FloorplanTable | FloorplanObject | SeatSection };

const CANVAS_W = 9000;
const CANVAS_H = 4500;
const DRAG_THRESHOLD = 5;
const SNAP_GRID = 10;
const SNAP_PROXIMITY = 10;
const MIN_SECTION_W = 80;
const MIN_SECTION_H = 60;

export function FloorPlanEditor() {
  const { showToast } = useToast();
  const [tables, setTables] = useState<FloorplanTable[]>([]);
  const [objects, setObjects] = useState<FloorplanObject[]>([]);
  const [packages, setPackages] = useState<TablePackage[]>([]);
  const [selectedItem, setSelectedItem] = useState<SelectedItemType | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w' | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, ox: 0, oy: 0 });
  const resizeOrigSection = useRef<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(0.35);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }[]>([]);
  const dragIntent = useRef<{
    type: 'drag' | 'resize';
    startX: number;
    startY: number;
    item: SelectedItemType;
    handle?: 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w';
    thresholdMet: boolean;
  } | null>(null);
  const dragGhostPos = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const emptyBg: BackgroundSettings = {
    background_image_url: null, background_opacity: 0.3,
    background_position_x: 0, background_position_y: 0,
    background_width: null, background_height: null,
    background_rotation: 0, background_locked: true,
  };
  const [bgSettings, setBgSettings] = useState<BackgroundSettings>(emptyBg);
  const [bgVisible, setBgVisible] = useState(true);
  const [showBgModal, setShowBgModal] = useState(false);
  const [bgImageLoaded, setBgImageLoaded] = useState(false);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [rulerActive, setRulerActive] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<{ x: number; y: number }[]>([]);
  const [rulerPixelLength, setRulerPixelLength] = useState<number | null>(null);
  const [showRulerModal, setShowRulerModal] = useState(false);
  const [rulerRealDistance, setRulerRealDistance] = useState('');
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState<number | null>(null);
  const [currentTool, setCurrentTool] = useState<EditorTool>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const [currentLayout, setCurrentLayout] = useState<VenueLayout | null>(null);
  const [layoutName, setLayoutName] = useState('');
  const [seatSections, setSeatSections] = useState<SeatSection[]>([]);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [sectionModalType, setSectionModalType] = useState<'tribune' | 'plein'>('tribune');
  const [editingSection, setEditingSection] = useState<SeatSection | null>(null);
  const [sectionSaving, setSectionSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; section: SeatSection } | null>(null);
  const [sectionSeats, setSectionSeats] = useState<Record<string, Seat[]>>({});
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [marqueeActive, setMarqueeActive] = useState(false);
  const [seatContextMenu, setSeatContextMenu] = useState<{
    seat: Seat; section: SeatSection; position: { x: number; y: number };
  } | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [seatLoadProgress, setSeatLoadProgress] = useState({ loaded: 0, sectionsDone: 0, totalSections: 0 });
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [seatsLoadComplete, setSeatsLoadComplete] = useState(false);
  const [canvasData, setCanvasData] = useState<{
    seats: CanvasSeat[];
    selectedIds: Set<string>;
    hoveredId: string | null;
    marqueePreviewIds: Set<string>;
    seatSize: number;
  } | null>(null);
  const [scrollPos, setScrollPos] = useState({ left: 0, top: 0 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventInfo, setEventInfo] = useState<{ name: string; start_date: string } | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  const [eventTicketTypes, setEventTicketTypes] = useState<TicketType[]>([]);
  const [sectionTicketLinks, setSectionTicketLinks] = useState<Record<string, string[]>>({});
  const pendingTicketLinks = useRef<string[] | null>(null);

  const sectionIds = useMemo(() => seatSections.map(s => s.id), [seatSections]);

  const ticketTypeColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tt of eventTicketTypes) {
      if (tt.color) map[tt.id] = tt.color;
    }
    return map;
  }, [eventTicketTypes]);

  const handleRealtimeSeatUpdate = useCallback((seat: Partial<Seat> & { id: string }) => {
    setSectionSeats(prev => {
      const next = { ...prev };
      for (const [secId, seats] of Object.entries(next)) {
        const idx = seats.findIndex(s => s.id === seat.id);
        if (idx >= 0) {
          next[secId] = seats.map(s => s.id === seat.id ? { ...s, ...seat } as Seat : s);
          break;
        }
      }
      return next;
    });
  }, []);

  const {
    viewerCount,
    salesStats,
    latestOrder,
  } = useAdminSeatRealtime(
    currentLayout?.id ?? null,
    currentLayout?.event_id ?? null,
    sectionIds,
    handleRealtimeSeatUpdate,
  );

  useEffect(() => {
    if (!currentLayout?.event_id) { setEventInfo(null); return; }
    (async () => {
      const { data } = await supabase
        .from('events')
        .select('name, start_date')
        .eq('id', currentLayout.event_id!)
        .maybeSingle();
      setEventInfo(data ?? null);
    })();
  }, [currentLayout?.event_id]);

  const { pushAction, undo, redo, canUndo, canRedo } = useSeatHistory(
    setSectionSeats, setSeatSections, setSelectedSeatIds, showToast
  );

  const { dragState, startDrag, moveDrag, endDrag } = useSeatDrag(
    seatSections, sectionSeats, selectedSeatIds, setSectionSeats, pushAction, showGrid
  );

  const seatDraw = useSeatDraw(seatSections, sectionSeats, setSectionSeats, setSeatSections, showToast, currentLayout?.id ?? null, CANVAS_W, CANVAS_H);
  const [drawContextMenu, setDrawContextMenu] = useState<{
    seat: Seat; section: SeatSection; position: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const nudgeItem = useCallback((dx: number, dy: number) => {
    if (!selectedItem) return;
    if (selectedItem.type === 'section') {
      const sec = selectedItem.data as SeatSection;
      const nx = Math.max(0, Math.min(CANVAS_W - sec.width, sec.position_x + dx));
      const ny = Math.max(0, Math.min(CANVAS_H - sec.height, sec.position_y + dy));
      const updated = { ...sec, position_x: nx, position_y: ny };
      setSeatSections(prev => prev.map(s => s.id === sec.id ? updated : s));
      setSelectedItem({ type: 'section', data: updated });
      updateSection(sec.id, { position_x: nx, position_y: ny }).catch(() => {});
    } else {
      const d = selectedItem.data as FloorplanTable | FloorplanObject;
      const nx = Math.max(0, Math.min(CANVAS_W - d.width, d.x + dx));
      const ny = Math.max(0, Math.min(CANVAS_H - d.height, d.y + dy));
      const updated = { ...d, x: nx, y: ny } as FloorplanTable | FloorplanObject;
      applyLocalUpdate(updated);
      if (selectedItem.type === 'table') saveTable(updated as FloorplanTable);
      else saveObject(updated as FloorplanObject);
    }
  }, [selectedItem, seatSections]);

  const rotateSelectedItem = useCallback((angle: number) => {
    if (!selectedItem) return;
    const current = selectedItem.data.rotation || 0;
    const newAngle = ((current + angle) % 360 + 360) % 360;
    handleRotateItem(newAngle);
  }, [selectedItem]);

  const handleRotateItem = useCallback(async (angle: number) => {
    if (!selectedItem) return;
    if (selectedItem.type === 'section') {
      const sec = selectedItem.data as SeatSection;
      const updated = { ...sec, rotation: angle };
      setSeatSections(prev => prev.map(s => s.id === sec.id ? updated : s));
      setSelectedItem({ type: 'section', data: updated });
      try { await updateSection(sec.id, { rotation: angle }); } catch {}
    } else {
      const d = selectedItem.data as FloorplanTable | FloorplanObject;
      const updated = { ...d, rotation: angle } as FloorplanTable | FloorplanObject;
      applyLocalUpdate(updated);
      if (selectedItem.type === 'table') await saveTable(updated as FloorplanTable);
      else await saveObject(updated as FloorplanObject);
    }
  }, [selectedItem]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Z') {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveShortcut();
        return;
      }
      if (e.key === 'Escape') {
        if (currentTool === 'draw_seat') {
          setCurrentTool('select');
          seatDraw.resetDrawState();
          return;
        }
        setSelectedItem(null);
        setContextMenu(null);
        setSeatContextMenu(null);
        setDrawContextMenu(null);
        return;
      }
      if (currentTool === 'draw_seat') {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          seatDraw.deleteLastPlaced();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          seatDraw.advanceRow();
          return;
        }
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          seatDraw.adjustSpacing(5);
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          seatDraw.adjustSpacing(-5);
          return;
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSeatIds.size > 0) {
        e.preventDefault();
        setShowDeleteConfirm(true);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItem) {
        e.preventDefault();
        if (selectedItem.type === 'section') handleDeleteSection(selectedItem.data as SeatSection);
        else deleteItem();
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setBgVisible(v => !v);
          return;
        }
      }
      if (selectedItem) {
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeItem(-step, 0); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); nudgeItem(step, 0); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); nudgeItem(0, -step); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); nudgeItem(0, step); return; }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotateSelectedItem(15); return; }
        if (e.key === '[') { e.preventDefault(); rotateSelectedItem(-15); return; }
        if (e.key === ']') { e.preventDefault(); rotateSelectedItem(15); return; }
        if (e.key === 'd' || (e.ctrlKey && e.key === 'd') || (e.metaKey && e.key === 'd')) {
          e.preventDefault();
          if (selectedItem.type === 'section') handleDuplicateSection(selectedItem.data as SeatSection);
          else duplicateItem();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedItem.type === 'section') openEditSection(selectedItem.data as SeatSection);
          return;
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedSeatIds, selectedItem, nudgeItem, rotateSelectedItem, currentTool, seatDraw]);

  async function handleSaveShortcut() {
    const saveBtn = document.querySelector('[data-layout-save]') as HTMLButtonElement | null;
    if (saveBtn) saveBtn.click();
  }

  async function loadAll() {
    await Promise.all([loadTables(), loadObjects(), loadPackages()]);
  }

  const loadAllSectionSeats = useCallback(async (sections: SeatSection[]) => {
    if (sections.length === 0) { setSectionSeats({}); return; }
    setSeatsLoading(true);
    setSeatsLoadComplete(false);
    setSeatLoadProgress({ loaded: 0, sectionsDone: 0, totalSections: sections.length });
    try {
      const map = await loadAllSeatsBatched(sections, (loaded, sectionsDone, totalSections) => {
        setSeatLoadProgress({ loaded, sectionsDone, totalSections });
      });
      setSectionSeats(map);
      const total = Object.values(map).reduce((s, arr) => s + arr.length, 0);
      setSeatLoadProgress({ loaded: total, sectionsDone: sections.length, totalSections: sections.length });
      setSeatsLoadComplete(true);
      setTimeout(() => setSeatsLoadComplete(false), 3000);
    } catch (err) {
      console.error('Seats load error:', err);
      showToast('Fout bij laden stoelen', 'error');
    }
    setSeatsLoading(false);
  }, [showToast]);

  const loadSections = useCallback(async (layoutId: string) => {
    try {
      const data = await getSectionsByLayout(layoutId);
      setSeatSections(data);
      await loadAllSectionSeats(data);
    } catch (err) {
      console.error('Section load error:', err);
      showToast('Fout bij laden secties', 'error');
    }
  }, [showToast, loadAllSectionSeats]);

  function handleLayoutChange(layout: VenueLayout | null) {
    setCurrentLayout(layout);
    setSelectedItem(null);
    setSelectedSeatIds(new Set());
    if (layout) {
      setLayoutName(layout.name);
      loadSections(layout.id);
      loadBackgroundSettings(layout);
    } else {
      setSeatSections([]);
      setSectionSeats({});
      setBgSettings(emptyBg);
      setBgImageLoaded(false);
    }
  }

  function loadBackgroundSettings(layout: any) {
    const settings: BackgroundSettings = {
      background_image_url: layout.background_image_url || null,
      background_opacity: layout.background_opacity ?? 0.3,
      background_position_x: layout.background_position_x ?? 0,
      background_position_y: layout.background_position_y ?? 0,
      background_width: layout.background_width ?? null,
      background_height: layout.background_height ?? null,
      background_rotation: layout.background_rotation ?? 0,
      background_locked: layout.background_locked ?? true,
    };
    setBgSettings(settings);
    setBgVisible(true);
    setBgImageLoaded(false);
    if (layout.layout_data?.scale_meters_per_pixel) {
      setScaleMetersPerPixel(layout.layout_data.scale_meters_per_pixel as number);
    }

    if (settings.background_image_url) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        bgImageRef.current = img;
        setBgImageLoaded(true);
        if (!settings.background_width || !settings.background_height) {
          const aspect = img.naturalWidth / img.naturalHeight;
          const fitW = CANVAS_W * 0.95;
          const fitH = fitW / aspect;
          const newSettings = {
            ...settings,
            background_width: fitW,
            background_height: fitH,
            background_position_x: (CANVAS_W - fitW) / 2,
            background_position_y: (CANVAS_H - fitH) / 2,
          };
          setBgSettings(newSettings);
        }
      };
      img.src = settings.background_image_url;
    }
  }

  function handleLayoutReset() {
    setSeatSections([]);
    setSectionSeats({});
    setSelectedItem(null);
    setSelectedSeatIds(new Set());
  }

  const handleFitToScreen = useCallback(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const cw = container.clientWidth - 20;
    const ch = container.clientHeight - 20;
    const fitZoom = Math.min(cw / CANVAS_W, ch / CANVAS_H);
    setZoom(Math.max(0.05, Math.min(fitZoom, 1)));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = editorWrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const onScroll = () => setScrollPos({ left: el.scrollLeft, top: el.scrollTop });
    const ro = new ResizeObserver(() => setContainerSize({ w: el.clientWidth, h: el.clientHeight }));
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, []);

  const visibleCanvasSeats = useViewportCulling(
    canvasData?.seats ?? [],
    containerSize.w,
    containerSize.h,
    zoom,
    scrollPos.left,
    scrollPos.top,
  );

  const handleCanvasDataChange = useCallback((data: {
    seats: CanvasSeat[];
    selectedIds: Set<string>;
    hoveredId: string | null;
    marqueePreviewIds: Set<string>;
    seatSize: number;
  }) => {
    setCanvasData(data);
  }, []);

  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = -e.deltaY;
    setZoom(z => {
      const factor = delta > 0 ? 1.08 : 1 / 1.08;
      return Math.max(0.05, Math.min(4, z * factor));
    });
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => { zoomTimerRef.current = null; }, 150);
  }, []);

  function fitBgToCanvas() {
    if (!bgImageRef.current) return;
    const img = bgImageRef.current;
    const aspect = img.naturalWidth / img.naturalHeight;
    const fitW = CANVAS_W * 0.95;
    const fitH = fitW / aspect;
    const newSettings: BackgroundSettings = {
      ...bgSettings,
      background_width: fitW,
      background_height: fitH,
      background_position_x: (CANVAS_W - fitW) / 2,
      background_position_y: (CANVAS_H - fitH) / 2,
    };
    setBgSettings(newSettings);
    saveBackgroundSettingsQuiet(newSettings);
  }

  function resetBgToOriginal() {
    if (!bgImageRef.current) return;
    const img = bgImageRef.current;
    const newSettings: BackgroundSettings = {
      ...bgSettings,
      background_width: img.naturalWidth,
      background_height: img.naturalHeight,
      background_position_x: (CANVAS_W - img.naturalWidth) / 2,
      background_position_y: (CANVAS_H - img.naturalHeight) / 2,
    };
    setBgSettings(newSettings);
    saveBackgroundSettingsQuiet(newSettings);
  }

  function centerBg() {
    if (!bgSettings.background_width || !bgSettings.background_height) return;
    const newSettings: BackgroundSettings = {
      ...bgSettings,
      background_position_x: (CANVAS_W - bgSettings.background_width) / 2,
      background_position_y: (CANVAS_H - bgSettings.background_height) / 2,
    };
    setBgSettings(newSettings);
    saveBackgroundSettingsQuiet(newSettings);
  }

  async function saveBackgroundSettingsQuiet(settings: BackgroundSettings) {
    if (!currentLayout?.id) return;
    try {
      const { saveBackgroundSettings: saveBg } = await import('../lib/backgroundUpload');
      await saveBg(currentLayout.id, settings);
    } catch {}
  }

  function handleBgSettingsChange(newSettings: BackgroundSettings) {
    setBgSettings(newSettings);
    if (newSettings.background_image_url) {
      if (newSettings.background_image_url !== bgSettings.background_image_url) {
        setBgImageLoaded(false);
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          bgImageRef.current = img;
          setBgImageLoaded(true);
          if (!newSettings.background_width || !newSettings.background_height) {
            const aspect = img.naturalWidth / img.naturalHeight;
            const fitW = CANVAS_W * 0.95;
            const fitH = fitW / aspect;
            setBgSettings(prev => ({
              ...prev,
              background_width: fitW,
              background_height: fitH,
              background_position_x: (CANVAS_W - fitW) / 2,
              background_position_y: (CANVAS_H - fitH) / 2,
            }));
          }
        };
        img.src = newSettings.background_image_url;
      }
    } else {
      bgImageRef.current = null;
      setBgImageLoaded(false);
    }
  }

  const handleEventChange = useCallback((eventId: string | null, eventName: string | null) => {
    setSelectedEventId(eventId);
    setSelectedEventName(eventName);
    setEventTicketTypes([]);
    setSectionTicketLinks({});
    if (eventId) {
      loadTicketData(eventId);
    }
  }, []);

  async function loadTicketData(eventId: string) {
    try {
      const types = await getTicketTypesForEvent(eventId);
      setEventTicketTypes(types);
    } catch {
      setEventTicketTypes([]);
    }
    try {
      const links = await getAllTicketTypeSectionsForEvent(eventId);
      const linkMap: Record<string, string[]> = {};
      for (const link of links) {
        if (!linkMap[link.section_id]) linkMap[link.section_id] = [];
        linkMap[link.section_id].push(link.ticket_type_id);
      }
      setSectionTicketLinks(linkMap);
    } catch {
      setSectionTicketLinks({});
    }
  }

  function getLayoutData(): Record<string, unknown> {
    return {
      sections: seatSections.map((s) => ({
        id: s.id,
        name: s.name,
        position_x: s.position_x,
        position_y: s.position_y,
        width: s.width,
        height: s.height,
      })),
      ...(scaleMetersPerPixel ? { scale_meters_per_pixel: scaleMetersPerPixel } : {}),
    };
  }

  function openSectionModal(type: 'tribune' | 'plein') {
    setEditingSection(null);
    setSectionModalType(type);
    setShowSectionModal(true);
  }

  function openEditSection(section: SeatSection) {
    setEditingSection(section);
    setSectionModalType(section.section_type);
    setShowSectionModal(true);
    setContextMenu(null);
  }

  async function handleSectionSubmit(formData: SectionFormData) {
    if (!currentLayout) {
      showToast('Selecteer of maak eerst een layout', 'error');
      return;
    }
    setSectionSaving(true);
    try {
      if (editingSection) {
        await updateSection(editingSection.id, {
          name: formData.name,
          section_type: formData.section_type,
          color: formData.color,
          price_category: formData.price_category || null,
          price_amount: formData.price_amount,
          rows_count: formData.rows,
          seats_per_row: formData.seats_per_row,
          start_row_label: formData.start_row_label,
          numbering_direction: formData.numbering_direction,
          row_label_direction: formData.row_label_direction,
          row_spacing: formData.row_spacing,
          seat_spacing: formData.seat_spacing,
          row_curve: formData.row_curve,
          orientation: formData.orientation,
          rotation: formData.rotation,
        });
        await generateSeats({
          section_id: editingSection.id,
          rows: formData.rows,
          seats_per_row: formData.seats_per_row,
          start_row_label: formData.start_row_label,
          numbering_direction: formData.numbering_direction,
          row_label_direction: formData.row_label_direction,
          row_spacing: formData.row_spacing,
          seat_spacing: formData.seat_spacing,
          curve: formData.row_curve,
          orientation: formData.orientation,
        });
        showToast('Sectie bijgewerkt!', 'success');
      } else {
        const isVert = formData.orientation === 'left' || formData.orientation === 'right';
        const HEADER_PAD = 24;
        const BODY_PAD = 10;
        const seatSpread = Math.max(0, formData.seats_per_row - 1) * formData.seat_spacing;
        const rowSpread = Math.max(0, formData.rows - 1) * formData.row_spacing;
        const sectionWidth = isVert
          ? Math.max(100, rowSpread + BODY_PAD * 2 + 20)
          : Math.max(100, seatSpread + BODY_PAD * 2 + 20);
        const sectionHeight = isVert
          ? Math.max(80, seatSpread + HEADER_PAD + BODY_PAD * 2 + 20)
          : Math.max(80, rowSpread + HEADER_PAD + BODY_PAD * 2 + 20);
        const newSection = await createSection({
          layout_id: currentLayout.id,
          name: formData.name,
          section_type: formData.section_type,
          capacity: formData.rows * formData.seats_per_row,
          color: formData.color,
          price_category: formData.price_category || null,
          price_amount: formData.price_amount,
          position_x: CANVAS_W / 2 - sectionWidth / 2,
          position_y: CANVAS_H / 2 - sectionHeight / 2,
          width: sectionWidth,
          height: sectionHeight,
          rotation: formData.rotation,
          orientation: formData.orientation,
          rows_count: formData.rows,
          seats_per_row: formData.seats_per_row,
          row_curve: formData.row_curve,
          sort_order: seatSections.length,
          is_active: true,
          start_row_label: formData.start_row_label,
          numbering_direction: formData.numbering_direction,
          row_label_direction: formData.row_label_direction,
          row_spacing: formData.row_spacing,
          seat_spacing: formData.seat_spacing,
        });
        await generateSeats({
          section_id: newSection.id,
          rows: formData.rows,
          seats_per_row: formData.seats_per_row,
          start_row_label: formData.start_row_label,
          numbering_direction: formData.numbering_direction,
          row_label_direction: formData.row_label_direction,
          row_spacing: formData.row_spacing,
          seat_spacing: formData.seat_spacing,
          curve: formData.row_curve,
          orientation: formData.orientation,
        });
        showToast('Sectie aangemaakt!', 'success');
      }
      if (selectedEventId && editingSection && pendingTicketLinks.current) {
        const sectionId = editingSection.id;
        const oldLinks = sectionTicketLinks[sectionId] || [];
        const newLinks = pendingTicketLinks.current;
        const oldSet = new Set(oldLinks);
        const newSet = new Set(newLinks);
        for (const ttId of eventTicketTypes.map(t => t.id)) {
          const wasLinked = oldSet.has(ttId);
          const isLinked = newSet.has(ttId);
          if (wasLinked === isLinked) continue;
          const existingSections = Object.entries(sectionTicketLinks)
            .filter(([, ids]) => ids.includes(ttId))
            .map(([secId]) => secId);
          if (isLinked) {
            await linkTicketTypeToSections(ttId, [...existingSections, sectionId]);
          } else {
            await linkTicketTypeToSections(ttId, existingSections.filter(s => s !== sectionId));
          }
        }
        setSectionTicketLinks(prev => ({ ...prev, [sectionId]: newLinks }));
        pendingTicketLinks.current = null;
      }
      const sections = await getSectionsByLayout(currentLayout.id);
      setSeatSections(sections);
      await loadAllSectionSeats(sections);
      setShowSectionModal(false);
      setEditingSection(null);
    } catch (err: any) {
      showToast(err.message || 'Fout bij opslaan sectie', 'error');
    }
    setSectionSaving(false);
  }

  async function autoFitSectionToSeats(section: SeatSection, seats?: Seat[]) {
    const seatList = seats || sectionSeats[section.id] || [];
    if (seatList.length === 0) return;
    const HEADER_PAD = 24;
    const BODY_PAD = 10;
    const EXTRA = 20;
    const xs = seatList.map(s => s.x_position);
    const ys = seatList.map(s => s.y_position);
    const rangeX = Math.max(...xs) - Math.min(...xs);
    const rangeY = Math.max(...ys) - Math.min(...ys);
    const newW = Math.max(100, rangeX + BODY_PAD * 2 + EXTRA);
    const newH = Math.max(80, rangeY + HEADER_PAD + BODY_PAD * 2 + EXTRA);
    const updated = { ...section, width: newW, height: newH };
    setSeatSections(prev => prev.map(s => s.id === section.id ? updated : s));
    if (selectedItem?.type === 'section' && selectedItem.data.id === section.id) {
      setSelectedItem({ type: 'section', data: updated });
    }
    try {
      await updateSection(section.id, { width: newW, height: newH });
      showToast('Sectie formaat aangepast', 'success');
    } catch {
      showToast('Fout bij auto-fit', 'error');
    }
  }

  async function handleSectionColorChange(color: string) {
    if (!selectedItem || selectedItem.type !== 'section') return;
    const section = selectedItem.data as SeatSection;
    const updated = { ...section, color };
    setSeatSections(prev => prev.map(s => s.id === section.id ? updated : s));
    setSelectedItem({ type: 'section', data: updated });
    try {
      await updateSection(section.id, { color });
    } catch {
      showToast('Kleur wijzigen mislukt', 'error');
    }
  }

  async function handleSectionDimensionsChange(changes: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) {
    if (!selectedItem || selectedItem.type !== 'section') return;
    const section = selectedItem.data as SeatSection;

    const dbUpdate: Record<string, number> = {};
    const updated = { ...section };

    if (changes.x !== undefined) { updated.position_x = changes.x; dbUpdate.position_x = changes.x; }
    if (changes.y !== undefined) { updated.position_y = changes.y; dbUpdate.position_y = changes.y; }
    if (changes.width !== undefined) { updated.width = changes.width; dbUpdate.width = changes.width; }
    if (changes.height !== undefined) { updated.height = changes.height; dbUpdate.height = changes.height; }
    if (changes.rotation !== undefined) { updated.rotation = changes.rotation; dbUpdate.rotation = changes.rotation; }

    setSeatSections(prev => prev.map(s => s.id === section.id ? updated : s));
    setSelectedItem({ type: 'section', data: updated });

    try {
      await updateSection(section.id, dbUpdate);

      const widthChanged = changes.width !== undefined && changes.width !== section.width;
      const heightChanged = changes.height !== undefined && changes.height !== section.height;
      if (widthChanged || heightChanged) {
        const scaleX = (changes.width ?? section.width) / section.width;
        const scaleY = (changes.height ?? section.height) / section.height;
        if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001) {
          const seats = sectionSeats[section.id] || [];
          if (seats.length > 0) {
            const posUpdates = seats.map(s => ({
              id: s.id,
              x_position: s.x_position * scaleX,
              y_position: s.y_position * scaleY,
            }));
            await updateSeatPositions(posUpdates);
            setSectionSeats(prev => ({
              ...prev,
              [section.id]: seats.map(s => ({
                ...s,
                x_position: s.x_position * scaleX,
                y_position: s.y_position * scaleY,
              })),
            }));
          }
        }
      }
    } catch {
      showToast('Fout bij opslaan afmetingen', 'error');
    }
  }

  async function handleDeleteSection(section: SeatSection) {
    setContextMenu(null);
    if (!currentLayout) return;
    if (!confirm(`Weet je zeker dat je sectie "${section.name}" wilt verwijderen?`)) return;
    try {
      await deleteSection(section.id);
      await loadSections(currentLayout.id);
      if (selectedItem?.type === 'section' && selectedItem.data.id === section.id) {
        setSelectedItem(null);
      }
      showToast('Sectie verwijderd', 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij verwijderen', 'error');
    }
  }

  async function handleDuplicateSection(section: SeatSection) {
    if (!currentLayout) return;
    setContextMenu(null);
    setSectionSaving(true);
    try {
      const newSection = await createSection({
        layout_id: currentLayout.id,
        name: section.name + ' (kopie)',
        section_type: section.section_type,
        capacity: section.capacity,
        color: section.color,
        price_category: section.price_category,
        price_amount: section.price_amount,
        position_x: Math.min(section.position_x + 30, CANVAS_W - section.width),
        position_y: Math.min(section.position_y + 30, CANVAS_H - section.height),
        width: section.width,
        height: section.height,
        rotation: section.rotation,
        orientation: section.orientation || 'top',
        rows_count: section.rows_count,
        seats_per_row: section.seats_per_row,
        row_curve: section.row_curve,
        sort_order: seatSections.length,
        is_active: true,
        start_row_label: section.start_row_label || 'A',
        numbering_direction: section.numbering_direction || 'left-to-right',
        row_label_direction: section.row_label_direction || 'top-to-bottom',
        row_spacing: section.row_spacing || 35,
        seat_spacing: section.seat_spacing || 25,
      });
      await generateSeats({
        section_id: newSection.id,
        rows: section.rows_count,
        seats_per_row: section.seats_per_row,
        start_row_label: section.start_row_label || 'A',
        numbering_direction: section.numbering_direction || 'left-to-right',
        row_label_direction: section.row_label_direction || 'top-to-bottom',
        row_spacing: section.row_spacing || 35,
        seat_spacing: section.seat_spacing || 25,
        curve: section.row_curve,
        orientation: section.orientation || 'top',
      });
      await loadSections(currentLayout.id);
      showToast('Sectie gedupliceerd!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij dupliceren', 'error');
    }
    setSectionSaving(false);
  }

  async function handleRegenerateSeats(section: SeatSection) {
    if (!currentLayout) return;
    setSectionSaving(true);
    try {
      await generateSeats({
        section_id: section.id,
        rows: section.rows_count,
        seats_per_row: section.seats_per_row,
        start_row_label: section.start_row_label || 'A',
        numbering_direction: section.numbering_direction || 'left-to-right',
        row_label_direction: section.row_label_direction || 'top-to-bottom',
        row_spacing: section.row_spacing || 35,
        seat_spacing: section.seat_spacing || 25,
        curve: section.row_curve,
        orientation: section.orientation || 'top',
      });
      const seats = await getSeatsBySection(section.id);
      setSectionSeats(prev => ({ ...prev, [section.id]: seats }));
      showToast('Stoelen hergegenereerd!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij hergenereren', 'error');
    }
    setSectionSaving(false);
  }

  const selectedSeats = useMemo(() => {
    if (selectedSeatIds.size === 0) return [];
    const result: Seat[] = [];
    for (const seats of Object.values(sectionSeats)) {
      for (const s of seats) {
        if (selectedSeatIds.has(s.id)) result.push(s);
      }
    }
    return result;
  }, [selectedSeatIds, sectionSeats]);

  const handleSeatSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedSeatIds(ids);
    if (ids.size > 0) setSelectedItem(null);
  }, []);

  const handleUpdateSeats = useCallback(async (
    seatIds: string[],
    updates: Partial<Pick<Seat, 'status' | 'seat_type' | 'price_override' | 'row_label' | 'seat_number'>>
  ) => {
    try {
      await updateSeatDb(seatIds, updates);
      setSectionSeats(prev => {
        const next = { ...prev };
        for (const [secId, seats] of Object.entries(next)) {
          next[secId] = seats.map(s =>
            seatIds.includes(s.id) ? { ...s, ...updates } as Seat : s
          );
        }
        return next;
      });
      if (updates.row_label !== undefined || updates.seat_number !== undefined) {
        const row = updates.row_label ?? '';
        const num = updates.seat_number ?? '';
        showToast(`Stoel bijgewerkt naar ${row}${num}`, 'success');
      } else {
        showToast('Stoelen bijgewerkt', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Fout bij bijwerken stoelen', 'error');
    }
  }, [showToast]);

  const handleSeatContextMenu = useCallback((e: React.MouseEvent, seat: Seat, section: SeatSection) => {
    if (currentTool === 'draw_seat') {
      setDrawContextMenu({ seat, section, position: { x: e.clientX, y: e.clientY } });
      return;
    }
    setSeatContextMenu({ seat, section, position: { x: e.clientX, y: e.clientY } });
  }, [currentTool]);

  const handleSelectRow = useCallback((sectionId: string, rowLabel: string) => {
    const seats = sectionSeats[sectionId] || [];
    const rowSeats = seats.filter(s => s.row_label === rowLabel);
    const newSet = new Set(selectedSeatIds);
    for (const s of rowSeats) newSet.add(s.id);
    setSelectedSeatIds(newSet);
    setSelectedItem(null);
  }, [sectionSeats, selectedSeatIds]);

  const handleSelectSection = useCallback((sectionId: string) => {
    const seats = sectionSeats[sectionId] || [];
    const newSet = new Set(selectedSeatIds);
    for (const s of seats) newSet.add(s.id);
    setSelectedSeatIds(newSet);
    setSelectedItem(null);
  }, [sectionSeats, selectedSeatIds]);

  async function loadTables() {
    const { data, error } = await supabase
      .from('floorplan_tables')
      .select('*')
      .order('table_number', { ascending: true });
    if (error) { console.error('loadTables error:', error); return; }
    setTables((data as FloorplanTable[]) || []);
  }

  async function loadObjects() {
    const { data, error } = await supabase
      .from('floorplan_objects')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { console.error('loadObjects error:', error); return; }
    const normalized = (data || []).map((o: any) => ({
      ...o,
      type: o.type || (o.object_type ? o.object_type.toUpperCase() : 'BAR'),
      name: o.name || o.label || o.object_type || 'Object',
    }));
    setObjects(normalized as FloorplanObject[]);
  }

  async function loadPackages() {
    const { data } = await supabase
      .from('table_packages')
      .select('id, name, base_price')
      .eq('is_active', true)
      .order('name', { ascending: true });
    setPackages((data as TablePackage[]) || []);
  }

  async function saveTable(table: Partial<FloorplanTable>) {
    if (!table.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('floorplan_tables')
      .update({
        table_number: table.table_number,
        x: table.x,
        y: table.y,
        width: table.width,
        height: table.height,
        rotation: table.rotation,
        capacity: table.capacity,
        price: table.price,
        manual_status: table.manual_status,
        table_type: table.table_type,
        package_id: table.package_id,
        max_guests: table.max_guests,
        included_text: table.included_text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', table.id);
    if (error) { console.error('saveTable error:', error); showToast('Fout bij opslaan tafel: ' + error.message, 'error'); }
    setSaving(false);
    await loadTables();
  }

  async function saveObject(obj: Partial<FloorplanObject>) {
    if (!obj.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('floorplan_objects')
      .update({
        name: obj.name,
        label: obj.label ?? obj.name,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        rotation: obj.rotation,
        color: obj.color,
        is_active: obj.is_active,
        is_visible: obj.is_visible,
        font_size: obj.font_size,
        font_color: obj.font_color,
        font_weight: obj.font_weight,
        name_nl: obj.name_nl,
        name_tr: obj.name_tr,
        name_fr: obj.name_fr,
        name_de: obj.name_de,
        included_text: obj.included_text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', obj.id);
    if (error) { console.error('saveObject error:', error); showToast('Fout bij opslaan object: ' + error.message, 'error'); }
    setSaving(false);
    await loadObjects();
  }

  async function addTable(tableType: 'SEATED' | 'STANDING') {
    setSaving(true);
    const nextNum = tables.length > 0
      ? Math.max(...tables.map(t => parseInt(t.table_number.replace(/\D/g, '')) || 0)) + 1
      : 1;
    const { data: newTable, error } = await supabase
      .from('floorplan_tables')
      .insert({
        table_number: `Tafel ${nextNum}`,
        table_type: tableType,
        capacity: 4,
        price: 50,
        x: 460,
        y: 320,
        width: 80,
        height: 60,
        rotation: 0,
        is_active: true,
        manual_status: 'AVAILABLE',
      })
      .select()
      .single();
    if (error) {
      console.error('addTable error:', error);
      showToast('Fout bij toevoegen tafel: ' + error.message, 'error');
    } else if (newTable) {
      await loadTables();
      setSelectedItem({ type: 'table', data: newTable as FloorplanTable });
    }
    setCurrentTool('select');
    setSaving(false);
  }

  async function addObject(objectType: ObjectType) {
    setSaving(true);
    const colorMap: Record<string, string> = {
      BAR: '#f59e0b',
      STAGE: '#1e40af',
      DANCEFLOOR: '#1e3a8a',
      DECOR_TABLE: '#6b7280',
      DJ_BOOTH: '#ec4899',
      ENTRANCE: '#10b981',
      EXIT: '#ef4444',
      RESTROOM: '#3b82f6',
      TRIBUNE: '#92400e',
    };
    const sizeMap: Record<string, { width: number; height: number }> = {
      BAR: { width: 200, height: 80 },
      STAGE: { width: 200, height: 90 },
      DANCEFLOOR: { width: 300, height: 200 },
      DECOR_TABLE: { width: 60, height: 50 },
      DJ_BOOTH: { width: 120, height: 80 },
      ENTRANCE: { width: 80, height: 60 },
      EXIT: { width: 80, height: 60 },
      RESTROOM: { width: 80, height: 60 },
      TRIBUNE: { width: 250, height: 80 },
    };
    const sz = sizeMap[objectType] ?? { width: 120, height: 80 };
    const nameMap: Record<string, string> = { STAGE: 'PODIUM', TRIBUNE: 'Tribune' };
    const defaultName = nameMap[objectType] || objectType.replace(/_/g, ' ');
    const { data: newObj, error } = await supabase
      .from('floorplan_objects')
      .insert({
        object_type: objectType.toLowerCase(),
        type: objectType,
        name: defaultName,
        label: defaultName,
        x: CANVAS_W / 2 - sz.width / 2,
        y: CANVAS_H / 2 - sz.height / 2,
        width: sz.width,
        height: sz.height,
        rotation: 0,
        color: colorMap[objectType] ?? '#6b7280',
        font_color: '#ffffff',
        font_size: 18,
        font_weight: 'bold',
        is_active: true,
        is_visible: true,
      })
      .select()
      .single();
    if (error) {
      console.error('addObject error:', error);
      showToast('Fout bij toevoegen object: ' + error.message, 'error');
    } else if (newObj) {
      await loadObjects();
      const normalized = {
        ...newObj,
        type: (newObj as any).type || objectType,
        name: (newObj as any).name || defaultName,
      };
      setSelectedItem({ type: 'object', data: normalized as FloorplanObject });
    }
    setCurrentTool('select');
    setSaving(false);
  }

  async function deleteItem() {
    if (!selectedItem) return;
    if (!confirm('Weet je zeker dat je dit item wilt verwijderen?')) return;
    if (selectedItem.type === 'table') {
      const { error } = await supabase.from('floorplan_tables').delete().eq('id', selectedItem.data.id);
      if (error) { showToast('Fout bij verwijderen', 'error'); return; }
      await loadTables();
    } else {
      const { error } = await supabase.from('floorplan_objects').delete().eq('id', selectedItem.data.id);
      if (error) { showToast('Fout bij verwijderen', 'error'); return; }
      await loadObjects();
    }
    setSelectedItem(null);
  }

  async function duplicateItem() {
    if (!selectedItem) return;
    setSaving(true);
    if (selectedItem.type === 'table') {
      const t = selectedItem.data as FloorplanTable;
      const nextNum = tables.length > 0
        ? Math.max(...tables.map(tb => parseInt(tb.table_number.replace(/\D/g, '')) || 0)) + 1
        : 1;
      const { data: nt, error } = await supabase
        .from('floorplan_tables')
        .insert({
          table_number: `Tafel ${nextNum}`,
          table_type: t.table_type,
          capacity: t.capacity,
          price: t.price,
          x: t.x + 20,
          y: t.y + 20,
          width: t.width,
          height: t.height,
          rotation: t.rotation,
          package_id: t.package_id,
          max_guests: t.max_guests,
          included_text: t.included_text,
          is_active: true,
          manual_status: 'AVAILABLE',
        })
        .select()
        .single();
      if (!error && nt) { await loadTables(); setSelectedItem({ type: 'table', data: nt as FloorplanTable }); }
    } else {
      const o = selectedItem.data as FloorplanObject;
      const { data: no, error } = await supabase
        .from('floorplan_objects')
        .insert({
          object_type: o.object_type || o.type?.toLowerCase() || 'bar',
          type: o.type,
          name: o.name + ' Kopie',
          label: (o.label || o.name) + ' Kopie',
          x: o.x + 20,
          y: o.y + 20,
          width: o.width,
          height: o.height,
          rotation: o.rotation,
          color: o.color,
          font_color: o.font_color,
          font_size: o.font_size,
          font_weight: o.font_weight,
          is_active: true,
          is_visible: o.is_visible ?? true,
        })
        .select()
        .single();
      if (!error && no) {
        await loadObjects();
        setSelectedItem({ type: 'object', data: { ...no, type: (no as any).type || o.type, name: (no as any).name } as FloorplanObject });
      }
    }
    setSaving(false);
  }

  function getSvgPoint(e: React.MouseEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: svgP.x, y: svgP.y };
  }

  const handleItemMouseDown = (e: React.MouseEvent, item: SelectedItemType) => {
    if (currentTool !== 'select') return;
    e.stopPropagation();
    const p = getSvgPoint(e);
    setSelectedItem(item);
    setSelectedSeatIds(new Set());
    if (item.type === 'section') {
      const sec = item.data as SeatSection;
      setDragOffset({ x: p.x - sec.position_x, y: p.y - sec.position_y });
    } else {
      const d = item.data as FloorplanTable | FloorplanObject;
      setDragOffset({ x: p.x - d.x, y: p.y - d.y });
    }
    dragIntent.current = {
      type: 'drag',
      startX: p.x,
      startY: p.y,
      item,
      thresholdMet: false,
    };
    const isSection = item.type === 'section';
    const d = item.data;
    dragGhostPos.current = {
      x: isSection ? (d as SeatSection).position_x : (d as any).x,
      y: isSection ? (d as SeatSection).position_y : (d as any).y,
      w: d.width,
      h: d.height,
    };
  };

  const handleResizeStart = (e: React.MouseEvent, handle: 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w') => {
    e.stopPropagation();
    if (!selectedItem) return;
    const p = getSvgPoint(e);
    setResizeHandle(handle);
    if (selectedItem.type === 'section') {
      const sec = selectedItem.data as SeatSection;
      setResizeStart({ x: p.x, y: p.y, width: sec.width, height: sec.height, ox: sec.position_x, oy: sec.position_y });
      resizeOrigSection.current = { width: sec.width, height: sec.height };
    } else {
      setResizeStart({
        x: p.x, y: p.y,
        width: selectedItem.data.width,
        height: selectedItem.data.height,
        ox: (selectedItem.data as FloorplanTable | FloorplanObject).x,
        oy: (selectedItem.data as FloorplanTable | FloorplanObject).y,
      });
    }
    dragIntent.current = {
      type: 'resize',
      startX: p.x,
      startY: p.y,
      item: selectedItem,
      handle,
      thresholdMet: false,
    };
  };

  function snapToGrid(val: number): number {
    return showGrid ? Math.round(val / SNAP_GRID) * SNAP_GRID : val;
  }

  function computeSnapLines(
    movingId: string,
    nx: number, ny: number, nw: number, nh: number
  ): { x?: number; y?: number }[] {
    const lines: { x?: number; y?: number }[] = [];
    const others = [
      ...seatSections.filter(s => s.id !== movingId).map(s => ({
        x: s.position_x, y: s.position_y, w: s.width, h: s.height,
      })),
      ...objects.filter(o => selectedItem?.data?.id !== o.id).map(o => ({
        x: o.x, y: o.y, w: o.width, h: o.height,
      })),
    ];
    for (const o of others) {
      const edges = [
        { a: nx, b: o.x },
        { a: nx + nw, b: o.x + o.w },
        { a: nx, b: o.x + o.w },
        { a: nx + nw, b: o.x },
        { a: nx + nw / 2, b: o.x + o.w / 2 },
      ];
      for (const { a, b } of edges) {
        if (Math.abs(a - b) < SNAP_PROXIMITY) lines.push({ x: b });
      }
      const yEdges = [
        { a: ny, b: o.y },
        { a: ny + nh, b: o.y + o.h },
        { a: ny, b: o.y + o.h },
        { a: ny + nh, b: o.y },
        { a: ny + nh / 2, b: o.y + o.h / 2 },
      ];
      for (const { a, b } of yEdges) {
        if (Math.abs(a - b) < SNAP_PROXIMITY) lines.push({ y: b });
      }
    }
    return lines;
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const intent = dragIntent.current;
    if (!intent) return;
    const p = getSvgPoint(e);

    if (!intent.thresholdMet) {
      const dist = Math.sqrt((p.x - intent.startX) ** 2 + (p.y - intent.startY) ** 2);
      if (dist < DRAG_THRESHOLD) return;
      intent.thresholdMet = true;
      if (intent.type === 'drag') setIsDragging(true);
      else setIsResizing(true);
    }

    const sel = intent.item;

    if (intent.type === 'resize') {
      const handle = intent.handle || resizeHandle;
      if (!handle) return;
      const dx = p.x - resizeStart.x;
      const dy = p.y - resizeStart.y;

      if (sel.type === 'section') {
        const sec = sel.data as SeatSection;
        let nw = resizeStart.width, nh = resizeStart.height;
        let nx = resizeStart.ox, ny = resizeStart.oy;
        const moveE = handle.includes('e');
        const moveW = handle === 'w' || handle === 'nw' || handle === 'sw';
        const moveS = handle.includes('s');
        const moveN = handle === 'n' || handle === 'ne' || handle === 'nw';
        if (moveE) nw = Math.max(MIN_SECTION_W, resizeStart.width + dx);
        if (moveW) { nw = Math.max(MIN_SECTION_W, resizeStart.width - dx); nx = resizeStart.ox + (resizeStart.width - nw); }
        if (moveS) nh = Math.max(MIN_SECTION_H, resizeStart.height + dy);
        if (moveN) { nh = Math.max(MIN_SECTION_H, resizeStart.height - dy); ny = resizeStart.oy + (resizeStart.height - nh); }
        if (e.shiftKey) {
          const aspect = resizeStart.width / resizeStart.height;
          if (nw / nh > aspect) nh = nw / aspect;
          else nw = nh * aspect;
        }
        nw = snapToGrid(nw);
        nh = snapToGrid(nh);
        nx = Math.max(0, Math.min(CANVAS_W - nw, snapToGrid(nx)));
        ny = Math.max(0, Math.min(CANVAS_H - nh, snapToGrid(ny)));
        const updated = { ...sec, position_x: nx, position_y: ny, width: nw, height: nh };
        setSeatSections(prev => prev.map(s => s.id === sec.id ? updated : s));
        setSelectedItem({ type: 'section', data: updated });
      } else {
        let nw = resizeStart.width, nh = resizeStart.height;
        let nx = resizeStart.ox, ny = resizeStart.oy;
        const moveE = handle.includes('e');
        const moveW = handle === 'w' || handle === 'nw' || handle === 'sw';
        const moveS = handle.includes('s');
        const moveN = handle === 'n' || handle === 'ne' || handle === 'nw';
        if (moveE) nw = Math.max(40, resizeStart.width + dx);
        if (moveW) { nw = Math.max(40, resizeStart.width - dx); nx = resizeStart.ox + (resizeStart.width - nw); }
        if (moveS) nh = Math.max(30, resizeStart.height + dy);
        if (moveN) { nh = Math.max(30, resizeStart.height - dy); ny = resizeStart.oy + (resizeStart.height - nh); }
        if (e.shiftKey) {
          const aspect = resizeStart.width / resizeStart.height;
          if (nw / nh > aspect) nh = nw / aspect;
          else nw = nh * aspect;
        }
        nw = snapToGrid(nw);
        nh = snapToGrid(nh);
        nx = Math.max(0, Math.min(CANVAS_W - nw, snapToGrid(nx)));
        ny = Math.max(0, Math.min(CANVAS_H - nh, snapToGrid(ny)));
        applyLocalUpdate({ ...sel.data, x: nx, y: ny, width: nw, height: nh } as FloorplanTable | FloorplanObject);
      }
      return;
    }

    if (sel.type === 'section') {
      const sec = sel.data as SeatSection;
      let nx = snapToGrid(Math.max(0, Math.min(CANVAS_W - sec.width, p.x - dragOffset.x)));
      let ny = snapToGrid(Math.max(0, Math.min(CANVAS_H - sec.height, p.y - dragOffset.y)));
      const lines = computeSnapLines(sec.id, nx, ny, sec.width, sec.height);
      setSnapLines(lines);
      for (const line of lines) {
        if (line.x !== undefined) {
          if (Math.abs(nx - line.x) < SNAP_PROXIMITY) nx = line.x;
          else if (Math.abs(nx + sec.width - line.x) < SNAP_PROXIMITY) nx = line.x - sec.width;
        }
        if (line.y !== undefined) {
          if (Math.abs(ny - line.y) < SNAP_PROXIMITY) ny = line.y;
          else if (Math.abs(ny + sec.height - line.y) < SNAP_PROXIMITY) ny = line.y - sec.height;
        }
      }
      const updated = { ...sec, position_x: nx, position_y: ny };
      setSeatSections(prev => prev.map(s => s.id === sec.id ? updated : s));
      setSelectedItem({ type: 'section', data: updated });
    } else {
      const item = sel.data as FloorplanTable | FloorplanObject;
      let nx = snapToGrid(Math.max(0, Math.min(CANVAS_W - item.width, p.x - dragOffset.x)));
      let ny = snapToGrid(Math.max(0, Math.min(CANVAS_H - item.height, p.y - dragOffset.y)));
      const lines = computeSnapLines(item.id, nx, ny, item.width, item.height);
      setSnapLines(lines);
      for (const line of lines) {
        if (line.x !== undefined) {
          if (Math.abs(nx - line.x) < SNAP_PROXIMITY) nx = line.x;
          else if (Math.abs(nx + item.width - line.x) < SNAP_PROXIMITY) nx = line.x - item.width;
        }
        if (line.y !== undefined) {
          if (Math.abs(ny - line.y) < SNAP_PROXIMITY) ny = line.y;
          else if (Math.abs(ny + item.height - line.y) < SNAP_PROXIMITY) ny = line.y - item.height;
        }
      }
      applyLocalUpdate({ ...item, x: nx, y: ny } as FloorplanTable | FloorplanObject);
    }
  };

  function applyLocalUpdate(updated: FloorplanTable | FloorplanObject) {
    if (selectedItem!.type === 'table') {
      setTables(prev => prev.map(t => t.id === updated.id ? updated as FloorplanTable : t));
    } else {
      setObjects(prev => prev.map(o => o.id === updated.id ? updated as FloorplanObject : o));
    }
    setSelectedItem({ ...selectedItem!, data: updated });
  }

  const handleMouseUp = useCallback(async () => {
    const intent = dragIntent.current;
    const wasDragging = isDragging;
    const wasResizing = isResizing;

    dragIntent.current = null;
    dragGhostPos.current = null;
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    setSnapLines([]);

    if (!intent?.thresholdMet) return;

    if ((wasDragging || wasResizing) && selectedItem) {
      if (selectedItem.type === 'section') {
        const sec = selectedItem.data as SeatSection;
        try {
          await updateSection(sec.id, {
            position_x: sec.position_x,
            position_y: sec.position_y,
            width: sec.width,
            height: sec.height,
          });
          if (wasResizing && resizeOrigSection.current) {
            const orig = resizeOrigSection.current;
            const scaleX = sec.width / orig.width;
            const scaleY = sec.height / orig.height;
            if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001) {
              const seats = sectionSeats[sec.id] || [];
              if (seats.length > 0) {
                const posUpdates = seats.map(s => ({
                  id: s.id,
                  x_position: s.x_position * scaleX,
                  y_position: s.y_position * scaleY,
                }));
                await updateSeatPositions(posUpdates);
                setSectionSeats(prev => ({
                  ...prev,
                  [sec.id]: seats.map(s => ({
                    ...s,
                    x_position: s.x_position * scaleX,
                    y_position: s.y_position * scaleY,
                  })),
                }));
              }
            }
            resizeOrigSection.current = null;
          }
        } catch {
          showToast('Fout bij opslaan positie', 'error');
        }
      } else if (selectedItem.type === 'table') {
        saveTable(selectedItem.data as FloorplanTable);
      } else {
        saveObject(selectedItem.data as FloorplanObject);
      }
    }
  }, [isDragging, isResizing, selectedItem, sectionSeats, showToast]);

  useEffect(() => {
    function onPointerUp() {
      if (dragIntent.current) {
        handleMouseUp();
      }
    }
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mouseup', onPointerUp);
    return () => {
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mouseup', onPointerUp);
    };
  }, [handleMouseUp]);

  const handleToolClick = (tool: EditorTool) => {
    if (tool === 'add_seated') addTable('SEATED');
    else if (tool === 'add_standing') addTable('STANDING');
    else if (tool === 'add_decor') addObject('DECOR_TABLE');
    else if (tool === 'add_bar') addObject('BAR');
    else if (tool === 'add_stage') addObject('STAGE');
    else if (tool === 'add_dancefloor') addObject('DANCEFLOOR');
    else if (tool === 'add_tribune') {
      if (!currentLayout) {
        showToast('Sla eerst een layout op voordat je secties toevoegt', 'error');
        return;
      }
      openSectionModal('tribune');
    }
    else setCurrentTool(tool);
  };

  const ResizeHandles = ({ item }: { item: FloorplanTable | FloorplanObject | SeatSection }) => {
    const isSection = 'position_x' in item;
    const ix = isSection ? (item as SeatSection).position_x : (item as FloorplanTable).x;
    const iy = isSection ? (item as SeatSection).position_y : (item as FloorplanTable).y;
    const iw = item.width;
    const ih = item.height;
    const cursorMap: Record<string, string> = {
      nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
      w: 'w-resize', e: 'e-resize',
      sw: 'sw-resize', s: 's-resize', se: 'se-resize',
    };
    const handles: { handle: 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w'; cx: number; cy: number }[] = [
      { handle: 'nw', cx: ix, cy: iy },
      { handle: 'n', cx: ix + iw / 2, cy: iy },
      { handle: 'ne', cx: ix + iw, cy: iy },
      { handle: 'w', cx: ix, cy: iy + ih / 2 },
      { handle: 'e', cx: ix + iw, cy: iy + ih / 2 },
      { handle: 'sw', cx: ix, cy: iy + ih },
      { handle: 's', cx: ix + iw / 2, cy: iy + ih },
      { handle: 'se', cx: ix + iw, cy: iy + ih },
    ];
    return (
      <>
        {handles.map(h => (
          <g key={h.handle}>
            <circle cx={h.cx} cy={h.cy} r="10" fill="transparent"
              style={{ cursor: cursorMap[h.handle] }} onMouseDown={(e) => handleResizeStart(e, h.handle)} />
            <circle cx={h.cx} cy={h.cy} r="5" fill="#3b82f6" stroke="white" strokeWidth="1.5"
              style={{ cursor: cursorMap[h.handle], pointerEvents: 'none' }} />
          </g>
        ))}
      </>
    );
  };

  return (
    <div ref={editorWrapRef} className={`bg-white rounded-xl overflow-hidden border border-slate-200 ${isFullscreen ? 'fixed inset-0 z-[100] rounded-none border-0' : ''}`}>
      <div className="p-3 pb-0">
        <LayoutToolbar
          currentLayout={currentLayout}
          onLayoutChange={handleLayoutChange}
          onReset={handleLayoutReset}
          getLayoutData={getLayoutData}
          layoutName={layoutName}
          onLayoutNameChange={setLayoutName}
          selectedEventId={selectedEventId}
          onEventChange={handleEventChange}
        />
      </div>

      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <h2 className="text-xl font-bold text-white flex-shrink-0">Floorplan Editor</h2>
            {currentLayout?.event_id && (
              <>
                <div className="h-5 w-px bg-slate-600 flex-shrink-0" />
                <AdminEventStatus event={eventInfo} stats={salesStats} />
                <div className="h-5 w-px bg-slate-600 flex-shrink-0" />
                <AdminViewerCount count={viewerCount} />
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              title="Ongedaan maken (Ctrl+Z)"
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              title="Opnieuw (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-slate-600" />
            <span className="text-slate-400 text-sm font-mono tabular-nums min-w-[52px] text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(z + 0.1, 4))} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors" title="Zoom In"><ZoomIn className="w-5 h-5" /></button>
            <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.15))} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors" title="Zoom Out"><ZoomOut className="w-5 h-5" /></button>
            <button onClick={handleFitToScreen} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors" title="Passend in scherm"><Maximize2 className="w-5 h-5" /></button>
            <button onClick={toggleFullscreen} className={`p-2 rounded-lg transition-colors ${isFullscreen ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`} title={isFullscreen ? 'Volledig scherm verlaten (Esc)' : 'Volledig scherm'}><Maximize2 className="w-5 h-5" /></button>
            <div className="h-6 w-px bg-slate-600" />
            <button
              onClick={() => setShowShortcutsModal(true)}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              title="Sneltoetsen"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-slate-600" />
            <button
              onClick={() => {
                if (!currentLayout) { showToast('Sla eerst een layout op', 'error'); return; }
                setShowBgModal(true);
              }}
              className={`p-2 rounded-lg transition-colors ${
                bgSettings.background_image_url
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
              title="Achtergrond plattegrond"
            >
              <Image className="w-5 h-5" />
            </button>
            {bgSettings.background_image_url && (
              <button
                onClick={() => setBgVisible(v => !v)}
                className={`p-2 rounded-lg transition-colors ${
                  bgVisible
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-500'
                }`}
                title={bgVisible ? 'Achtergrond verbergen' : 'Achtergrond tonen'}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setShowBgModal(true);
                }}
              >
                {bgVisible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex">
        <div className="w-20 bg-slate-800 border-r border-slate-700 p-2 space-y-1.5 flex-shrink-0">
          <ToolButton active={currentTool === 'select'} onClick={() => setCurrentTool('select')} icon={<Move className="w-5 h-5" />} label="Select" />
          <div className="border-t border-slate-600 my-1" />
          <ToolButton active={false} onClick={() => handleToolClick('add_seated')} icon={<Square className="w-5 h-5" />} label="Seated" hoverColor="hover:bg-green-600" />
          <ToolButton active={false} onClick={() => handleToolClick('add_standing')} icon={<Circle className="w-5 h-5" />} label="Standing" hoverColor="hover:bg-blue-600" />
          <ToolButton active={false} onClick={() => handleToolClick('add_decor')} icon={<Square className="w-4 h-4 opacity-60" />} label="Decor" hoverColor="hover:bg-slate-500" />
          <div className="border-t border-slate-600 my-1" />
          <ToolButton active={false} onClick={() => handleToolClick('add_bar')} icon={<Square className="w-5 h-5" />} label="Bar" hoverColor="hover:bg-amber-600" />
          <ToolButton active={false} onClick={() => handleToolClick('add_stage')} icon={<Square className="w-5 h-5" />} label="Stage" hoverColor="hover:bg-blue-700" />
          <ToolButton active={false} onClick={() => handleToolClick('add_dancefloor')} icon={<Square className="w-5 h-5 opacity-70" />} label="Dance" hoverColor="hover:bg-blue-800" />
          <ToolButton active={false} onClick={() => handleToolClick('add_tribune')} icon={<Rows3 className="w-5 h-5" />} label="Tribune" hoverColor="hover:bg-amber-800" />
          <ToolButton active={false} onClick={() => {
            if (!currentLayout) { showToast('Sla eerst een layout op', 'error'); return; }
            openSectionModal('plein');
          }} icon={<Armchair className="w-5 h-5" />} label="Plein" hoverColor="hover:bg-teal-700" />
          <ToolButton active={currentTool === 'draw_seat'} onClick={() => {
            if (!currentLayout) { showToast('Sla eerst een layout op', 'error'); return; }
            if (currentTool === 'draw_seat') { setCurrentTool('select'); seatDraw.resetDrawState(); }
            else { setCurrentTool('draw_seat'); setSelectedItem(null); setSelectedSeatIds(new Set()); }
          }} icon={<PenTool className="w-5 h-5" />} label="Stoel +" hoverColor="hover:bg-emerald-600" />
          <div className="border-t border-slate-600 my-1" />
          <ToolButton active={showGrid} onClick={() => setShowGrid(!showGrid)} icon={<Grid3x3 className="w-5 h-5" />} label="Grid" />
          <ToolButton active={marqueeActive} onClick={() => setMarqueeActive(!marqueeActive)} icon={<BoxSelect className="w-5 h-5" />} label="Gebied" hoverColor="hover:bg-blue-600" />
          <ToolButton active={rulerActive} onClick={() => {
            setRulerActive(!rulerActive);
            setRulerPoints([]);
          }} icon={<Ruler className="w-5 h-5" />} label="Meten" hoverColor="hover:bg-teal-600" />
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-0">
          <div className="lg:col-span-3 p-3">
            <div
              ref={canvasContainerRef}
              className="bg-slate-100 rounded-lg overflow-auto relative border border-slate-200"
              style={{ height: isFullscreen ? 'calc(100vh - 140px)' : 'calc(100vh - 200px)', minHeight: '500px', paddingBottom: selectedSeatIds.size > 0 ? 60 : 0 }}
              onMouseMove={(e) => {
                handleMouseMove(e);
                if (currentTool === 'draw_seat') {
                  const svg = svgRef.current;
                  if (!svg) return;
                  const pt = svg.createSVGPoint();
                  pt.x = e.clientX;
                  pt.y = e.clientY;
                  const cp = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                  seatDraw.handleCanvasMouseMove(cp.x, cp.y);
                }
              }}
              onMouseUp={(e) => {
                handleMouseUp();
                if (currentTool === 'draw_seat') {
                  const svg = svgRef.current;
                  if (!svg) return;
                  const pt = svg.createSVGPoint();
                  pt.x = e.clientX;
                  pt.y = e.clientY;
                  const cp = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                  seatDraw.handleCanvasMouseUp(cp.x, cp.y);
                }
              }}
              onWheel={handleWheel}
              onClick={() => {
                if (currentTool === 'draw_seat') return;
                if (!isDragging && !isResizing && !dragIntent.current?.thresholdMet) {
                  setSelectedItem(null); setContextMenu(null); setSeatContextMenu(null);
                  if (!marqueeActive) setSelectedSeatIds(new Set());
                }
              }}
            >
              <svg
                ref={svgRef}
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                style={{
                  width: CANVAS_W * zoom,
                  height: CANVAS_H * zoom,
                  minWidth: '100%',
                  minHeight: '100%',
                  cursor: rulerActive ? 'crosshair' : currentTool === 'select' ? 'default' : 'crosshair',
                }}
                onMouseDown={(e) => {
                  if (currentTool !== 'draw_seat') return;
                  const svg = svgRef.current;
                  if (!svg) return;
                  const pt = svg.createSVGPoint();
                  pt.x = e.clientX;
                  pt.y = e.clientY;
                  const cp = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                  seatDraw.handleCanvasMouseDown(cp.x, cp.y);
                }}
              >
                <rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="#f8fafc"
                  onClick={(e) => {
                    if (!rulerActive) return;
                    const svg = svgRef.current;
                    if (!svg) return;
                    const pt = svg.createSVGPoint();
                    pt.x = e.clientX;
                    pt.y = e.clientY;
                    const canvasPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                    const newPoint = { x: Math.round(canvasPt.x), y: Math.round(canvasPt.y) };
                    if (rulerPoints.length === 0) {
                      setRulerPoints([newPoint]);
                    } else if (rulerPoints.length === 1) {
                      const p1 = rulerPoints[0];
                      const dist = Math.sqrt((newPoint.x - p1.x) ** 2 + (newPoint.y - p1.y) ** 2);
                      setRulerPoints([p1, newPoint]);
                      setRulerPixelLength(Math.round(dist));
                      setShowRulerModal(true);
                      setRulerActive(false);
                    }
                  }}
                />

                {showGrid && (
                  <>
                    <defs>
                      <pattern id="gridMinor" width="50" height="50" patternUnits="userSpaceOnUse">
                        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="0.4" />
                      </pattern>
                      <pattern id="gridMajor" width="200" height="200" patternUnits="userSpaceOnUse">
                        <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#cbd5e1" strokeWidth="0.6" />
                      </pattern>
                    </defs>
                    <rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="url(#gridMinor)" />
                    <rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="url(#gridMajor)" />
                  </>
                )}

                {bgVisible && bgSettings.background_image_url && bgImageLoaded && bgSettings.background_width && bgSettings.background_height && (
                  <g style={bgSettings.background_rotation ? {
                    transform: `rotate(${bgSettings.background_rotation}deg)`,
                    transformOrigin: `${bgSettings.background_position_x + bgSettings.background_width / 2}px ${bgSettings.background_position_y + bgSettings.background_height / 2}px`,
                  } : undefined}>
                    <image
                      href={bgSettings.background_image_url}
                      x={bgSettings.background_position_x}
                      y={bgSettings.background_position_y}
                      width={bgSettings.background_width}
                      height={bgSettings.background_height}
                      opacity={bgSettings.background_opacity}
                      preserveAspectRatio="none"
                      style={{ pointerEvents: bgSettings.background_locked ? 'none' : 'auto' }}
                    />
                  </g>
                )}

                {objects.map((obj) => {
                  const isSelected = selectedItem?.type === 'object' && selectedItem.data.id === obj.id;
                  const isHovered = hoveredItemId === obj.id && !isSelected;
                  const displayName = obj.name || obj.label || obj.type || '';
                  const isDancefloor = obj.type === 'DANCEFLOOR';
                  const isTribune = obj.type === 'TRIBUNE';

                  return (
                    <g key={obj.id}>
                      <g
                        onMouseDown={(e) => handleItemMouseDown(e, { type: 'object', data: obj })}
                        onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'object', data: obj }); setSelectedSeatIds(new Set()); }}
                        onMouseEnter={() => setHoveredItemId(obj.id)}
                        onMouseLeave={() => setHoveredItemId(null)}
                        style={{ cursor: currentTool === 'select' ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                      >
                        <>
                          <rect x={obj.x} y={obj.y} width={obj.width} height={obj.height}
                            fill={obj.color}
                            stroke={isSelected ? '#2563eb' : isHovered ? '#60a5fa' : '#94a3b8'}
                            strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 1} rx="4" />
                          <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2}
                            textAnchor="middle" dominantBaseline="middle"
                            fill={obj.font_color || '#ffffff'} fontSize={obj.font_size || 18}
                            fontWeight={obj.font_weight || '600'} className="pointer-events-none">
                            {displayName.toUpperCase()}
                          </text>
                        </>
                      </g>
                      {isSelected && currentTool === 'select' && <ResizeHandles item={obj} />}
                    </g>
                  );
                })}

                {seatSections.filter(s => s.name !== 'Vrije Plaatsing').map((section) => {
                  const isSel = selectedItem?.type === 'section' && selectedItem.data.id === section.id;
                  const isHovered = hoveredItemId === section.id && !isSel;
                  const seatCount = (sectionSeats[section.id] || []).length;
                  return (
                    <SeatSectionRenderer
                      key={`sec-${section.id}`}
                      section={section}
                      seatCount={seatCount}
                      isSelected={isSel}
                      isHovered={isHovered}
                      currentTool={currentTool}
                      onMouseDown={(e) => handleItemMouseDown(e, { type: 'section', data: section })}
                      onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'section', data: section }); setSelectedSeatIds(new Set()); }}
                      onDoubleClick={(e) => { e.stopPropagation(); openEditSection(section); }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, section });
                      }}
                      onMouseEnter={() => setHoveredItemId(section.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                      renderResizeHandles={() =>
                        isSel && currentTool === 'select' ? <ResizeHandles item={section} /> : null
                      }
                    />
                  );
                })}

                {snapLines.length > 0 && (isDragging || isResizing) && snapLines.map((line, i) => (
                  <line key={i}
                    x1={line.x !== undefined ? line.x : 0}
                    y1={line.y !== undefined ? line.y : 0}
                    x2={line.x !== undefined ? line.x : CANVAS_W}
                    y2={line.y !== undefined ? line.y : CANVAS_H}
                    stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 4" opacity={0.7}
                  />
                ))}

                {isResizing && selectedItem && (() => {
                  const isSection = selectedItem.type === 'section';
                  const d = selectedItem.data;
                  const ix = isSection ? (d as SeatSection).position_x : (d as any).x;
                  const iy = isSection ? (d as SeatSection).position_y : (d as any).y;
                  return (
                    <text x={ix + d.width / 2} y={iy - 8}
                      textAnchor="middle" fill="#f59e0b" fontSize="11" fontWeight="bold"
                      className="pointer-events-none">
                      {Math.round(d.width)} x {Math.round(d.height)}
                    </text>
                  );
                })()}

                <SeatInteractionLayer
                  sections={seatSections}
                  sectionSeats={sectionSeats}
                  selectedSeatIds={selectedSeatIds}
                  onSelectionChange={handleSeatSelectionChange}
                  svgRef={svgRef}
                  zoom={zoom}
                  isSelectTool={currentTool === 'select'}
                  allowContextMenu={currentTool === 'draw_seat'}
                  marqueeActive={marqueeActive}
                  onSeatContextMenu={handleSeatContextMenu}
                  dragState={dragState}
                  onDragStart={startDrag}
                  onDragMove={moveDrag}
                  onDragEnd={endDrag}
                  ticketTypeColors={ticketTypeColors}
                  onCanvasDataChange={handleCanvasDataChange}
                />

                {currentTool === 'draw_seat' && (
                  <g className="pointer-events-none">
                    {seatDraw.linePreview && (() => {
                      const penColor = (seatDraw.settings.ticketTypeId && ticketTypeColors[seatDraw.settings.ticketTypeId]) || '#10b981';
                      return (
                      <>
                        <line
                          x1={seatDraw.linePreview.x1} y1={seatDraw.linePreview.y1}
                          x2={seatDraw.linePreview.x2} y2={seatDraw.linePreview.y2}
                          stroke={penColor} strokeWidth="2" strokeDasharray="6 3" opacity={0.7}
                        />
                        {(() => {
                          const lp = seatDraw.linePreview;
                          const dx = lp.x2 - lp.x1;
                          const dy = lp.y2 - lp.y1;
                          const dist = Math.sqrt(dx * dx + dy * dy);
                          if (dist < 5) return null;
                          const count = Math.max(1, Math.floor(dist / seatDraw.settings.seatSpacing) + 1);
                          const ux = dx / dist;
                          const uy = dy / dist;
                          const dots = [];
                          for (let i = 0; i < count; i++) {
                            dots.push(
                              <circle
                                key={i}
                                cx={lp.x1 + ux * seatDraw.settings.seatSpacing * i}
                                cy={lp.y1 + uy * seatDraw.settings.seatSpacing * i}
                                r="5" fill={penColor} opacity={0.5}
                              />
                            );
                          }
                          return <>{dots}</>;
                        })()}
                      </>
                      );
                    })()}
                    {seatDraw.lastPlacedId && seatDraw.settings.sectionId && (() => {
                      const seats = sectionSeats[seatDraw.settings.sectionId] || [];
                      const seat = seats.find(s => s.id === seatDraw.lastPlacedId);
                      const section = seatSections.find(s => s.id === seatDraw.settings.sectionId);
                      if (!seat || !section) return null;
                      const cx = section.position_x + seat.x_position;
                      const cy = section.position_y + seat.y_position;
                      return (
                        <circle cx={cx} cy={cy} r="10" fill="none" stroke="#facc15" strokeWidth="2" opacity={0.8}>
                          <animate attributeName="r" from="8" to="14" dur="1s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.8" to="0" dur="1s" repeatCount="indefinite" />
                        </circle>
                      );
                    })()}
                  </g>
                )}

                {tables.map((table) => {
                  const isSelected = selectedItem?.type === 'table' && selectedItem.data.id === table.id;
                  const isHovered = hoveredItemId === table.id && !isSelected;
                  const isSeated = table.table_type === 'SEATED';
                  const isSold = table.manual_status === 'SOLD';
                  const fillColor = isSold ? '#ef4444' : isSeated ? '#22c55e' : '#3b82f6';

                  return (
                    <g key={table.id}>
                      <g
                        onMouseDown={(e) => handleItemMouseDown(e, { type: 'table', data: table })}
                        onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'table', data: table }); setSelectedSeatIds(new Set()); }}
                        onMouseEnter={() => setHoveredItemId(table.id)}
                        onMouseLeave={() => setHoveredItemId(null)}
                        style={{ cursor: currentTool === 'select' ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                      >
                        <rect x={table.x} y={table.y} width={table.width} height={table.height}
                          fill={fillColor} stroke={isSelected ? '#2563eb' : isHovered ? '#60a5fa' : '#94a3b8'}
                          strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 1} rx="4" />
                        {isSeated && [
                          [table.x + 12, table.y + 12],
                          [table.x + table.width - 12, table.y + 12],
                          [table.x + 12, table.y + table.height - 12],
                          [table.x + table.width - 12, table.y + table.height - 12],
                        ].map(([cx, cy], i) => (
                          <circle key={i} cx={cx} cy={cy} r="7" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" />
                        ))}
                        <text x={table.x + table.width / 2} y={table.y + table.height / 2 - 7}
                          textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" className="pointer-events-none">
                          {table.table_number}
                        </text>
                        <text x={table.x + table.width / 2} y={table.y + table.height / 2 + 9}
                          textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="11" className="pointer-events-none">
                          {table.capacity}p
                        </text>
                      </g>
                      {isSelected && currentTool === 'select' && <ResizeHandles item={table} />}
                    </g>
                  );
                })}
                {rulerPoints.length >= 1 && (
                  <g>
                    <circle cx={rulerPoints[0].x} cy={rulerPoints[0].y} r={6} fill="#14b8a6" stroke="white" strokeWidth={2} />
                    {rulerPoints.length === 2 && (
                      <>
                        <line
                          x1={rulerPoints[0].x} y1={rulerPoints[0].y}
                          x2={rulerPoints[1].x} y2={rulerPoints[1].y}
                          stroke="#14b8a6" strokeWidth={2.5} strokeDasharray="8 4"
                        />
                        <circle cx={rulerPoints[1].x} cy={rulerPoints[1].y} r={6} fill="#14b8a6" stroke="white" strokeWidth={2} />
                        <text
                          x={(rulerPoints[0].x + rulerPoints[1].x) / 2}
                          y={(rulerPoints[0].y + rulerPoints[1].y) / 2 - 12}
                          textAnchor="middle"
                          fill="white" fontSize="14" fontWeight="bold"
                          className="pointer-events-none"
                        >
                          {rulerPixelLength}px
                          {scaleMetersPerPixel && rulerPixelLength
                            ? ` = ${(rulerPixelLength * scaleMetersPerPixel).toFixed(1)}m`
                            : ''}
                        </text>
                      </>
                    )}
                  </g>
                )}

                {scaleMetersPerPixel && (
                  <g>
                    {(() => {
                      const targetPx = 200;
                      const meters = targetPx * scaleMetersPerPixel;
                      const roundedM = Math.round(meters / 5) * 5 || Math.round(meters);
                      const actualPx = roundedM / scaleMetersPerPixel;
                      const x = 30;
                      const y = CANVAS_H - 40;
                      return (
                        <>
                          <rect x={x - 5} y={y - 18} width={actualPx + 10} height={30} rx={4} fill="rgba(0,0,0,0.7)" />
                          <line x1={x} y1={y} x2={x + actualPx} y2={y} stroke="white" strokeWidth={2} />
                          <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke="white" strokeWidth={2} />
                          <line x1={x + actualPx} y1={y - 5} x2={x + actualPx} y2={y + 5} stroke="white" strokeWidth={2} />
                          <text x={x + actualPx / 2} y={y - 5} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" className="pointer-events-none">
                            {roundedM}m
                          </text>
                        </>
                      );
                    })()}
                  </g>
                )}
              </svg>
              {canvasData && canvasData.seats.length > 0 && (
                <SeatCanvasLayer
                  seats={visibleCanvasSeats}
                  selectedIds={canvasData.selectedIds}
                  hoveredId={canvasData.hoveredId}
                  marqueePreviewIds={canvasData.marqueePreviewIds}
                  zoom={zoom}
                  seatSize={canvasData.seatSize}
                  ticketTypeColors={ticketTypeColors}
                  dragState={dragState ? { active: dragState.active, dx: dragState.dx, dy: dragState.dy, seatIds: dragState.seatIds } : null}
                  canvasWidth={CANVAS_W * zoom}
                  canvasHeight={CANVAS_H * zoom}
                />
              )}
              {(seatsLoading || seatsLoadComplete) && (
                <SeatLoadingProgress
                  loaded={seatLoadProgress.loaded}
                  sectionsDone={seatLoadProgress.sectionsDone}
                  totalSections={seatLoadProgress.totalSections}
                  isComplete={!seatsLoading}
                />
              )}
              <SelectionCounter count={selectedSeatIds.size} onClear={() => setSelectedSeatIds(new Set())} />

              {selectedItem && currentTool === 'select' && !isDragging && !isResizing && (
                <FloatingToolbar
                  item={selectedItem}
                  svgRef={svgRef as React.RefObject<SVGSVGElement>}
                  onEdit={() => {
                    if (selectedItem.type === 'section') openEditSection(selectedItem.data as SeatSection);
                  }}
                  onDuplicate={() => {
                    if (selectedItem.type === 'section') handleDuplicateSection(selectedItem.data as SeatSection);
                    else duplicateItem();
                  }}
                  onDelete={() => {
                    if (selectedItem.type === 'section') handleDeleteSection(selectedItem.data as SeatSection);
                    else deleteItem();
                  }}
                  onRotate={handleRotateItem}
                />
              )}
            </div>
          </div>

          <div className="p-3 space-y-3 bg-slate-800/30 border-l border-slate-700 overflow-y-auto" style={{ maxHeight: '836px' }}>
            {currentTool === 'draw_seat' ? (
              <SeatDrawSettingsPanel
                settings={seatDraw.settings}
                onChange={seatDraw.updateSettings}
                placedCount={seatDraw.placedInRow}
                onDeactivate={() => { setCurrentTool('select'); seatDraw.resetDrawState(); }}
                ticketTypes={eventTicketTypes}
              />
            ) : selectedSeatIds.size > 0 ? (
              <SeatPropertiesPanel
                selectedSeats={selectedSeats}
                sections={seatSections}
                onDeselectAll={() => setSelectedSeatIds(new Set())}
                onUpdateSeats={handleUpdateSeats}
              />
            ) : selectedItem ? (
              selectedItem.type === 'section' ? (
                <SectionPropertiesPanel
                  section={selectedItem.data as SeatSection}
                  seats={sectionSeats[(selectedItem.data as SeatSection).id] || []}
                  onEdit={openEditSection}
                  onRegenerate={handleRegenerateSeats}
                  onDuplicate={handleDuplicateSection}
                  onDelete={handleDeleteSection}
                  onAutoFit={autoFitSectionToSeats}
                  onRotate={handleRotateItem}
                  onColorChange={handleSectionColorChange}
                  onDimensionsChange={handleSectionDimensionsChange}
                  linkedTicketTypes={
                    selectedEventId
                      ? eventTicketTypes.filter(tt => (sectionTicketLinks[(selectedItem.data as SeatSection).id] || []).includes(tt.id))
                      : []
                  }
                />
              ) : (
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">
                    {selectedItem.type === 'table' ? 'Tafel eigenschappen' : 'Object eigenschappen'}
                  </h3>
                  <div className="flex gap-1">
                    <button onClick={duplicateItem} className="p-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors" title="Dupliceren"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={deleteItem} className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded transition-colors" title="Verwijderen"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {selectedItem.type === 'table' ? (
                  <TableProperties
                    table={selectedItem.data as FloorplanTable}
                    packages={packages}
                    onUpdate={(updates) => {
                      const updated = { ...selectedItem.data, ...updates } as FloorplanTable;
                      setSelectedItem({ type: 'table', data: updated });
                      setTables(prev => prev.map(t => t.id === updated.id ? updated : t));
                    }}
                    onSave={() => saveTable(selectedItem.data as FloorplanTable)}
                  />
                ) : (
                  <ObjectProperties
                    object={selectedItem.data as FloorplanObject}
                    onUpdate={(updates) => {
                      const updated = { ...selectedItem.data, ...updates } as FloorplanObject;
                      setSelectedItem({ type: 'object', data: updated });
                      setObjects(prev => prev.map(o => o.id === updated.id ? updated : o));
                    }}
                    onSave={() => saveObject(selectedItem.data as FloorplanObject)}
                  />
                )}
              </div>
              )
            ) : (
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Snelle acties</h3>
                <div className="space-y-1.5 text-xs text-slate-400">
                  <p>Selecteer een item om eigenschappen te bewerken</p>
                  <p>Gebruik de linkerzijbalk om items toe te voegen</p>
                  <p>Sleep om te verplaatsen</p>
                  <p>Rode hoeken om te vergroten/verkleinen</p>
                  <p>Tribune/Plein voor zitplaatsen secties</p>
                  <p>Dubbelklik op sectie om te bewerken</p>
                  <p>Rechtermuisknop op sectie voor meer opties</p>
                </div>
              </div>
            )}

            {bgSettings.background_image_url && bgImageLoaded && (
              <div className="bg-slate-800 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Achtergrond</h3>
                  <button
                    onClick={() => setBgVisible(v => !v)}
                    className="p-1 hover:bg-slate-700 rounded transition-colors"
                    title={bgVisible ? 'Verbergen' : 'Tonen'}
                  >
                    {bgVisible ? <Eye className="w-3.5 h-3.5 text-slate-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                  </button>
                </div>
                <div>
                  <label className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>Opacity</span>
                    <span className="text-slate-300">{Math.round(bgSettings.background_opacity * 100)}%</span>
                  </label>
                  <input
                    type="range" min="0.1" max="1" step="0.05"
                    value={bgSettings.background_opacity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setBgSettings(prev => ({ ...prev, background_opacity: val }));
                    }}
                    onMouseUp={() => saveBackgroundSettingsQuiet(bgSettings)}
                    className="w-full accent-blue-500 h-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Breedte</label>
                    <input
                      type="number"
                      value={Math.round(bgSettings.background_width || 0)}
                      onChange={(e) => {
                        const w = parseInt(e.target.value) || 0;
                        if (!bgImageRef.current || !bgSettings.background_width) return;
                        const aspect = bgImageRef.current.naturalWidth / bgImageRef.current.naturalHeight;
                        setBgSettings(prev => ({ ...prev, background_width: w, background_height: w / aspect }));
                      }}
                      onBlur={() => saveBackgroundSettingsQuiet(bgSettings)}
                      className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Hoogte</label>
                    <input
                      type="number"
                      value={Math.round(bgSettings.background_height || 0)}
                      disabled
                      className="w-full px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-xs text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">X positie</label>
                    <input
                      type="number"
                      value={Math.round(bgSettings.background_position_x)}
                      onChange={(e) => setBgSettings(prev => ({ ...prev, background_position_x: parseInt(e.target.value) || 0 }))}
                      onBlur={() => saveBackgroundSettingsQuiet(bgSettings)}
                      className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Y positie</label>
                    <input
                      type="number"
                      value={Math.round(bgSettings.background_position_y)}
                      onChange={(e) => setBgSettings(prev => ({ ...prev, background_position_y: parseInt(e.target.value) || 0 }))}
                      onBlur={() => saveBackgroundSettingsQuiet(bgSettings)}
                      className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white"
                    />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={fitBgToCanvas}
                    className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-medium rounded transition-all"
                  >
                    Vul canvas
                  </button>
                  <button
                    onClick={resetBgToOriginal}
                    className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-medium rounded transition-all"
                  >
                    Origineel
                  </button>
                  <button
                    onClick={centerBg}
                    className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-medium rounded transition-all"
                  >
                    Centreer
                  </button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bgSettings.background_locked}
                    onChange={(e) => {
                      const locked = e.target.checked;
                      setBgSettings(prev => ({ ...prev, background_locked: locked }));
                      saveBackgroundSettingsQuiet({ ...bgSettings, background_locked: locked });
                    }}
                    className="w-3.5 h-3.5 rounded bg-slate-700 border-slate-600 accent-blue-500"
                  />
                  <span className="text-[11px] text-slate-400">Vergrendeld</span>
                </label>
              </div>
            )}

            {saving && (
              <div className="bg-green-700/80 text-white rounded-lg p-2.5 text-center text-sm flex items-center justify-center gap-2">
                <Save className="w-4 h-4 animate-pulse" /> Opslaan...
              </div>
            )}

            <SeatLegend
              sectionSeats={sectionSeats}
              sections={seatSections}
              selectedSectionId={selectedItem?.type === 'section' ? selectedItem.data.id : null}
            />

            {currentLayout?.event_id && (
              <AdminSalesWidget stats={salesStats} />
            )}
          </div>
        </div>
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[51] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button onClick={() => openEditSection(contextMenu.section)}
              className="w-full px-4 py-2 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-2">
              <Edit className="w-3.5 h-3.5" /> Bewerken
            </button>
            <button onClick={() => handleDuplicateSection(contextMenu.section)}
              className="w-full px-4 py-2 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-2">
              <Copy className="w-3.5 h-3.5" /> Dupliceren
            </button>
            <div className="border-t border-slate-700 my-1" />
            <button onClick={() => handleDeleteSection(contextMenu.section)}
              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Verwijderen
            </button>
          </div>
        </>
      )}

      <SectionConfigModal
        isOpen={showSectionModal}
        onClose={() => { setShowSectionModal(false); setEditingSection(null); }}
        onSubmit={handleSectionSubmit}
        initialData={editingSection ? {
          name: editingSection.name,
          section_type: editingSection.section_type,
          color: editingSection.color,
          price_category: editingSection.price_category || '',
          price_amount: editingSection.price_amount,
          rows: editingSection.rows_count,
          seats_per_row: editingSection.seats_per_row,
          start_row_label: editingSection.start_row_label || 'A',
          numbering_direction: editingSection.numbering_direction || 'left-to-right',
          row_label_direction: editingSection.row_label_direction || 'top-to-bottom',
          row_spacing: editingSection.row_spacing || 35,
          seat_spacing: editingSection.seat_spacing || 25,
          row_curve: editingSection.row_curve,
          orientation: editingSection.orientation || 'top',
          rotation: editingSection.rotation || 0,
        } : { section_type: sectionModalType }}
        editMode={!!editingSection}
        loading={sectionSaving}
        eventId={selectedEventId}
        ticketTypes={eventTicketTypes}
        linkedTicketTypeIds={editingSection ? (sectionTicketLinks[editingSection.id] || []) : []}
        onTicketTypesChange={(ttIds) => {
          pendingTicketLinks.current = ttIds;
        }}
        onTicketTypesRefresh={selectedEventId ? () => loadTicketData(selectedEventId) : undefined}
      />

      <SeatActionBar
        selectedSeats={selectedSeats}
        sections={seatSections}
        sectionSeats={sectionSeats}
        onDeselectAll={() => setSelectedSeatIds(new Set())}
        setSectionSeats={setSectionSeats}
        setSeatSections={setSeatSections}
        setSelectedSeatIds={setSelectedSeatIds}
        showToast={showToast}
        pushAction={pushAction}
      />

      {seatContextMenu && (
        <SeatContextMenu
          seat={seatContextMenu.seat}
          section={seatContextMenu.section}
          position={seatContextMenu.position}
          sectionSeats={sectionSeats}
          onClose={() => setSeatContextMenu(null)}
          onSelectRow={handleSelectRow}
          onSelectSection={handleSelectSection}
          setSectionSeats={setSectionSeats}
          setSeatSections={setSeatSections}
          setSelectedSeatIds={setSelectedSeatIds}
          showToast={showToast}
          pushAction={pushAction}
        />
      )}

      {drawContextMenu && (
        <SeatDrawContextMenu
          seat={drawContextMenu.seat}
          section={drawContextMenu.section}
          position={drawContextMenu.position}
          onClose={() => setDrawContextMenu(null)}
          onDelete={seatDraw.deleteSeatById}
          onChangeRowLabel={seatDraw.updateSeatRowLabel}
          onChangeNumber={seatDraw.updateSeatNumber}
        />
      )}

      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {latestOrder && (
        <OrderToast order={latestOrder} onDismiss={() => {}} />
      )}

      {showDeleteConfirm && selectedSeatIds.size > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-2">Stoelen Verwijderen</h3>
            <p className="text-sm text-slate-300 mb-3">
              Weet je zeker dat je {selectedSeatIds.size} {selectedSeatIds.size === 1 ? 'stoel' : 'stoelen'} wilt verwijderen?
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  const ids = [...selectedSeatIds];
                  const prevSeats: Record<string, Seat> = {};
                  for (const seats of Object.values(sectionSeats)) {
                    for (const s of seats) {
                      if (selectedSeatIds.has(s.id)) prevSeats[s.id] = s;
                    }
                  }
                  pushAction({
                    type: 'seats_deleted',
                    affected_ids: ids,
                    previous_values: prevSeats,
                    new_values: {},
                    timestamp: new Date(),
                  });
                  try {
                    await deleteSeatsById(ids);
                    const affectedSections = new Set(Object.values(prevSeats).map(s => s.section_id));
                    setSectionSeats(prev => {
                      const next = { ...prev };
                      const idSet = new Set(ids);
                      for (const secId of affectedSections) {
                        next[secId] = (next[secId] || []).filter(s => !idSet.has(s.id));
                      }
                      return next;
                    });
                    for (const secId of affectedSections) {
                      const remaining = (sectionSeats[secId] || []).filter(s => !ids.includes(s.id));
                      setSeatSections(prev => prev.map(s => s.id === secId ? { ...s, capacity: remaining.length } : s));
                      await updateSectionCapacity(secId, remaining.length);
                    }
                    setSelectedSeatIds(new Set());
                    showToast(`${ids.length} stoelen verwijderd`, 'success');
                  } catch (err: any) {
                    showToast(err.message || 'Fout bij verwijderen', 'error');
                  }
                }}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors"
              >
                Ja, Verwijderen
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      {currentLayout && (
        <BackgroundUploadModal
          isOpen={showBgModal}
          onClose={() => setShowBgModal(false)}
          layoutId={currentLayout.id}
          currentSettings={bgSettings}
          onSettingsChange={handleBgSettingsChange}
          showToast={showToast}
        />
      )}

      {showRulerModal && rulerPixelLength && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowRulerModal(false); setRulerPoints([]); }} />
          <div className="relative bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-base font-bold text-white mb-1">Schaal instellen</h3>
            <p className="text-xs text-slate-400 mb-4">
              De gemeten lijn is <span className="text-teal-400 font-mono font-bold">{rulerPixelLength} px</span> lang. Hoe lang is deze afstand in het echt?
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="number"
                value={rulerRealDistance}
                onChange={(e) => setRulerRealDistance(e.target.value)}
                placeholder="bijv. 40"
                min="0.1"
                step="0.1"
                autoFocus
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-teal-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const dist = parseFloat(rulerRealDistance);
                    if (dist > 0 && rulerPixelLength) {
                      const scale = dist / rulerPixelLength;
                      setScaleMetersPerPixel(scale);
                      setShowRulerModal(false);
                      showToast(`Schaal ingesteld: 1px = ${scale.toFixed(4)}m`, 'success');
                    }
                  }
                }}
              />
              <span className="text-sm text-slate-300 font-medium">meter</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRulerModal(false); setRulerPoints([]); }}
                className="flex-1 px-3 py-2 border border-slate-600 text-slate-300 hover:text-white rounded-lg text-sm transition-all"
              >
                Annuleren
              </button>
              <button
                onClick={() => {
                  const dist = parseFloat(rulerRealDistance);
                  if (dist > 0 && rulerPixelLength) {
                    const scale = dist / rulerPixelLength;
                    setScaleMetersPerPixel(scale);
                    setShowRulerModal(false);
                    showToast(`Schaal ingesteld: 1px = ${scale.toFixed(4)}m`, 'success');
                  }
                }}
                className="flex-1 px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-lg text-sm transition-all"
              >
                Instellen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolButton({ active, onClick, icon, label, hoverColor = 'hover:bg-slate-600' }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hoverColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full aspect-square flex flex-col items-center justify-center rounded-lg transition-all text-[10px] font-medium gap-0.5
        ${active ? 'bg-red-600 text-white shadow-lg' : `bg-slate-700 text-slate-300 ${hoverColor} hover:text-white`}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function TableProperties({ table, packages, onUpdate, onSave }: {
  table: FloorplanTable;
  packages: TablePackage[];
  onUpdate: (updates: Partial<FloorplanTable>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-2.5 text-sm">
      <Field label="Naam">
        <input type="text" value={table.table_number}
          onChange={(e) => onUpdate({ table_number: e.target.value })}
          onBlur={onSave} className={inputCls} />
      </Field>

      <Field label="Type">
        <select value={table.table_type || 'SEATED'}
          onChange={(e) => { onUpdate({ table_type: e.target.value }); onSave(); }} className={inputCls}>
          <option value="SEATED">Seated (zittend)</option>
          <option value="STANDING">Standing (staand)</option>
        </select>
      </Field>

      <Field label="Status">
        <select value={table.manual_status || 'AVAILABLE'}
          onChange={(e) => { onUpdate({ manual_status: e.target.value }); onSave(); }} className={inputCls}>
          <option value="AVAILABLE">Beschikbaar</option>
          <option value="SOLD">Verkocht</option>
        </select>
      </Field>

      <Field label="Capaciteit">
        <input type="number" min="1" max="200" value={table.capacity}
          onChange={(e) => onUpdate({ capacity: parseInt(e.target.value) || 1 })}
          onBlur={onSave} className={inputCls} />
      </Field>

      <Field label="Prijs (€)">
        <input type="number" min="0" step="0.01" value={table.price}
          onChange={(e) => onUpdate({ price: parseFloat(e.target.value) || 0 })}
          onBlur={onSave} className={inputCls} />
      </Field>

      <Field label="Package">
        <select value={table.package_id || ''}
          onChange={(e) => { onUpdate({ package_id: e.target.value || null }); onSave(); }} className={inputCls}>
          <option value="">Geen package</option>
          {packages.map(pkg => (
            <option key={pkg.id} value={pkg.id}>{pkg.name} — €{pkg.base_price}</option>
          ))}
        </select>
      </Field>

      <Field label="Inbegrepen tekst">
        <input type="text" value={table.included_text || ''}
          onChange={(e) => onUpdate({ included_text: e.target.value })}
          onBlur={onSave} placeholder="bv. 1 fles + mixers" className={inputCls} />
      </Field>

      <div>
        <label className={labelCls}>Positie & Grootte</label>
        <DimensionsPanel
          values={{
            x: table.x,
            y: table.y,
            width: table.width,
            height: table.height,
            rotation: table.rotation || 0,
          }}
          onChange={(diff) => {
            const updates: Partial<FloorplanTable> = {};
            if (diff.x !== undefined) updates.x = diff.x;
            if (diff.y !== undefined) updates.y = diff.y;
            if (diff.width !== undefined) updates.width = diff.width;
            if (diff.height !== undefined) updates.height = diff.height;
            if (diff.rotation !== undefined) updates.rotation = diff.rotation;
            onUpdate(updates);
            onSave();
          }}
          minWidth={30}
          minHeight={20}
        />
      </div>
    </div>
  );
}

function ObjectProperties({ object, onUpdate, onSave }: {
  object: FloorplanObject;
  onUpdate: (updates: Partial<FloorplanObject>) => void;
  onSave: () => void;
}) {
  const isStageType = (object.type || object.object_type || '').toUpperCase() === 'STAGE';
  return (
    <div className="space-y-2.5 text-sm">
      <Field label="Naam / Label">
        <input type="text" value={object.name || ''}
          onChange={(e) => onUpdate({ name: e.target.value, label: e.target.value })}
          onBlur={onSave} className={inputCls} />
      </Field>

      <Field label="Type">
        <input type="text" value={object.type || object.object_type || ''} disabled
          className="w-full px-2.5 py-1.5 bg-slate-600 border border-slate-500 rounded text-slate-400 text-sm" />
      </Field>

      <Field label="Achtergrondkleur">
        <input type="color" value={object.color || '#6b7280'}
          onChange={(e) => onUpdate({ color: e.target.value })}
          onBlur={onSave} className="w-full h-9 bg-slate-700 border border-slate-600 rounded cursor-pointer" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Tekstkleur">
          <input type="color" value={object.font_color || '#ffffff'}
            onChange={(e) => onUpdate({ font_color: e.target.value })}
            onBlur={onSave} className="w-full h-9 bg-slate-700 border border-slate-600 rounded cursor-pointer" />
        </Field>
        <Field label="Grootte">
          <input type="number" min="8" max="60" value={object.font_size ?? 18}
            onChange={(e) => onUpdate({ font_size: parseInt(e.target.value) || 18 })}
            onBlur={onSave} className={inputCls} />
        </Field>
      </div>

      <Field label="Tekstgewicht">
        <select value={object.font_weight ?? 'bold'}
          onChange={(e) => { onUpdate({ font_weight: e.target.value }); onSave(); }} className={inputCls}>
          <option value="normal">Normaal</option>
          <option value="bold">Vet</option>
          <option value="800">Extra vet</option>
        </select>
      </Field>

      <div>
        <label className={labelCls}>Vertalingen (leeg = standaard naam)</label>
        <div className="space-y-1.5">
          {([['name_nl', 'NL'], ['name_tr', 'TR'], ['name_fr', 'FR'], ['name_de', 'DE']] as const).map(([field, lang]) => (
            <div key={field} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-7 shrink-0 font-semibold">{lang}</span>
              <input type="text" value={(object as any)[field] ?? ''} placeholder={object.name}
                onChange={(e) => onUpdate({ [field]: e.target.value || null } as any)}
                onBlur={onSave}
                className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:border-red-500 focus:outline-none" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Positie & Afmetingen</label>
        <DimensionsPanel
          values={{
            x: object.x,
            y: object.y,
            width: object.width,
            height: object.height,
            rotation: object.rotation || 0,
          }}
          onChange={(diff) => {
            const updates: Partial<FloorplanObject> = {};
            if (diff.x !== undefined) updates.x = diff.x;
            if (diff.y !== undefined) updates.y = diff.y;
            if (diff.width !== undefined) updates.width = diff.width;
            if (diff.height !== undefined) updates.height = diff.height;
            if (diff.rotation !== undefined) updates.rotation = diff.rotation;
            onUpdate(updates);
            onSave();
          }}
          minWidth={30}
          minHeight={20}
        />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="obj_visible" checked={object.is_visible ?? true}
          onChange={(e) => { onUpdate({ is_visible: e.target.checked }); onSave(); }}
          className="w-4 h-4 rounded bg-slate-700 border-slate-600 accent-red-500" />
        <label htmlFor="obj_visible" className="text-slate-300 text-xs">Zichtbaar op publieke floorplan</label>
      </div>

      <button onClick={onSave} className={saveBtnCls}>
        <Save className="w-3.5 h-3.5" /> Opslaan
      </button>
    </div>
  );
}

const inputCls = "w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/20";
const labelCls = "block text-slate-400 text-xs font-medium mb-1";
const saveBtnCls = "w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded transition-colors text-sm";
