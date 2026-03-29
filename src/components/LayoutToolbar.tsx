import { useState, useEffect, useMemo } from 'react';
import { Save, Copy, Trash2, FolderOpen, Loader2, AlertTriangle, X, LayoutGrid as Layout, Calendar } from 'lucide-react';
import type { VenueLayout } from '../types/seats';
import { getAllLayouts, saveLayout, deleteLayout, duplicateLayout } from '../services/seatService';
import { sanitizeText, validateLayoutName } from '../lib/validation';
import { useToast } from './Toast';

interface LayoutToolbarProps {
  currentLayout: VenueLayout | null;
  onLayoutChange: (layout: VenueLayout | null) => void;
  onReset: () => void;
  getLayoutData: () => Record<string, unknown>;
  layoutName: string;
  onLayoutNameChange: (name: string) => void;
}

export function LayoutToolbar({
  currentLayout,
  onLayoutChange,
  onReset,
  getLayoutData,
  layoutName,
  onLayoutNameChange,
}: LayoutToolbarProps) {
  const { showToast } = useToast();
  const [layouts, setLayouts] = useState<VenueLayout[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const templates = useMemo(() => layouts.filter(l => l.is_template), [layouts]);
  const eventLayouts = useMemo(() => layouts.filter(l => !l.is_template), [layouts]);

  useEffect(() => {
    loadLayouts();
  }, []);

  async function loadLayouts() {
    try {
      const data = await getAllLayouts();
      setLayouts(data);
    } catch {
      showToast('Fout bij laden layouts', 'error');
    }
  }

  async function handleSave() {
    const nameErr = validateLayoutName(layoutName);
    if (nameErr) { showToast(nameErr, 'error'); return; }

    setLoading(true);
    try {
      const saved = await saveLayout({
        id: currentLayout?.id,
        name: sanitizeText(layoutName),
        venue_id: currentLayout?.venue_id ?? null,
        event_id: currentLayout?.event_id ?? null,
        layout_data: getLayoutData(),
      });
      onLayoutChange(saved);
      await loadLayouts();
      showToast('Layout opgeslagen!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij opslaan', 'error');
    }
    setLoading(false);
  }

  async function handleSaveAs() {
    const nameErr = validateLayoutName(saveAsName);
    if (nameErr) { showToast(nameErr, 'error'); return; }

    setLoading(true);
    try {
      if (currentLayout?.id) {
        const dup = await duplicateLayout(currentLayout.id, sanitizeText(saveAsName));
        if (saveAsTemplate !== dup.is_template) {
          const updated = await saveLayout({
            id: dup.id,
            name: dup.name,
            is_template: saveAsTemplate,
            event_id: saveAsTemplate ? null : dup.event_id,
          });
          onLayoutChange(updated);
        } else {
          onLayoutChange(dup);
        }
      } else {
        const saved = await saveLayout({
          name: sanitizeText(saveAsName),
          layout_data: getLayoutData(),
          is_template: saveAsTemplate,
        });
        onLayoutChange(saved);
      }
      await loadLayouts();
      setShowSaveAs(false);
      setSaveAsName('');
      setSaveAsTemplate(false);
      showToast(saveAsTemplate ? 'Template opgeslagen!' : 'Layout opgeslagen als kopie!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij opslaan', 'error');
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!currentLayout?.id) return;
    setLoading(true);
    try {
      await deleteLayout(currentLayout.id);
      onLayoutChange(null);
      onLayoutNameChange('');
      await loadLayouts();
      showToast('Layout verwijderd', 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij verwijderen', 'error');
    }
    setConfirmDelete(false);
    setLoading(false);
  }

  function handleReset() {
    onReset();
    setConfirmReset(false);
    showToast('Zaalplan gereset', 'info');
  }

  async function handleLayoutSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) {
      onLayoutChange(null);
      onLayoutNameChange('');
      return;
    }
    const selected = layouts.find((l) => l.id === id);
    if (selected) {
      onLayoutChange(selected);
      onLayoutNameChange(selected.name);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl p-3 mb-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <select
            value={currentLayout?.id ?? ''}
            onChange={handleLayoutSelect}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none min-w-[180px]"
          >
            <option value="">Nieuwe Layout</option>
            {templates.length > 0 && (
              <optgroup label="Templates">
                {templates.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </optgroup>
            )}
            {eventLayouts.length > 0 && (
              <optgroup label="Event Layouts">
                {eventLayouts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}{l.event_id ? '' : ' (los)'}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[150px]">
          <input
            type="text"
            value={layoutName}
            onChange={(e) => onLayoutNameChange(e.target.value)}
            placeholder="Layout naam..."
            maxLength={200}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none flex-1"
          />
          {currentLayout?.is_template && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md whitespace-nowrap">
              <Layout className="w-3 h-3" />
              Template
            </span>
          )}
          {currentLayout && !currentLayout.is_template && currentLayout.event_id && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md whitespace-nowrap">
              <Calendar className="w-3 h-3" />
              Event
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={loading || !layoutName.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-green-600/40 text-white text-sm font-medium rounded-lg transition-all"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Opslaan
          </button>

          <button
            onClick={() => { setSaveAsName(layoutName ? layoutName + ' (kopie)' : ''); setShowSaveAs(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all"
          >
            <Copy className="w-3.5 h-3.5" />
            Opslaan Als...
          </button>

          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset
          </button>

          {currentLayout?.id && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-500 text-red-400 hover:bg-red-500/10 text-sm font-medium rounded-lg transition-all"
            >
              Verwijder Layout
            </button>
          )}
        </div>
      </div>

      {showSaveAs && (
        <ConfirmModal
          title="Opslaan Als..."
          onClose={() => { setShowSaveAs(false); setSaveAsTemplate(false); }}
          onConfirm={handleSaveAs}
          confirmLabel="Opslaan"
          confirmColor="bg-blue-600 hover:bg-blue-500"
          loading={loading}
        >
          <div className="space-y-3">
            <input
              type="text"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="Nieuwe layout naam..."
              maxLength={200}
              autoFocus
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
            />
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
                className="rounded border-slate-500 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-slate-700"
              />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                Opslaan als herbruikbare template
              </span>
            </label>
          </div>
        </ConfirmModal>
      )}

      {confirmReset && (
        <ConfirmModal
          title="Zaalplan Resetten"
          onClose={() => setConfirmReset(false)}
          onConfirm={handleReset}
          confirmLabel="Ja, Reset"
          confirmColor="bg-red-600 hover:bg-red-500"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-slate-300 text-sm">
              Weet je zeker dat je het hele zaalplan wilt resetten? Alle secties en stoelen worden verwijderd van de canvas.
            </p>
          </div>
        </ConfirmModal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Layout Verwijderen"
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          confirmLabel="Ja, Verwijder"
          confirmColor="bg-red-600 hover:bg-red-500"
          loading={loading}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-slate-300 text-sm">
              Weet je zeker dat je deze layout permanent wilt verwijderen? Alle bijbehorende secties en stoelen worden ook verwijderd.
            </p>
          </div>
        </ConfirmModal>
      )}
    </>
  );
}

function ConfirmModal({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel,
  confirmColor,
  loading = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmColor: string;
  loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="mb-6">{children}</div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-300 hover:text-white border border-slate-600 rounded-lg text-sm transition-all">
            Annuleren
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-white font-medium rounded-lg text-sm transition-all flex items-center gap-2 ${confirmColor}`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
