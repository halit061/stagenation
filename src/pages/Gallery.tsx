import { Image as ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useDocumentHead } from '../hooks/useDocumentHead';

interface GalleryImage {
  id: string;
  title: string | null;
  category: string;
  image_url: string;
  display_order: number;
  is_active: boolean;
}

const IMAGES_PER_PAGE = 8;

export function Gallery() {
  const { t } = useLanguage();
  useDocumentHead({
    title: 'Fotogalerij',
    description: 'Bekijk foto\'s van eerdere StageNation evenementen.',
    path: '/gallery',
  });
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    loadImages();
  }, [page]);

  async function loadImages() {
    setLoading(true);
    try {
      const from = page * IMAGES_PER_PAGE;
      const to = from + IMAGES_PER_PAGE - 1;

      const { data, error, count } = await supabase
        .from('gallery_images')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .neq('category', 'hero')
        .neq('category', 'footer')
        .order('display_order', { ascending: true })
        .range(from, to);

      if (error) throw error;

      // Also fetch hero images marked to show in gallery
      let heroGalleryImages: GalleryImage[] = [];
      try {
        const { data: heroData, error: heroError } = await supabase
          .from('gallery_images')
          .select('*')
          .eq('is_active', true)
          .eq('category', 'hero')
          .eq('show_in_gallery', true)
          .order('display_order', { ascending: true })
          .limit(10000);
        if (!heroError && heroData) heroGalleryImages = heroData;
      } catch {
        // show_in_gallery column may not exist yet — silently skip
      }

      const allImages = [...(data || []), ...heroGalleryImages];
      setImages(allImages);
      if (count !== null) setTotalCount(count + heroGalleryImages.length);
    } catch (error) {
      console.error('Error loading gallery images:', error);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(totalCount / IMAGES_PER_PAGE);
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  if (loading && images.length === 0) {
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">{t('home.loading')}</p>
        </div>
      </div>
    );
  }

  if (!loading && totalCount === 0) {
    return (
      <div className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {t('gallery.title')} <span className="text-cyan-400">{t('gallery.titleHighlight')}</span>
            </h1>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              {t('gallery.subtitle')}
            </p>
          </div>
          <div className="mt-16 bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 text-center">
            <ImageIcon className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">{t('gallery.morePhotos')}</h2>
            <p className="text-slate-400 max-w-md mx-auto">
              {t('gallery.morePhotosDesc')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {t('gallery.title')} <span className="text-cyan-400">{t('gallery.titleHighlight')}</span>
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            {t('gallery.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {images.map((image) => (
            <div
              key={image.id}
              onClick={() => setSelectedImage(image)}
              className="group relative aspect-square rounded-xl overflow-hidden border border-slate-700 hover:border-cyan-500/50 transition-all cursor-pointer"
            >
              <img
                src={image.image_url}
                alt={image.title || ''}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  {image.title && (
                    <div className="text-sm text-white font-medium">{image.title}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-12">
            <button
              onClick={() => { setPage(p => Math.max(0, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              disabled={!canPrev}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                canPrev ? 'bg-white/10 hover:bg-cyan-500 text-white hover:text-black' : 'bg-white/5 text-slate-600 cursor-not-allowed'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => { setPage(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  page === i
                    ? 'bg-cyan-500 text-white'
                    : 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white'
                }`}
              >
                {i + 1}
              </button>
            ))}

            <button
              onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              disabled={!canNext}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                canNext ? 'bg-white/10 hover:bg-cyan-500 text-white hover:text-black' : 'bg-white/5 text-slate-600 cursor-not-allowed'
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors z-10"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={selectedImage.image_url}
            alt={selectedImage.title || ''}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          {selectedImage.title && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
              <div className="text-white font-medium">{selectedImage.title}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
