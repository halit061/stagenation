import { useState, useEffect, useRef } from 'react';
import { Save, Trash2, ZoomIn, ZoomOut, Maximize2, Move, Grid3x3, Square, Circle, Copy, Rows3 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from './Toast';

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

export function FloorPlanEditor() {
  const { showToast } = useToast();
  const [tables, setTables] = useState<FloorplanTable[]>([]);
  const [objects, setObjects] = useState<FloorplanObject[]>([]);
  const [packages, setPackages] = useState<TablePackage[]>([]);
  const [selectedItem, setSelectedItem] = useState<{ type: 'table' | 'object'; data: FloorplanTable | FloorplanObject } | null>(null);
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

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    await Promise.all([loadTables(), loadObjects(), loadPackages()]);
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

  const handleItemMouseDown = (e: React.MouseEvent, item: { type: 'table' | 'object'; data: FloorplanTable | FloorplanObject }) => {
    if (currentTool !== 'select') return;
    e.stopPropagation();
    const p = getSvgPoint(e);
    setIsDragging(true);
    setSelectedItem(item);
    setDragOffset({ x: p.x - item.data.x, y: p.y - item.data.y });
  };

  const handleResizeStart = (e: React.MouseEvent, handle: 'se' | 'sw' | 'ne' | 'nw') => {
    e.stopPropagation();
    if (!selectedItem) return;
    const p = getSvgPoint(e);
    setIsResizing(true);
    setResizeHandle(handle);
    setResizeStart({
      x: p.x, y: p.y,
      width: selectedItem.data.width,
      height: selectedItem.data.height,
      ox: selectedItem.data.x,
      oy: selectedItem.data.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!selectedItem) return;
    const p = getSvgPoint(e);

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
      applyLocalUpdate({ ...selectedItem.data, x: nx, y: ny, width: nw, height: nh });
    } else if (isDragging) {
      const nx = Math.max(0, Math.min(1000 - selectedItem.data.width, p.x - dragOffset.x));
      const ny = Math.max(0, Math.min(700 - selectedItem.data.height, p.y - dragOffset.y));
      applyLocalUpdate({ ...selectedItem.data, x: nx, y: ny });
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

  const handleMouseUp = () => {
    if ((isDragging || isResizing) && selectedItem) {
      if (selectedItem.type === 'table') saveTable(selectedItem.data as FloorplanTable);
      else saveObject(selectedItem.data as FloorplanObject);
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
    else if (tool === 'add_tribune') addObject('TRIBUNE');
    else setCurrentTool(tool);
  };

  const ResizeHandles = ({ item }: { item: FloorplanTable | FloorplanObject }) => (
    <>
      {(['se', 'sw', 'ne', 'nw'] as const).map(h => {
        const cx = h.includes('e') ? item.x + item.width : item.x;
        const cy = h.includes('s') ? item.y + item.height : item.y;
        return (
          <circle key={h} cx={cx} cy={cy} r="7" fill="#ef4444" stroke="white" strokeWidth="2"
            style={{ cursor: `${h}-resize` }} onMouseDown={(e) => handleResizeStart(e, h)} />
        );
      })}
    </>
  );

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700">
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
              onClick={() => { if (!isDragging && !isResizing) setSelectedItem(null); }}
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
            ) : (
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Snelle acties</h3>
                <div className="space-y-1.5 text-xs text-slate-400">
                  <p>• Selecteer een item om eigenschappen te bewerken</p>
                  <p>• Gebruik de linkerzijbalk om items toe te voegen</p>
                  <p>• Sleep om te verplaatsen</p>
                  <p>• Rode hoeken om te vergroten/verkleinen</p>
                  <p>• Tribune knop voor tribunes</p>
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
                  { color: '#92400e', label: 'Tribune' },
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
