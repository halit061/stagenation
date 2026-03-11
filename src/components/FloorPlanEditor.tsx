import { useState, useEffect, useRef } from 'react';
import { Save, Trash2, ZoomIn, ZoomOut, Maximize2, Move, Grid3x3, Square, Circle, Copy } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import type { Database } from '../lib/supabaseClient';
import { useToast } from './Toast';

type FloorplanTable = Database['public']['Tables']['floorplan_tables']['Row'];
type TablePackage = Database['public']['Tables']['table_packages']['Row'];

interface FloorplanObject {
  id: string;
  event_id: string | null;
  type: 'BAR' | 'STAGE' | 'DANCEFLOOR' | 'DECOR_TABLE' | 'DJ_BOOTH' | 'ENTRANCE' | 'EXIT' | 'RESTROOM';
  name: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  is_active: boolean;
  is_visible?: boolean;
  font_size?: number;
  font_color?: string;
  font_weight?: string;
  name_nl?: string;
  name_tr?: string;
  name_fr?: string;
  name_de?: string;
  created_at: string;
  updated_at: string;
}

type EditorTool = 'select' | 'add_seated' | 'add_standing' | 'add_decor_table' | 'add_bar' | 'add_stage' | 'add_dancefloor' | 'add_label';

export function FloorPlanEditor() {
  const { showToast } = useToast();
  const [tables, setTables] = useState<FloorplanTable[]>([]);
  const [objects, setObjects] = useState<FloorplanObject[]>([]);
  const [packages, setPackages] = useState<TablePackage[]>([]);
  const [selectedItem, setSelectedItem] = useState<{ type: 'table' | 'object', data: FloorplanTable | FloorplanObject } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<'se' | 'sw' | 'ne' | 'nw' | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [currentTool, setCurrentTool] = useState<EditorTool>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    loadTables();
    loadObjects();
    loadPackages();
  }, []);

  async function loadTables() {
    try {
      const { data, error } = await supabase
        .from('floorplan_tables')
        .select('*')
        .order('table_number', { ascending: true });

      if (error) throw error;
      setTables(data || []);
    } catch (error) {
      console.error('Error loading tables:', error);
    }
  }

  async function loadObjects() {
    try {
      const { data, error } = await supabase
        .from('floorplan_objects')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setObjects(data as FloorplanObject[] || []);
    } catch (error) {
      console.error('Error loading objects:', error);
    }
  }

  async function loadPackages() {
    try {
      const { data, error } = await supabase
        .from('table_packages')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setPackages(data || []);
    } catch (error) {
      console.error('Error loading packages:', error);
    }
  }

  async function saveTable(table: Partial<FloorplanTable>) {
    try {
      setSaving(true);
      if (table.id) {
        const tableData = table as any;
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
            max_guests: tableData.max_guests,
            included_text: tableData.included_text,
            included_items: tableData.included_items,
            updated_at: new Date().toISOString(),
          })
          .eq('id', table.id);

        if (error) throw error;
      }
      await loadTables();
    } catch (error) {
      console.error('Error saving table:', error);
    } finally {
      setSaving(false);
    }
  }

  async function saveObject(obj: Partial<FloorplanObject>) {
    try {
      setSaving(true);
      if (obj.id) {
        const { error } = await supabase
          .from('floorplan_objects')
          .update({
            name: obj.name,
            label: obj.label || obj.name,
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
            updated_at: new Date().toISOString(),
          })
          .eq('id', obj.id);

        if (error) throw error;
      }
      await loadObjects();
    } catch (error) {
      console.error('Error saving object:', error);
    } finally {
      setSaving(false);
    }
  }

  async function validateStatusChange(tableId: string, newStatus: string): Promise<boolean> {
    if (newStatus === 'AVAILABLE') {
      const { data: paidBookings } = await supabase
        .from('table_bookings')
        .select('id')
        .eq('floorplan_table_id', tableId)
        .eq('status', 'PAID')
        .limit(1);

      if (paidBookings && paidBookings.length > 0) {
        showToast('Deze tafel heeft een actieve reservatie en kan niet beschikbaar worden gemaakt.', 'error');
        return false;
      }
    }
    return true;
  }

  async function updateTableStatus(table: FloorplanTable, newStatus: string) {
    const isValid = await validateStatusChange(table.id, newStatus);
    if (!isValid) {
      await loadTables();
      return;
    }

    const updatedTable = { ...table, manual_status: newStatus };
    setSelectedItem({ type: 'table', data: updatedTable });
    setTables((prev) =>
      prev.map((t) => (t.id === table.id ? updatedTable : t))
    );
    await saveTable(updatedTable);
  }

  async function addTable(tableType: 'SEATED' | 'STANDING' = 'SEATED') {
    try {
      setSaving(true);

      const nextTableNumber = tables.length > 0
        ? Math.max(...tables.map(t => {
            const num = parseInt(t.table_number.replace(/\D/g, ''));
            return isNaN(num) ? 0 : num;
          })) + 1
        : 1;

      const { data: newTable, error } = await supabase
        .from('floorplan_tables')
        .insert({
          table_number: `Tafel ${nextTableNumber}`,
          table_type: tableType,
          capacity: 4,
          price: 50,
          x: 500 - 40,
          y: 350 - 30,
          width: 80,
          height: 60,
          rotation: 0,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      await loadTables();
      setSelectedItem({ type: 'table', data: newTable });
      setCurrentTool('select');
    } catch (error) {
      console.error('Error adding table:', error);
      showToast('Failed to add table. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function addObject(objectType: FloorplanObject['type']) {
    try {
      setSaving(true);

      const colorMap: Record<FloorplanObject['type'], string> = {
        BAR: '#f59e0b',
        STAGE: '#7c3aed',
        DANCEFLOOR: '#1e40af',
        DECOR_TABLE: '#6b7280',
        DJ_BOOTH: '#ec4899',
        ENTRANCE: '#10b981',
        EXIT: '#ef4444',
        RESTROOM: '#3b82f6',
      };

      const sizeMap: Record<FloorplanObject['type'], { width: number, height: number }> = {
        BAR: { width: 200, height: 80 },
        STAGE: { width: 200, height: 90 },
        DANCEFLOOR: { width: 300, height: 200 },
        DECOR_TABLE: { width: 60, height: 50 },
        DJ_BOOTH: { width: 120, height: 80 },
        ENTRANCE: { width: 80, height: 60 },
        EXIT: { width: 80, height: 60 },
        RESTROOM: { width: 80, height: 60 },
      };

      const { data: newObject, error } = await supabase
        .from('floorplan_objects')
        .insert({
          type: objectType,
          name: objectType.replace('_', ' '),
          label: objectType.replace('_', ' '),
          x: 500 - sizeMap[objectType].width / 2,
          y: 350 - sizeMap[objectType].height / 2,
          width: sizeMap[objectType].width,
          height: sizeMap[objectType].height,
          rotation: 0,
          color: colorMap[objectType],
          is_active: true,
          is_visible: true,
        })
        .select()
        .single();

      if (error) throw error;
      await loadObjects();
      setSelectedItem({ type: 'object', data: newObject as FloorplanObject });
      setCurrentTool('select');
    } catch (error) {
      console.error('Error adding object:', error);
      showToast('Failed to add object. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    if (!selectedItem) return;
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      if (selectedItem.type === 'table') {
        const { error } = await supabase
          .from('floorplan_tables')
          .delete()
          .eq('id', selectedItem.data.id);

        if (error) throw error;
        await loadTables();
      } else {
        const { error } = await supabase
          .from('floorplan_objects')
          .delete()
          .eq('id', selectedItem.data.id);

        if (error) throw error;
        await loadObjects();
      }
      setSelectedItem(null);
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  }

  async function duplicateItem() {
    if (!selectedItem) return;

    try {
      setSaving(true);

      if (selectedItem.type === 'table') {
        const table = selectedItem.data as FloorplanTable;
        const tableData = table as any;

        const nextTableNumber = tables.length > 0
          ? Math.max(...tables.map(t => {
              const num = parseInt(t.table_number.replace(/\D/g, ''));
              return isNaN(num) ? 0 : num;
            })) + 1
          : 1;

        const { data: newTable, error } = await supabase
          .from('floorplan_tables')
          .insert({
            table_number: `Tafel ${nextTableNumber}`,
            table_type: table.table_type,
            capacity: table.capacity,
            price: table.price,
            x: table.x + 20,
            y: table.y + 20,
            width: table.width,
            height: table.height,
            rotation: table.rotation,
            package_id: table.package_id,
            max_guests: tableData.max_guests,
            included_text: tableData.included_text,
            included_items: tableData.included_items,
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;
        await loadTables();
        setSelectedItem({ type: 'table', data: newTable });
      } else {
        const obj = selectedItem.data as FloorplanObject;

        const { data: newObject, error } = await supabase
          .from('floorplan_objects')
          .insert({
            type: obj.type,
            name: obj.name + ' Copy',
            label: (obj.label || obj.name) + ' Copy',
            x: obj.x + 20,
            y: obj.y + 20,
            width: obj.width,
            height: obj.height,
            rotation: obj.rotation,
            color: obj.color,
            is_active: true,
            is_visible: obj.is_visible ?? true,
          })
          .select()
          .single();

        if (error) throw error;
        await loadObjects();
        setSelectedItem({ type: 'object', data: newObject as FloorplanObject });
      }
    } catch (error) {
      console.error('Error duplicating item:', error);
    } finally {
      setSaving(false);
    }
  }

  void function _moveLayer(_direction: 'forward' | 'backward') {
    showToast('Layer control will be implemented with z-index field', 'info');
  };

  const handleMouseDown = (e: React.MouseEvent, item: { type: 'table' | 'object', data: FloorplanTable | FloorplanObject }) => {
    if (currentTool !== 'select') return;
    e.stopPropagation();

    const svg = svgRef.current;
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    setIsDragging(true);
    setSelectedItem(item);
    setDragOffset({
      x: svgP.x - item.data.x,
      y: svgP.y - item.data.y,
    });
  };

  const handleResizeStart = (e: React.MouseEvent, handle: 'se' | 'sw' | 'ne' | 'nw') => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg || !selectedItem) return;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    setIsResizing(true);
    setResizeHandle(handle);
    setResizeStart({
      x: svgP.x,
      y: svgP.y,
      width: selectedItem.data.width,
      height: selectedItem.data.height,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    if (isResizing && selectedItem && resizeHandle) {
      const deltaX = svgP.x - resizeStart.x;
      const deltaY = svgP.y - resizeStart.y;

      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newX = selectedItem.data.x;
      let newY = selectedItem.data.y;

      if (resizeHandle === 'se') {
        newWidth = Math.max(40, resizeStart.width + deltaX);
        newHeight = Math.max(30, resizeStart.height + deltaY);
      } else if (resizeHandle === 'sw') {
        newWidth = Math.max(40, resizeStart.width - deltaX);
        newHeight = Math.max(30, resizeStart.height + deltaY);
        newX = selectedItem.data.x + (resizeStart.width - newWidth);
      } else if (resizeHandle === 'ne') {
        newWidth = Math.max(40, resizeStart.width + deltaX);
        newHeight = Math.max(30, resizeStart.height - deltaY);
        newY = selectedItem.data.y + (resizeStart.height - newHeight);
      } else if (resizeHandle === 'nw') {
        newWidth = Math.max(40, resizeStart.width - deltaX);
        newHeight = Math.max(30, resizeStart.height - deltaY);
        newX = selectedItem.data.x + (resizeStart.width - newWidth);
        newY = selectedItem.data.y + (resizeStart.height - newHeight);
      }

      newX = Math.max(0, Math.min(1000 - newWidth, newX));
      newY = Math.max(0, Math.min(700 - newHeight, newY));

      const updatedData = { ...selectedItem.data, x: newX, y: newY, width: newWidth, height: newHeight };

      if (selectedItem.type === 'table') {
        setTables((prev) =>
          prev.map((t) =>
            t.id === selectedItem.data.id
              ? updatedData as FloorplanTable
              : t
          )
        );
      } else {
        setObjects((prev) =>
          prev.map((o) =>
            o.id === selectedItem.data.id
              ? updatedData as FloorplanObject
              : o
          )
        );
      }
      setSelectedItem({ ...selectedItem, data: updatedData });
    } else if (isDragging && selectedItem) {
      const newX = Math.max(0, Math.min(1000 - selectedItem.data.width, svgP.x - dragOffset.x));
      const newY = Math.max(0, Math.min(700 - selectedItem.data.height, svgP.y - dragOffset.y));

      const updatedData = { ...selectedItem.data, x: newX, y: newY };

      if (selectedItem.type === 'table') {
        setTables((prev) =>
          prev.map((t) =>
            t.id === selectedItem.data.id
              ? updatedData as FloorplanTable
              : t
          )
        );
      } else {
        setObjects((prev) =>
          prev.map((o) =>
            o.id === selectedItem.data.id
              ? updatedData as FloorplanObject
              : o
          )
        );
      }
      setSelectedItem({ ...selectedItem, data: updatedData });
    }
  };

  const handleMouseUp = () => {
    if ((isDragging || isResizing) && selectedItem) {
      if (selectedItem.type === 'table') {
        saveTable(selectedItem.data as FloorplanTable);
      } else {
        saveObject(selectedItem.data as FloorplanObject);
      }
    }
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleResetView = () => setZoom(1);

  const handleToolClick = (tool: EditorTool) => {
    setCurrentTool(tool);

    if (tool === 'add_seated') addTable('SEATED');
    else if (tool === 'add_standing') addTable('STANDING');
    else if (tool === 'add_decor_table') addObject('DECOR_TABLE');
    else if (tool === 'add_bar') addObject('BAR');
    else if (tool === 'add_stage') addObject('STAGE');
    else if (tool === 'add_dancefloor') addObject('DANCEFLOOR');
  };

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700">
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Floorplan Editor</h2>
          <div className="flex gap-2">
            <button
              onClick={handleZoomIn}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button
              onClick={handleResetView}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              title="Reset View"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* LEFT SIDEBAR - TOOLS */}
        <div className="w-20 bg-slate-800 border-r border-slate-700 p-2 space-y-2 flex-shrink-0">
          <button
            onClick={() => setCurrentTool('select')}
            className={`w-full aspect-square flex flex-col items-center justify-center rounded-lg transition-all ${
              currentTool === 'select'
                ? 'bg-slate-600 text-white shadow-lg'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            title="Select / Move"
          >
            <Move className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Select</span>
          </button>

          <div className="border-t border-slate-600 pt-2" />

          <button
            onClick={() => handleToolClick('add_seated')}
            className="w-full aspect-square flex flex-col items-center justify-center rounded-lg bg-slate-700 text-slate-300 hover:bg-green-600 hover:text-white transition-all"
            title="Add Seated Table"
          >
            <Square className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Seated</span>
          </button>

          <button
            onClick={() => handleToolClick('add_standing')}
            className="w-full aspect-square flex flex-col items-center justify-center rounded-lg bg-slate-700 text-slate-300 hover:bg-blue-600 hover:text-white transition-all"
            title="Add Standing Table"
          >
            <Circle className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Standing</span>
          </button>

          <button
            onClick={() => handleToolClick('add_decor_table')}
            className="w-full aspect-square flex flex-col items-center justify-center rounded-lg bg-slate-700 text-slate-300 hover:bg-gray-600 hover:text-white transition-all"
            title="Add Decorative Table"
          >
            <Square className="w-6 h-6 opacity-60" />
            <span className="text-[10px] mt-1 font-medium">Decor</span>
          </button>

          <div className="border-t border-slate-600 pt-2" />

          <button
            onClick={() => handleToolClick('add_bar')}
            className="w-full aspect-square flex flex-col items-center justify-center rounded-lg bg-slate-700 text-slate-300 hover:bg-orange-600 hover:text-white transition-all"
            title="Add Bar"
          >
            <Square className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Bar</span>
          </button>

          <button
            onClick={() => handleToolClick('add_stage')}
            className="w-full aspect-square flex flex-col items-center justify-center rounded-lg bg-slate-700 text-slate-300 hover:bg-purple-600 hover:text-white transition-all"
            title="Add Stage"
          >
            <Square className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Stage</span>
          </button>

          <button
            onClick={() => handleToolClick('add_dancefloor')}
            className="w-full aspect-square flex flex-col items-center justify-center rounded-lg bg-slate-700 text-slate-300 hover:bg-blue-700 hover:text-white transition-all"
            title="Add Dancefloor"
          >
            <Square className="w-6 h-6 opacity-70" />
            <span className="text-[10px] mt-1 font-medium">Dance</span>
          </button>

          <div className="border-t border-slate-600 pt-2" />

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`w-full aspect-square flex flex-col items-center justify-center rounded-lg transition-all ${
              showGrid
                ? 'bg-slate-600 text-white'
                : 'bg-slate-700 text-slate-400'
            }`}
            title="Toggle Grid"
          >
            <Grid3x3 className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Grid</span>
          </button>
        </div>

        {/* CANVAS AND RIGHT SIDEBAR */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 p-4">
          <div className="lg:col-span-3">
            <div
              className="bg-slate-950 rounded-lg overflow-hidden"
              style={{ height: '600px' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <svg
                ref={svgRef}
                viewBox="0 0 1000 700"
                className="w-full h-full"
                style={{
                  transform: `scale(${zoom})`,
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

                {/* Render floorplan objects (Bar, Stage, Dancefloor, etc.) */}
                {objects.map((obj) => {
                  const isSelected = selectedItem?.type === 'object' && selectedItem.data.id === obj.id;
                  const displayName = obj.label || obj.name;

                  return (
                    <g key={obj.id}>
                      <g
                        onMouseDown={(e) => handleMouseDown(e, { type: 'object', data: obj })}
                        style={{ cursor: currentTool === 'select' ? 'move' : 'default' }}
                      >
                        <rect
                          x={obj.x}
                          y={obj.y}
                          width={obj.width}
                          height={obj.height}
                          fill={obj.color}
                          stroke={isSelected ? '#a855f7' : '#475569'}
                          strokeWidth={isSelected ? '3' : '2'}
                          rx="4"
                          opacity={obj.type === 'DANCEFLOOR' ? 0.3 : 1}
                          className="transition-all duration-200"
                        />

                        <text
                          x={obj.x + obj.width / 2}
                          y={obj.y + obj.height / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={obj.font_color || 'white'}
                          fontSize={obj.font_size || (obj.type === 'DANCEFLOOR' ? 16 : 20)}
                          fontWeight={obj.font_weight || 'bold'}
                          className="pointer-events-none"
                          opacity={obj.type === 'DANCEFLOOR' ? 0.6 : 1}
                        >
                          {displayName.toUpperCase()}
                        </text>
                      </g>

                      {isSelected && currentTool === 'select' && (
                        <>
                          <circle
                            cx={obj.x + obj.width}
                            cy={obj.y + obj.height}
                            r="6"
                            fill="#a855f7"
                            stroke="white"
                            strokeWidth="2"
                            style={{ cursor: 'se-resize' }}
                            onMouseDown={(e) => handleResizeStart(e, 'se')}
                          />
                          <circle
                            cx={obj.x}
                            cy={obj.y + obj.height}
                            r="6"
                            fill="#a855f7"
                            stroke="white"
                            strokeWidth="2"
                            style={{ cursor: 'sw-resize' }}
                            onMouseDown={(e) => handleResizeStart(e, 'sw')}
                          />
                          <circle
                            cx={obj.x + obj.width}
                            cy={obj.y}
                            r="6"
                            fill="#a855f7"
                            stroke="white"
                            strokeWidth="2"
                            style={{ cursor: 'ne-resize' }}
                            onMouseDown={(e) => handleResizeStart(e, 'ne')}
                          />
                          <circle
                            cx={obj.x}
                            cy={obj.y}
                            r="6"
                            fill="#a855f7"
                            stroke="white"
                            strokeWidth="2"
                            style={{ cursor: 'nw-resize' }}
                            onMouseDown={(e) => handleResizeStart(e, 'nw')}
                          />
                        </>
                      )}
                    </g>
                  );
                })}

                {/* Render reservable tables */}
                {tables.map((table) => {
                  const isSelected = selectedItem?.type === 'table' && selectedItem.data.id === table.id;
                  const isSeated = table.table_type === 'SEATED';
                  const isSold = table.manual_status === 'SOLD';

                  return (
                    <g key={table.id}>
                      <g
                        onMouseDown={(e) => handleMouseDown(e, { type: 'table', data: table })}
                        style={{ cursor: currentTool === 'select' ? 'move' : 'default' }}
                      >
                        <rect
                          x={table.x}
                          y={table.y}
                          width={table.width}
                          height={table.height}
                          fill={isSold ? '#ef4444' : (isSeated ? '#22c55e' : '#3b82f6')}
                          stroke={isSelected ? '#a855f7' : '#475569'}
                          strokeWidth={isSelected ? '3' : '2'}
                          rx="4"
                          className="transition-all duration-200"
                        />

                        {isSeated && (
                          <>
                            <circle
                              cx={table.x + 15}
                              cy={table.y + 15}
                              r="8"
                              fill="#334155"
                              stroke="#64748b"
                              strokeWidth="1"
                            />
                            <circle
                              cx={table.x + table.width - 15}
                              cy={table.y + 15}
                              r="8"
                              fill="#334155"
                              stroke="#64748b"
                              strokeWidth="1"
                            />
                            <circle
                              cx={table.x + 15}
                              cy={table.y + table.height - 15}
                              r="8"
                              fill="#334155"
                              stroke="#64748b"
                              strokeWidth="1"
                            />
                            <circle
                              cx={table.x + table.width - 15}
                              cy={table.y + table.height - 15}
                              r="8"
                              fill="#334155"
                              stroke="#64748b"
                              strokeWidth="1"
                            />
                          </>
                        )}

                        <text
                          x={table.x + table.width / 2}
                          y={table.y + table.height / 2}
                          textAnchor="middle"
                          fill="white"
                          fontSize="18"
                          fontWeight="bold"
                          className="pointer-events-none"
                        >
                          {table.table_number}
                        </text>

                        <text
                          x={table.x + table.width / 2}
                          y={table.y + table.height / 2 + 18}
                          textAnchor="middle"
                          fill="white"
                          fontSize="12"
                          className="pointer-events-none"
                        >
                          {table.capacity}p
                        </text>
                      </g>

                      {isSelected && currentTool === 'select' && (
                        <>
                          <circle
                            cx={table.x + table.width}
                            cy={table.y + table.height}
                            r="6"
                            fill="#a855f7"
                            stroke="white"
                            strokeWidth="2"
                            style={{ cursor: 'se-resize' }}
                            onMouseDown={(e) => handleResizeStart(e, 'se')}
                          />
                          <circle
                            cx={table.x}
                            cy={table.y + table.height}
                            r="6"
                            fill="#a855f7"
                            stroke="white"
                            strokeWidth="2"
                            style={{ cursor: 'sw-resize' }}
                            onMouseDown={(e) => handleResizeStart(e, 'sw')}
                          />
                          <circle
                            cx={table.x + table.width}
                            cy={table.y}
                            r="6"
                            fill="#a855f7"
                            stroke="white"
                            strokeWidth="2"
                            style={{ cursor: 'ne-resize' }}
                            onMouseDown={(e) => handleResizeStart(e, 'ne')}
                          />
                          <circle
                            cx={table.x}
                            cy={table.y}
                            r="6"
                            fill="#a855f7"
                            stroke="white"
                            strokeWidth="2"
                            style={{ cursor: 'nw-resize' }}
                            onMouseDown={(e) => handleResizeStart(e, 'nw')}
                          />
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* RIGHT SIDEBAR - PROPERTIES */}
          <div className="space-y-4">
            {selectedItem && (
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">
                    {selectedItem.type === 'table' ? 'Table Properties' : 'Object Properties'}
                  </h3>
                  <div className="flex gap-1">
                    <button
                      onClick={duplicateItem}
                      className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                      title="Duplicate"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={deleteItem}
                      className="p-2 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {selectedItem.type === 'table' ? (
                  <TableProperties
                    table={selectedItem.data as FloorplanTable}
                    packages={packages}
                    onUpdate={(updates) => {
                      const updatedTable = { ...selectedItem.data, ...updates } as FloorplanTable;
                      setSelectedItem({ type: 'table', data: updatedTable });
                      setTables((prev) =>
                        prev.map((t) => (t.id === selectedItem.data.id ? updatedTable : t))
                      );
                    }}
                    onSave={() => saveTable(selectedItem.data as FloorplanTable)}
                    onStatusChange={(newStatus) => updateTableStatus(selectedItem.data as FloorplanTable, newStatus)}
                  />
                ) : (
                  <ObjectProperties
                    object={selectedItem.data as FloorplanObject}
                    onUpdate={(updates) => {
                      const updatedObject = { ...selectedItem.data, ...updates } as FloorplanObject;
                      setSelectedItem({ type: 'object', data: updatedObject });
                      setObjects((prev) =>
                        prev.map((o) => (o.id === selectedItem.data.id ? updatedObject : o))
                      );
                    }}
                    onSave={() => saveObject(selectedItem.data as FloorplanObject)}
                  />
                )}
              </div>
            )}

            {!selectedItem && (
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
                <div className="space-y-2 text-sm text-slate-400">
                  <p>• Select an item to edit properties</p>
                  <p>• Use left sidebar to add new items</p>
                  <p>• Drag to move, resize handles to scale</p>
                  <p>• Toggle grid for alignment</p>
                </div>
              </div>
            )}

            {saving && (
              <div className="bg-green-600 text-white rounded-lg p-3 text-center">
                <Save className="w-5 h-5 inline-block mr-2" />
                Saving...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Table Properties Component
function TableProperties({
  table,
  packages,
  onUpdate,
  onSave,
  onStatusChange
}: {
  table: FloorplanTable;
  packages: TablePackage[];
  onUpdate: (updates: Partial<FloorplanTable>) => void;
  onSave: () => void;
  onStatusChange: (status: string) => void;
}) {
  const tableData = table as any;

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-slate-300 mb-1 font-medium">Name</label>
        <input
          type="text"
          value={table.table_number}
          onChange={(e) => onUpdate({ table_number: e.target.value })}
          onBlur={onSave}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Type</label>
        <select
          value={table.table_type || 'SEATED'}
          onChange={(e) => {
            onUpdate({ table_type: e.target.value as 'SEATED' | 'STANDING' });
            onSave();
          }}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="SEATED">Seated</option>
          <option value="STANDING">Standing</option>
        </select>
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Status</label>
        <select
          value={table.manual_status || 'AVAILABLE'}
          onChange={(e) => onStatusChange(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="AVAILABLE">Available</option>
          <option value="SOLD">Sold</option>
        </select>
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Capacity</label>
        <input
          type="number"
          min="1"
          max="50"
          value={table.capacity}
          onChange={(e) => onUpdate({ capacity: parseInt(e.target.value) || 1 })}
          onBlur={onSave}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Price (€)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={table.price}
          onChange={(e) => onUpdate({ price: parseFloat(e.target.value) || 0 })}
          onBlur={onSave}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Package</label>
        <select
          value={table.package_id || ''}
          onChange={(e) => {
            onUpdate({ package_id: e.target.value || null });
            onSave();
          }}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="">No package</option>
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.name} - €{pkg.base_price}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Position & Size</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            value={Math.round(table.x)}
            onChange={(e) => onUpdate({ x: parseInt(e.target.value) || 0 })}
            onBlur={onSave}
            placeholder="X"
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
          />
          <input
            type="number"
            value={Math.round(table.y)}
            onChange={(e) => onUpdate({ y: parseInt(e.target.value) || 0 })}
            onBlur={onSave}
            placeholder="Y"
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
          />
          <input
            type="number"
            value={Math.round(table.width)}
            onChange={(e) => onUpdate({ width: parseInt(e.target.value) || 40 })}
            onBlur={onSave}
            placeholder="Width"
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
          />
          <input
            type="number"
            value={Math.round(table.height)}
            onChange={(e) => onUpdate({ height: parseInt(e.target.value) || 30 })}
            onBlur={onSave}
            placeholder="Height"
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Included Text</label>
        <input
          type="text"
          value={tableData.included_text || ''}
          onChange={(e) => onUpdate({ included_text: e.target.value } as any)}
          onBlur={onSave}
          placeholder="What's included"
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

// Object Properties Component
function ObjectProperties({
  object,
  onUpdate,
  onSave
}: {
  object: FloorplanObject;
  onUpdate: (updates: Partial<FloorplanObject>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-slate-300 mb-1 font-medium">Name</label>
        <input
          type="text"
          value={object.name}
          onChange={(e) => onUpdate({ name: e.target.value, label: e.target.value })}
          onBlur={onSave}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
        />
      </div>

      {/* Translated Names */}
      <div>
        <label className="block text-slate-300 mb-1 font-medium">Translated Names</label>
        <div className="space-y-2">
          {([
            ['name_nl', '🇳🇱 NL'],
            ['name_tr', '🇹🇷 TR'],
            ['name_fr', '🇫🇷 FR'],
            ['name_de', '🇩🇪 DE'],
          ] as const).map(([field, label]) => (
            <div key={field} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-12 shrink-0">{label}</span>
              <input
                type="text"
                value={(object as any)[field] ?? ''}
                placeholder={object.name}
                onChange={(e) => onUpdate({ [field]: e.target.value || null } as any)}
                onBlur={onSave}
                className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:border-purple-500 focus:outline-none"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-1">Leave empty to use default name</p>
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Type</label>
        <input
          type="text"
          value={object.type}
          disabled
          className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-400"
        />
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Color</label>
        <input
          type="color"
          value={object.color}
          onChange={(e) => onUpdate({ color: e.target.value })}
          onBlur={onSave}
          className="w-full h-10 bg-slate-700 border border-slate-600 rounded cursor-pointer"
        />
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Position & Size</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            value={Math.round(object.x)}
            onChange={(e) => onUpdate({ x: parseInt(e.target.value) || 0 })}
            onBlur={onSave}
            placeholder="X"
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
          />
          <input
            type="number"
            value={Math.round(object.y)}
            onChange={(e) => onUpdate({ y: parseInt(e.target.value) || 0 })}
            onBlur={onSave}
            placeholder="Y"
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
          />
          <input
            type="number"
            value={Math.round(object.width)}
            onChange={(e) => onUpdate({ width: parseInt(e.target.value) || 40 })}
            onBlur={onSave}
            placeholder="Width"
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
          />
          <input
            type="number"
            value={Math.round(object.height)}
            onChange={(e) => onUpdate({ height: parseInt(e.target.value) || 40 })}
            onBlur={onSave}
            placeholder="Height"
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Font Properties */}
      <div>
        <label className="block text-slate-300 mb-1 font-medium">Font Size</label>
        <input
          type="number"
          min={8}
          max={48}
          value={object.font_size ?? 14}
          onChange={(e) => onUpdate({ font_size: parseInt(e.target.value) || 14 })}
          onBlur={onSave}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Font Color</label>
        <input
          type="color"
          value={object.font_color ?? '#ffffff'}
          onChange={(e) => onUpdate({ font_color: e.target.value })}
          onBlur={onSave}
          className="w-full h-10 bg-slate-700 border border-slate-600 rounded cursor-pointer"
        />
      </div>

      <div>
        <label className="block text-slate-300 mb-1 font-medium">Font Weight</label>
        <select
          value={object.font_weight ?? 'bold'}
          onChange={(e) => {
            onUpdate({ font_weight: e.target.value });
            onSave();
          }}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
          <option value="800">Extra Bold</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_visible"
          checked={object.is_visible ?? true}
          onChange={(e) => {
            onUpdate({ is_visible: e.target.checked });
            onSave();
          }}
          className="w-4 h-4 bg-slate-700 border-slate-600 rounded"
        />
        <label htmlFor="is_visible" className="text-slate-300 font-medium">Visible on public floorplan</label>
      </div>

      <button
        onClick={onSave}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded transition-colors"
      >
        <Save className="w-4 h-4" />
        Save
      </button>
    </div>
  );
}
