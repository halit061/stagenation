import { useState, useEffect, useMemo } from 'react';
import { Save, Copy, Trash2, FolderOpen, Loader2, AlertTriangle, X, LayoutGrid as Layout, Calendar, ChevronDown, Sparkles } from 'lucide-react';
import type { VenueLayout } from '../types/seats';
import { getAllLayouts, saveLayout, deleteLayout, duplicateLayout, getEventsList, getLayoutByEvent, getTemplates, copyTemplateForEvent, getLayoutById } from '../services/seatService';
import { PRESET_TEMPLATES, applyPresetTemplate, type PresetProgress } from '../services/presetTemplates';
import { sanitizeText, validateLayoutName } from '../lib/validation';
import { useToast } from './Toast';

interface EventOption {
  id: string;
  name: string;
  start_date: string;
  slug: string;
}

interface LayoutToolbarProps {
  currentLayout: VenueLayout | null;
  onLayoutChange: (layout: VenueLayout | null) => void;
  onReset: () => void;
  getLayoutData: () => Record<string, unknown>;
  layoutName: string;
  onLayoutNameChange: (name: string) => void;
  selectedEventId: string | null;
  onEventChange: (eventId: string | null, eventName: string | null) => void;
}

export function LayoutToolbar({
  currentLayout,
  onLayoutChange,
  onReset,
  getLayoutData,
  layoutName,
  onLayoutNameChange,
  selectedEventId,
  onEventChange,
}: LayoutToolbarProps) {
  const { showToast } = useToast();
  const [layouts, setLayouts] = useState<VenueLayout[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateOptions, setTemplateOptions] = useState<VenueLayout[]>([]);
  const [copyingTemplate, setCopyingTemplate] = useState(false);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const [presetProgress, setPresetProgress] = useState<PresetProgress | null>(null);

  const templates = useMemo(() => layouts.filter(l => l.is_template), [layouts]);
  const eventLayouts = useMemo(() => layouts.filter(l => !l.is_template), [layouts]);

  const isTemplateMode = !selectedEventId;

  useEffect(() => {
    loadLayouts();
    loadEvents();
  }, []);

  async function loadLayouts() {
    try {
      const data = await getAllLayouts();
      setLayouts(data);
    } catch {
      showToast('Fout bij laden layouts', 'error');
    }
  }

  async function loadEvents() {
    try {
      const data = await getEventsList();
      setEvents(data);
    } catch {
      showToast('Fout bij laden events', 'error');
    }
  }

  async function handleEventSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const eventId = e.target.value || null;
    if (!eventId) {
      onEventChange(null, null);
      onLayoutChange(null);
      onLayoutNameChange('');
      return;
    }
    const ev = events.find(ev => ev.id === eventId);
    onEventChange(eventId, ev?.name ?? null);

    try {
      const layout = await getLayoutByEvent(eventId);
      if (layout) {
        onLayoutChange(layout);
        onLayoutNameChange(layout.name);
        await loadLayouts();
      } else {
        onLayoutChange(null);
        onLayoutNameChange('');
      }
    } catch {
      showToast('Fout bij laden event layout', 'error');
    }
  }

  async function handleOpenTemplatePicker() {
    try {
      const tpls = await getTemplates();
      setTemplateOptions(tpls);
      setShowTemplatePicker(true);
    } catch {
      showToast('Fout bij laden templates', 'error');
    }
  }

  async function handleCopyTemplate(templateId: string) {
    if (!selectedEventId) return;
    setCopyingTemplate(true);
    try {
      const ev = events.find(e => e.id === selectedEventId);
      const newLayoutId = await copyTemplateForEvent(templateId, selectedEventId, ev?.name ? `${ev.name} Layout` : undefined);
      const layout = await getLayoutById(newLayoutId);
      if (layout) {
        onLayoutChange(layout);
        onLayoutNameChange(layout.name);
      }
      await loadLayouts();
      setShowTemplatePicker(false);
      const tpl = templateOptions.find(t => t.id === templateId);
      showToast(`Template '${tpl?.name ?? ''}' gekopieerd voor ${ev?.name ?? 'event'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij kopiëren template', 'error');
    }
    setCopyingTemplate(false);
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
        event_id: selectedEventId ?? currentLayout?.event_id ?? null,
        layout_data: getLayoutData(),
        is_template: isTemplateMode ? true : (currentLayout?.is_template ?? false),
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
            event_id: saveAsTemplate ? null : selectedEventId ?? dup.event_id,
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
          event_id: saveAsTemplate ? null : selectedEventId,
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

  async function handleApplyPreset(presetId: string) {
    setApplyingPreset(true);
    setPresetProgress(null);
    try {
      const layout = await applyPresetTemplate(
        presetId,
        selectedEventId,
        (p) => setPresetProgress(p),
      );
      onLayoutChange(layout);
      onLayoutNameChange(layout.name);
      await loadLayouts();
      setShowPresetPicker(false);
      const preset = PRESET_TEMPLATES.find(t => t.id === presetId);
      showToast(`Preset "${preset?.name ?? ''}" aangemaakt met ${preset?.totalSeats ?? 0} stoelen!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Fout bij aanmaken preset', 'error');
    }
    setApplyingPreset(false);
    setPresetProgress(null);
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

  function formatDate(d: string) {
    try { return new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  }

  return (
    <>
      <div className="space-y-2 mb-3">
        <div className="flex flex-wrap items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <select
              value={selectedEventId ?? ''}
              onChange={handleEventSelect}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none min-w-[220px]"
            >
              <option value="">Geen event (template modus)</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} — {formatDate(ev.start_date)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {isTemplateMode ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md whitespace-nowrap">
                <Layout className="w-3 h-3" />
                Template Modus
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md whitespace-nowrap">
                <Calendar className="w-3 h-3" />
                Event Modus
              </span>
            )}
          </div>

          {selectedEventId && !currentLayout && (
            <button
              onClick={handleOpenTemplatePicker}
              disabled={copyingTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all"
            >
              {copyingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layout className="w-3.5 h-3.5" />}
              Kies Template
            </button>
          )}

          {!currentLayout && PRESET_TEMPLATES.length > 0 && (
            <button
              onClick={() => setShowPresetPicker(true)}
              disabled={applyingPreset}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-all"
            >
              {applyingPreset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Preset Zaalplan
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl p-3">
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
      </div>

      {showTemplatePicker && (
        <ConfirmModal
          title="Kies een Template"
          onClose={() => setShowTemplatePicker(false)}
          onConfirm={() => {}}
          confirmLabel=""
          confirmColor=""
          hideConfirm
        >
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {templateOptions.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-4">Geen templates beschikbaar</p>
            )}
            {templateOptions.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => handleCopyTemplate(tpl.id)}
                disabled={copyingTemplate}
                className="w-full flex items-center gap-3 p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all text-left"
              >
                <Layout className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{tpl.name}</p>
                  <p className="text-slate-400 text-xs">Laatst bijgewerkt: {formatDate(tpl.updated_at)}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 rotate-[-90deg]" />
              </button>
            ))}
          </div>
        </ConfirmModal>
      )}

      {showPresetPicker && (
        <ConfirmModal
          title="Preset Zaalplan Laden"
          onClose={() => { if (!applyingPreset) setShowPresetPicker(false); }}
          onConfirm={() => {}}
          confirmLabel=""
          confirmColor=""
          hideConfirm
        >
          {applyingPreset ? (
            <div className="py-6 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-white text-sm font-medium">
                {presetProgress?.step || 'Bezig met aanmaken...'}
              </p>
              {presetProgress && (
                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(presetProgress.current / presetProgress.total) * 100}%` }}
                  />
                </div>
              )}
              <p className="text-slate-400 text-xs">
                Dit kan even duren vanwege het grote aantal stoelen...
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {PRESET_TEMPLATES.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset.id)}
                  className="w-full flex items-center gap-3 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all text-left group"
                >
                  <Sparkles className="w-6 h-6 text-amber-400 flex-shrink-0 group-hover:text-amber-300" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{preset.name}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{preset.description}</p>
                    <p className="text-amber-400/80 text-xs mt-1 font-medium">
                      {preset.totalSeats.toLocaleString()} stoelen -- {preset.sections.length} secties
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400 rotate-[-90deg] group-hover:text-white" />
                </button>
              ))}
            </div>
          )}
        </ConfirmModal>
      )}

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
  hideConfirm = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmColor: string;
  loading?: boolean;
  hideConfirm?: boolean;
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
            {hideConfirm ? 'Sluiten' : 'Annuleren'}
          </button>
          {!hideConfirm && (
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`px-4 py-2 text-white font-medium rounded-lg text-sm transition-all flex items-center gap-2 ${confirmColor}`}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
