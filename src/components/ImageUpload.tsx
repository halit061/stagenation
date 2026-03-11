import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';

interface ImageUploadProps {
  label: string;
  currentImageUrl?: string;
  onUploadComplete: (fullUrl: string, thumbUrl: string) => void;
  onRemove?: () => void;
  maxSizeMB?: number;
  acceptedFormats?: string[];
  aspectRatio?: string;
}

export function ImageUpload({
  label,
  currentImageUrl,
  onUploadComplete: _onUploadComplete,
  onRemove,
  maxSizeMB = 10,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp'],
  aspectRatio = '16/9',
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, _setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!acceptedFormats.includes(file.type)) {
      return `Ongeldig bestandstype. Toegestaan: ${acceptedFormats.join(', ')}`;
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      return `Bestand te groot. Maximum: ${maxSizeMB}MB`;
    }

    return null;
  };

  const handleFile = async (file: File) => {
    setError(null);

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Note: Actual upload will be handled by parent component
    // This component only handles UI and preview
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onRemove) {
      onRemove();
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-200">
        {label}
      </label>

      {preview ? (
        <div className="relative group">
          <div
            className="relative rounded-lg overflow-hidden bg-slate-800 border-2 border-slate-700"
            style={{ aspectRatio }}
          >
            <img
              src={preview}
              alt={label}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg font-semibold transition-colors"
              >
                Vervangen
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="px-4 py-2 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors"
              >
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-cyan-500 bg-cyan-500/10'
              : 'border-slate-700 hover:border-cyan-500/50 bg-slate-800/50'
          }`}
          style={{ aspectRatio }}
        >
          <div className="flex flex-col items-center justify-center h-full">
            {isUploading ? (
              <>
                <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4" />
                <p className="text-slate-400">Uploaden...</p>
              </>
            ) : (
              <>
                <Upload className="w-12 h-12 text-slate-500 mb-4" />
                <p className="text-slate-300 font-semibold mb-2">
                  Sleep een afbeelding hierheen
                </p>
                <p className="text-slate-500 text-sm mb-4">
                  of klik om een bestand te selecteren
                </p>
                <p className="text-slate-600 text-xs">
                  {acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ')} • Max {maxSizeMB}MB
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats.join(',')}
        onChange={handleFileInput}
        className="hidden"
      />

      {error && (
        <p className="text-red-400 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
