import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Loader2, Image, Trash2, FileText } from 'lucide-react';
import { validateBackgroundFile, isPdf, uploadBackgroundImage, deleteBackgroundImage } from '../lib/backgroundUpload';
import { saveBackgroundSettings } from '../lib/backgroundUpload';
import type { BackgroundSettings } from '../lib/backgroundUpload';

interface BackgroundUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  layoutId: string;
  currentSettings: BackgroundSettings;
  onSettingsChange: (settings: BackgroundSettings) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function BackgroundUploadModal({
  isOpen,
  onClose,
  layoutId,
  currentSettings,
  onSettingsChange,
  showToast,
}: BackgroundUploadModalProps) {
  const [uploading, setUploading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentSettings.background_image_url);
  const [opacity, setOpacity] = useState(currentSettings.background_opacity);
  const [locked, setLocked] = useState(currentSettings.background_locked);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPreviewUrl(currentSettings.background_image_url);
      setOpacity(currentSettings.background_opacity);
      setLocked(currentSettings.background_locked);
    }
  }, [isOpen, currentSettings]);

  const handleFile = useCallback(async (file: File) => {
    const validationError = validateBackgroundFile(file);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setUploading(true);
    try {
      let uploadFile: File | Blob = file;
      let fileName = file.name;

      if (isPdf(file)) {
        setConverting(true);
        const { pdfToImage } = await import('../lib/pdfToImage');
        uploadFile = await pdfToImage(file);
        fileName = file.name.replace('.pdf', '.png');
        setConverting(false);
      }

      const imageUrl = await uploadBackgroundImage(layoutId, uploadFile, fileName);
      setPreviewUrl(imageUrl);
      showToast('Achtergrond geüpload!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Upload gefaald', 'error');
    }
    setConverting(false);
    setUploading(false);
  }, [layoutId, showToast]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  async function handleApply() {
    const newSettings: BackgroundSettings = {
      background_image_url: previewUrl,
      background_opacity: opacity,
      background_position_x: currentSettings.background_position_x,
      background_position_y: currentSettings.background_position_y,
      background_width: currentSettings.background_width,
      background_height: currentSettings.background_height,
      background_rotation: currentSettings.background_rotation,
      background_locked: locked,
    };

    try {
      await saveBackgroundSettings(layoutId, newSettings);
      onSettingsChange(newSettings);
      showToast('Achtergrond instellingen opgeslagen', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Fout bij opslaan', 'error');
    }
  }

  async function handleRemove() {
    if (!currentSettings.background_image_url) return;
    try {
      await deleteBackgroundImage(currentSettings.background_image_url);
      const newSettings: BackgroundSettings = {
        background_image_url: null,
        background_opacity: 0.3,
        background_position_x: 0,
        background_position_y: 0,
        background_width: null,
        background_height: null,
        background_rotation: 0,
        background_locked: true,
      };
      await saveBackgroundSettings(layoutId, newSettings);
      onSettingsChange(newSettings);
      setPreviewUrl(null);
      showToast('Achtergrond verwijderd', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Fout bij verwijderen', 'error');
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h3 className="text-lg font-bold text-white">Zaalplattegrond als Achtergrond</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload een plattegrond van de zaal (PDF of afbeelding). Je kunt hierop je secties en stoelen tekenen.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-blue-400 bg-blue-500/10'
                : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.svg"
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploading || converting ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <p className="text-sm text-slate-300">
                  {converting ? 'PDF converteren naar afbeelding...' : 'Uploaden...'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-slate-400" />
                <p className="text-sm text-slate-300">
                  Sleep een bestand hierheen of klik om te kiezen
                </p>
                <p className="text-xs text-slate-500">
                  PDF, PNG, JPG, SVG (max 10 MB)
                </p>
              </div>
            )}
          </div>

          {previewUrl && (
            <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Image className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-medium text-slate-300">Preview</span>
              </div>
              <div className="bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center" style={{ maxHeight: 200 }}>
                <img
                  src={previewUrl}
                  alt="Zaalplattegrond preview"
                  className="max-w-full max-h-[200px] object-contain"
                  style={{ opacity }}
                />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="flex items-center justify-between text-xs font-medium text-slate-400 mb-1.5">
                <span>Opacity</span>
                <span className="text-white">{Math.round(opacity * 100)}%</span>
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full accent-blue-500 h-1.5"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                <span>10%</span>
                <span>100%</span>
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={locked}
                onChange={(e) => setLocked(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-700 border-slate-600 accent-blue-500"
              />
              <div>
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                  Vergrendeld
                </span>
                <p className="text-xs text-slate-500">
                  Voorkomt dat je de achtergrond per ongeluk versleept
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-slate-700">
          <div>
            {currentSettings.background_image_url && (
              <button
                onClick={handleRemove}
                className="flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:bg-red-500/10 border border-red-500/30 rounded-lg text-sm font-medium transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Verwijderen
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white border border-slate-600 rounded-lg text-sm transition-all"
            >
              Annuleren
            </button>
            <button
              onClick={handleApply}
              disabled={!previewUrl}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-green-600/40 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-all"
            >
              <FileText className="w-3.5 h-3.5" />
              Toepassen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
