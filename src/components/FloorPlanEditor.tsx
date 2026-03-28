import { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Trash2, ZoomIn, ZoomOut, Maximize2, Move, Grid3x3, Square, Circle, Copy, Rows3, Armchair, CreditCard as Edit } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from './Toast';
import { LayoutToolbar } from './LayoutToolbar';
import { SectionConfigModal } from './SectionConfigModal';
import type { SectionFormData } from './SectionConfigModal';
import type { VenueLayout, SeatSection } from '../types/seats';
import { getSectionsByLayout, createSection, updateSection, deleteSection, generateSeats } from '../services/seatService';

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

type EditorTool = 'select' | 'add_seated' | 'add_standing' | 'add_decor' | 'add_bar' | 'add_stage' | 'add_dancefloor' | 'add_tribune';
type ObjectType = 'BAR' | 'STAGE' | 'DANCEFLOOR' | 'DECOR_TABLE' | 'DJ_BOOTH' | 'ENTRANCE' | 'EXIT' | 'RESTROOM' | 'TRIBUNE';
type SelectedItemType = { type: 'table' | 'object' | 'section'; data: FloorplanTable | FloorplanObject | SeatSection };

export function FloorPlanEditor() {
  const { showToast } = useToast();
  const [tables, setTables] = useState<FloorplanTable[]>([]);
  const [objects, setObjects] = useState<FloorplanObject[]>([]);
  const [packages, setPackages] = useState<TablePackage[]>([]);
  const [selectedItem, setSelectedItem] = useState<SelectedItemType | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<'se' | 'sw' | 'ne' | 'nw' | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, ox: 0, oy: 0 });
  const [zoom, setZoom] = useState(1);
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

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    await Promise.all([loadTables(), loadObjects(), loadPackages()]);
  }

  const loadSections = useCallback(async (layoutId: string) => {
    try {
      const data = await getSectionsByLayout(layoutId);
      setSeatSections(data);
    } catch {
      showToast('Fout bij laden secties', 'error');
    }
  }, [showToast]);

  function handleLayoutChange(layout: VenueLayout | null) {
    setCurrentLayout(layout);
    setSelectedItem(null);
    if (layout) {
      setLayoutName(layout.name);
      loadSections(layout.id);
    } else {
      setSeatSections([]);
    }
  }

  function handleLayoutReset() {
    setSeatSections([]);
    setSelectedItem(null);
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
          row_curve: formData.row_curve,
        });
        await generateSeats({
          section_id: editingSection.id,
          rows: formData.rows,
          seats_per_row: formData.seats_per_row,
          start_row_label: formData.start_row_label,
          numbering_direction: formData.numbering_direction,
          row_spacing: formData.row_spacing,
          seat_spacing: formData.seat_spacing,
          curve: formData.row_curve,
        });
        showToast('Sectie bijgewerkt!', 'success');
      } else {
        const sectionWidth = Math.max(150, formData.seats_per_row * formData.seat_spacing + 40);
        const sectionHeight = Math.max(80, formData.rows * formData.row_spacing + 30);
        const newSection = await createSection({
          layout_id: currentLayout.id,
          name: formData.name,
          section_type: formData.section_type,
          capacity: formData.rows * formData.seats_per_row,
          color: formData.color,
          price_category: formData.price_category || null,
          price_amount: formData.price_amount,
          position_x: 500 - sectionWidth / 2,
          position_y: 350 - sectionHeight / 2,
          width: sectionWidth,
          height: sectionHeight,
          rotation: 0,
          rows_count: formData.rows,
          seats_per_row: formData.seats_per_row,
          row_curve: formData.row_curve,
          sort_order: seatSections.length,
          is_active: true,
        });
        await generateSeats({
          section_id: newSection.id,
          rows: formData.rows,
          seats_per_row: formData.seats_per_row,
          start_row_label: formData.start_row_label,
          numbering_direction: formData.numbering_direction,
          row_spacing: formData.row_spacing,
          seat_spacing: formData.seat_spacing,
          curve: formData.row_curve,
        });
        showToast('Sectie aangemaakt!', 'success');
      }
      await loadSections(currentLayout.id);
      setShowSectionModal(false);
      setEditingSection(null);
    } catch (err: any) {
      showToast(err.message || 'Fout bij opslaan sectie', 'error');
    }
    setSectionSaving(false);
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
        position_x: Math.min(section.position_x + 30, 1000 - section.width),
        position_y: Math.min(section.position_y + 30, 700 - section.height),
        width: section.width,
        height: section.height,
        rotation: section.rotation,
        rows_count: section.rows_count,
        seats_per_row: section.seats_per_row,
        row_curve: section.row_curve,
        sort_order: seatSections.length,
        is_active: true,
      });
      await generateSeats({
        section_id: newSection.id,
        rows: section.rows_count,
        seats_per_row: section.seats_per_row,
        start_row_label: 'A',
        numbering_direction: 'left-to-right',
        row_spacing: 35,
        seat_spacing: 25,
        curve: section.row_curve,
      });
      await loadSections(currentLayout.id);
      showToast('Sectie gedupliceerd!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij dupliceren', 'error');
    }
    setSectionSaving(false);
  }

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
    const defaultName = objectType === 'TRIBUNE' ? 'Tribune' : objectType.replace(/_/g, ' ');
    const { data: newObj, error } = await supabase
      .from('floorplan_objects')
      .insert({
        object_type: objectType.toLowerCase(),
        type: objectType,
        name: defaultName,
        label: defaultName,
        x: 500 - sz.width / 2,
        y: 350 - sz.height / 2,
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
    setIsDragging(true);
    setSelectedItem(item);
    if (item.type === 'section') {
      const sec = item.data as SeatSection;
      setDragOffset({ x: p.x - sec.position_x, y: p.y - sec.position_y });
    } else {
      const d = item.data as FloorplanTable | FloorplanObject;
      setDragOffset({ x: p.x - d.x, y: p.y - d.y });
    }
  };

  const handleResizeStart = (e: React.MouseEvent, handle: 'se' | 'sw' | 'ne' | 'nw') => {
    e.stopPropagation();
    if (!selectedItem) return;
    const p = getSvgPoint(e);
    setIsResizing(true);
    setResizeHandle(handle);
    if (selectedItem.type === 'section') {
      const sec = selectedItem.data as SeatSection;
      setResizeStart({ x: p.x, y: p.y, width: sec.width, height: sec.height, ox: sec.position_x, oy: sec.position_y });
    } else {
      setResizeStart({
        x: p.x, y: p.y,
        width: selectedItem.data.width,
        height: selectedItem.data.height,
        ox: (selectedItem.data as FloorplanTable | FloorplanObject).x,
        oy: (selectedItem.data as FloorplanTable | FloorplanObject).y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!selectedItem) return;
    const p = getSvgPoint(e);

    if (selectedItem.type === 'section') {
      const sec = selectedItem.data as SeatSection;
      if (isResizing && resizeHandle) {
        const dx = p.x - resizeStart.x;
        const dy = p.y - resizeStart.y;
        let nw = resizeStart.width, nh = resizeStart.height;
        let nx = resizeStart.ox, ny = resizeStart.oy;
        if (resizeHandle === 'se') { nw = Math.max(80, resizeStart.width + dx); nh = Math.max(60, resizeStart.height + dy); }
        else if (resizeHandle === 'sw') { nw = Math.max(80, resizeStart.width - dx); nh = Math.max(60, resizeStart.height + dy); nx = resizeStart.ox + (resizeStart.width - nw); }
        else if (resizeHandle === 'ne') { nw = Math.max(80, resizeStart.width + dx); nh = Math.max(60, resizeStart.height - dy); ny = resizeStart.oy + (resizeStart.height - nh); }
        else if (resizeHandle === 'nw') { nw = Math.max(80, resizeStart.width - dx); nh = Math.max(60, resizeStart.height - dy); nx = resizeStart.ox + (resizeStart.width - nw); ny = resizeStart.oy + (resizeStart.height - nh); }
        nx = Math.max(0, Math.min(1000 - nw, nx));
        ny = Math.max(0, Math.min(700 - nh, ny));
        const updated = { ...sec, position_x: nx, position_y: ny, width: nw, height: nh };
        setSeatSections(prev => prev.map(s => s.id === sec.id ? updated : s));
        setSelectedItem({ type: 'section', data: updated });
      } else if (isDragging) {
        const nx = Math.max(0, Math.min(1000 - sec.width, p.x - dragOffset.x));
        const ny = Math.max(0, Math.min(700 - sec.height, p.y - dragOffset.y));
        const updated = { ...sec, position_x: nx, position_y: ny };
        setSeatSections(prev => prev.map(s => s.id === sec.id ? updated : s));
        setSelectedItem({ type: 'section', data: updated });
      }
      return;
    }

    if (isResizing && resizeHandle) {
      const dx = p.x - resizeStart.x;
      const dy = p.y - resizeStart.y;
      let nw = resizeStart.width, nh = resizeStart.height;
      let nx = resizeStart.ox, ny = resizeStart.oy;
      if (resizeHandle === 'se') { nw = Math.max(40, resizeStart.width + dx); nh = Math.max(30, resizeStart.height + dy); }
      else if (resizeHandle === 'sw') { nw = Math.max(40, resizeStart.width - dx); nh = Math.max(30, resizeStart.height + dy); nx = resizeStart.ox + (resizeStart.width - nw); }
      else if (resizeHandle === 'ne') { nw = Math.max(40, resizeStart.width + dx); nh = Math.max(30, resizeStart.height - dy); ny = resizeStart.oy + (resizeStart.height - nh); }
      else if (resizeHandle === 'nw') { nw = Math.max(40, resizeStart.width - dx); nh = Math.max(30, resizeStart.height - dy); nx = resizeStart.ox + (resizeStart.width - nw); ny = resizeStart.oy + (resizeStart.height - nh); }
      nx = Math.max(0, Math.min(1000 - nw, nx));
      ny = Math.max(0, Math.min(700 - nh, ny));
      applyLocalUpdate({ ...selectedItem.data, x: nx, y: ny, width: nw, height: nh } as FloorplanTable | FloorplanObject);
    } else if (isDragging) {
      const item = selectedItem.data as FloorplanTable | FloorplanObject;
      const nx = Math.max(0, Math.min(1000 - item.width, p.x - dragOffset.x));
      const ny = Math.max(0, Math.min(700 - item.height, p.y - dragOffset.y));
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

  const handleMouseUp = async () => {
    if ((isDragging || isResizing) && selectedItem) {
      if (selectedItem.type === 'section') {
        const sec = selectedItem.data as SeatSection;
        try {
          await updateSection(sec.id, {
            position_x: sec.position_x,
            position_y: sec.position_y,
            width: sec.width,
            height: sec.height,
          });
        } catch {
          showToast('Fout bij opslaan positie', 'error');
        }
      } else if (selectedItem.type === 'table') {
        saveTable(selectedItem.data as FloorplanTable);
      } else {
        saveObject(selectedItem.data as FloorplanObject);
      }
    }
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
  };

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
    return (
      <>
        {(['se', 'sw', 'ne', 'nw'] as const).map(h => {
          const cx = h.includes('e') ? ix + item.width : ix;
          const cy = h.includes('s') ? iy + item.height : iy;
          return (
            <circle key={h} cx={cx} cy={cy} r="7" fill="#ef4444" stroke="white" strokeWidth="2"
              style={{ cursor: `${h}-resize` }} onMouseDown={(e) => handleResizeStart(e, h)} />
          );
        })}
      </>
    );
  };

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700">
      <div className="p-3 pb-0">
        <LayoutToolbar
          currentLayout={currentLayout}
          onLayoutChange={handleLayoutChange}
          onReset={handleLayoutReset}
          getLayoutData={getLayoutData}
          layoutName={layoutName}
          onLayoutNameChange={setLayoutName}
        />
      </div>

      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Floorplan Editor</h2>
          <div className="flex gap-2">
            <button onClick={() => setZoom(z => Math.min(z + 0.25, 3))} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors" title="Zoom In"><ZoomIn className="w-5 h-5" /></button>
            <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors" title="Zoom Out"><ZoomOut className="w-5 h-5" /></button>
            <button onClick={() => setZoom(1)} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors" title="Reset"><Maximize2 className="w-5 h-5" /></button>
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
          <div className="border-t border-slate-600 my-1" />
          <ToolButton active={showGrid} onClick={() => setShowGrid(!showGrid)} icon={<Grid3x3 className="w-5 h-5" />} label="Grid" />
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-0">
          <div className="lg:col-span-3 p-3">
            <div
              className="bg-slate-950 rounded-lg overflow-hidden"
              style={{ height: '600px' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={() => { if (!isDragging && !isResizing) { setSelectedItem(null); setContextMenu(null); } }}
            >
              <svg
                ref={svgRef}
                viewBox="0 0 1000 700"
                className="w-full h-full"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  transition: isDragging || isResizing ? 'none' : 'transform 0.2s ease-out',
                  cursor: currentTool === 'select' ? 'default' : 'crosshair',
                }}
              >
                <rect x="0" y="0" width="1000" height="700" fill="#0f172a" />

                {showGrid && (
                  <>
                    <defs>
                      <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect x="0" y="0" width="1000" height="700" fill="url(#grid)" />
                  </>
                )}

                {objects.map((obj) => {
                  const isSelected = selectedItem?.type === 'object' && selectedItem.data.id === obj.id;
                  const displayName = obj.name || obj.label || obj.type || '';
                  const isDancefloor = obj.type === 'DANCEFLOOR';
                  const isTribune = obj.type === 'TRIBUNE';

                  return (
                    <g key={obj.id}>
                      <g
                        onMouseDown={(e) => handleItemMouseDown(e, { type: 'object', data: obj })}
                        onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'object', data: obj }); }}
                        style={{ cursor: currentTool === 'select' ? 'move' : 'default' }}
                      >
                        {isTribune ? (
                          <>
                            <rect x={obj.x} y={obj.y} width={obj.width} height={obj.height}
                              fill={obj.color} stroke={isSelected ? '#ef4444' : '#78350f'}
                              strokeWidth={isSelected ? '3' : '2'} rx="4" />
                            {[0.2, 0.4, 0.6, 0.8].map((frac) => (
                              <line key={frac}
                                x1={obj.x + obj.width * frac} y1={obj.y + 4}
                                x2={obj.x + obj.width * frac} y2={obj.y + obj.height - 4}
                                stroke="rgba(0,0,0,0.3)" strokeWidth="1.5"
                              />
                            ))}
                            <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2}
                              textAnchor="middle" dominantBaseline="middle"
                              fill={obj.font_color || '#fff'} fontSize={obj.font_size || 16}
                              fontWeight={obj.font_weight || 'bold'} className="pointer-events-none">
                              {displayName}
                            </text>
                          </>
                        ) : (
                          <>
                            <rect x={obj.x} y={obj.y} width={obj.width} height={obj.height}
                              fill={obj.color} stroke={isSelected ? '#ef4444' : '#475569'}
                              strokeWidth={isSelected ? '3' : '2'} rx="4"
                              opacity={isDancefloor ? 0.35 : 1} />
                            <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2}
                              textAnchor="middle" dominantBaseline="middle"
                              fill={obj.font_color || '#fff'} fontSize={obj.font_size || (isDancefloor ? 16 : 18)}
                              fontWeight={obj.font_weight || 'bold'} className="pointer-events-none"
                              opacity={isDancefloor ? 0.7 : 1}>
                              {displayName.toUpperCase()}
                            </text>
                          </>
                        )}
                      </g>
                      {isSelected && currentTool === 'select' && <ResizeHandles item={obj} />}
                    </g>
                  );
                })}

                {seatSections.map((section) => {
                  const isSel = selectedItem?.type === 'section' && selectedItem.data.id === section.id;
                  const seatCount = section.rows_count * section.seats_per_row;
                  const isTribuneType = section.section_type === 'tribune';
                  return (
                    <g key={`sec-${section.id}`}>
                      <g
                        onMouseDown={(e) => handleItemMouseDown(e, { type: 'section', data: section })}
                        onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'section', data: section }); }}
                        onDoubleClick={(e) => { e.stopPropagation(); openEditSection(section); }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, section });
                        }}
                        style={{ cursor: currentTool === 'select' ? 'move' : 'default' }}
                      >
                        <rect
                          x={section.position_x} y={section.position_y}
                          width={section.width} height={section.height}
                          fill={section.color} fillOpacity={0.15}
                          stroke={isSel ? '#ef4444' : section.color}
                          strokeWidth={isSel ? 3 : 2}
                          strokeDasharray={isTribuneType ? 'none' : '8 4'}
                          rx="6"
                        />
                        <rect
                          x={section.position_x} y={section.position_y}
                          width={section.width} height={24}
                          fill={section.color} fillOpacity={0.35} rx="6"
                        />
                        <rect
                          x={section.position_x} y={section.position_y + 18}
                          width={section.width} height={6}
                          fill={section.color} fillOpacity={0.35}
                        />
                        <text
                          x={section.position_x + 8} y={section.position_y + 16}
                          fill="white" fontSize="12" fontWeight="bold"
                          className="pointer-events-none"
                        >
                          {isTribuneType ? 'T' : 'P'} {section.name}
                        </text>
                        <text
                          x={section.position_x + section.width - 8} y={section.position_y + 16}
                          fill="rgba(255,255,255,0.7)" fontSize="10" textAnchor="end"
                          className="pointer-events-none"
                        >
                          {seatCount} stoelen
                        </text>
                        {section.price_category && (
                          <text
                            x={section.position_x + 8} y={section.position_y + section.height - 8}
                            fill="rgba(255,255,255,0.6)" fontSize="10"
                            className="pointer-events-none"
                          >
                            {section.price_category} — EUR {section.price_amount.toFixed(2)}
                          </text>
                        )}
                        {isTribuneType && section.height > 50 && (() => {
                          const rowCount = Math.min(section.rows_count, Math.floor((section.height - 30) / 8));
                          return Array.from({ length: rowCount }).map((_, i) => {
                            const ry = section.position_y + 30 + i * ((section.height - 36) / rowCount);
                            return (
                              <line key={i}
                                x1={section.position_x + 6} y1={ry}
                                x2={section.position_x + section.width - 6} y2={ry}
                                stroke={section.color} strokeOpacity={0.3} strokeWidth={1}
                              />
                            );
                          });
                        })()}
                        {!isTribuneType && section.width > 60 && section.height > 50 && (() => {
                          const dotRows = Math.min(3, section.rows_count);
                          const dotCols = Math.min(6, section.seats_per_row);
                          const dots: React.ReactNode[] = [];
                          const startY = section.position_y + 32;
                          const endY = section.position_y + section.height - 12;
                          const startX = section.position_x + 12;
                          const endX = section.position_x + section.width - 12;
                          for (let r = 0; r < dotRows; r++) {
                            for (let c = 0; c < dotCols; c++) {
                              const cx = startX + (endX - startX) * (c / (dotCols - 1 || 1));
                              const cy = startY + (endY - startY) * (r / (dotRows - 1 || 1));
                              dots.push(
                                <circle key={`${r}-${c}`} cx={cx} cy={cy} r={3}
                                  fill={section.color} fillOpacity={0.5} className="pointer-events-none" />
                              );
                            }
                          }
                          return dots;
                        })()}
                      </g>
                      {isSel && currentTool === 'select' && <ResizeHandles item={section} />}
                    </g>
                  );
                })}

                {tables.map((table) => {
                  const isSelected = selectedItem?.type === 'table' && selectedItem.data.id === table.id;
                  const isSeated = table.table_type === 'SEATED';
                  const isSold = table.manual_status === 'SOLD';
                  const fillColor = isSold ? '#ef4444' : isSeated ? '#22c55e' : '#3b82f6';

                  return (
                    <g key={table.id}>
                      <g
                        onMouseDown={(e) => handleItemMouseDown(e, { type: 'table', data: table })}
                        onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'table', data: table }); }}
                        style={{ cursor: currentTool === 'select' ? 'move' : 'default' }}
                      >
                        <rect x={table.x} y={table.y} width={table.width} height={table.height}
                          fill={fillColor} stroke={isSelected ? '#ef4444' : '#475569'}
                          strokeWidth={isSelected ? '3' : '2'} rx="4" />
                        {isSeated && [
                          [table.x + 12, table.y + 12],
                          [table.x + table.width - 12, table.y + 12],
                          [table.x + 12, table.y + table.height - 12],
                          [table.x + table.width - 12, table.y + table.height - 12],
                        ].map(([cx, cy], i) => (
                          <circle key={i} cx={cx} cy={cy} r="7" fill="#1e293b" stroke="#475569" strokeWidth="1" />
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
              </svg>
            </div>
          </div>

          <div className="p-3 space-y-3 bg-slate-800/30 border-l border-slate-700 overflow-y-auto" style={{ maxHeight: '636px' }}>
            {selectedItem ? (
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">
                    {selectedItem.type === 'table' ? 'Tafel eigenschappen' : selectedItem.type === 'section' ? 'Sectie eigenschappen' : 'Object eigenschappen'}
                  </h3>
                  <div className="flex gap-1">
                    {selectedItem.type !== 'section' && (
                      <button onClick={duplicateItem} className="p-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors" title="Dupliceren"><Copy className="w-3.5 h-3.5" /></button>
                    )}
                    {selectedItem.type === 'section' ? (
                      <>
                        <button onClick={() => openEditSection(selectedItem.data as SeatSection)} className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors" title="Bewerken"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDuplicateSection(selectedItem.data as SeatSection)} className="p-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors" title="Dupliceren"><Copy className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteSection(selectedItem.data as SeatSection)} className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded transition-colors" title="Verwijderen"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    ) : (
                      <button onClick={deleteItem} className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded transition-colors" title="Verwijderen"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>

                {selectedItem.type === 'section' ? (
                  <SectionProperties section={selectedItem.data as SeatSection} />
                ) : selectedItem.type === 'table' ? (
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

            {saving && (
              <div className="bg-green-700/80 text-white rounded-lg p-2.5 text-center text-sm flex items-center justify-center gap-2">
                <Save className="w-4 h-4 animate-pulse" /> Opslaan...
              </div>
            )}

            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Legenda</p>
              <div className="space-y-1.5">
                {[
                  { color: '#22c55e', label: 'Seated tafel' },
                  { color: '#3b82f6', label: 'Standing tafel' },
                  { color: '#ef4444', label: 'Verkocht' },
                  { color: '#f59e0b', label: 'Bar' },
                  { color: '#1e40af', label: 'Stage / Dancefloor' },
                  { color: '#92400e', label: 'Tribune (object)' },
                  { color: '#3b82f6', label: 'Tribune Sectie (stoelen)', border: true },
                  { color: '#14b8a6', label: 'Plein Sectie (stoelen)', border: true },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs text-slate-300">{label}</span>
                  </div>
                ))}
              </div>
            </div>
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
          row_curve: editingSection.row_curve,
        } : { section_type: sectionModalType }}
        editMode={!!editingSection}
        loading={sectionSaving}
      />
    </div>
  );
}

function SectionProperties({ section }: { section: SeatSection }) {
  return (
    <div className="space-y-2.5 text-sm">
      <div>
        <label className={labelCls}>Naam</label>
        <p className="text-white text-sm">{section.name}</p>
      </div>
      <div>
        <label className={labelCls}>Type</label>
        <p className="text-white text-sm">{section.section_type === 'tribune' ? 'Tribune' : 'Plein'}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Rijen</label>
          <p className="text-white text-sm">{section.rows_count}</p>
        </div>
        <div>
          <label className={labelCls}>Stoelen/Rij</label>
          <p className="text-white text-sm">{section.seats_per_row}</p>
        </div>
      </div>
      <div>
        <label className={labelCls}>Totaal</label>
        <p className="text-white text-sm font-semibold">{section.capacity} stoelen</p>
      </div>
      {section.price_category && (
        <div>
          <label className={labelCls}>Categorie</label>
          <p className="text-white text-sm">{section.price_category}</p>
        </div>
      )}
      <div>
        <label className={labelCls}>Prijs</label>
        <p className="text-white text-sm">EUR {section.price_amount.toFixed(2)}</p>
      </div>
      <div>
        <label className={labelCls}>Kleur</label>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded" style={{ backgroundColor: section.color }} />
          <span className="text-slate-400 text-xs">{section.color}</span>
        </div>
      </div>
      <div>
        <label className={labelCls}>Positie</label>
        <p className="text-slate-400 text-xs">
          X: {Math.round(section.position_x)}, Y: {Math.round(section.position_y)} | {Math.round(section.width)} x {Math.round(section.height)}
        </p>
      </div>
      <p className="text-slate-500 text-xs italic mt-2">Dubbelklik op de sectie om te bewerken</p>
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
        <div className="grid grid-cols-2 gap-1.5">
          {([['X', 'x'], ['Y', 'y'], ['Breedte', 'width'], ['Hoogte', 'height']] as const).map(([ph, key]) => (
            <input key={key} type="number" placeholder={ph} value={Math.round((table as any)[key])}
              onChange={(e) => onUpdate({ [key]: parseInt(e.target.value) || 0 } as any)}
              onBlur={onSave} className={inputCls} />
          ))}
        </div>
      </div>

      <button onClick={onSave} className={saveBtnCls}>
        <Save className="w-3.5 h-3.5" /> Opslaan
      </button>
    </div>
  );
}

function ObjectProperties({ object, onUpdate, onSave }: {
  object: FloorplanObject;
  onUpdate: (updates: Partial<FloorplanObject>) => void;
  onSave: () => void;
}) {
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
        <label className={labelCls}>Positie & Grootte</label>
        <div className="grid grid-cols-2 gap-1.5">
          {([['X', 'x'], ['Y', 'y'], ['Breedte', 'width'], ['Hoogte', 'height']] as const).map(([ph, key]) => (
            <input key={key} type="number" placeholder={ph} value={Math.round((object as any)[key])}
              onChange={(e) => onUpdate({ [key]: parseInt(e.target.value) || 0 } as any)}
              onBlur={onSave} className={inputCls} />
          ))}
        </div>
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
