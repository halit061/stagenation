import { useMemo } from 'react';
import type { CanvasSeat } from '../components/SeatCanvasLayer';

const VIEWPORT_PADDING = 100;

export function useViewportCulling(
  seats: CanvasSeat[],
  containerWidth: number,
  containerHeight: number,
  zoom: number,
  scrollLeft: number,
  scrollTop: number,
): CanvasSeat[] {
  return useMemo(() => {
    if (seats.length === 0) return seats;
    if (containerWidth === 0 || containerHeight === 0) return seats;

    const invZoom = 1 / zoom;
    const viewLeft = scrollLeft * invZoom - VIEWPORT_PADDING * invZoom;
    const viewTop = scrollTop * invZoom - VIEWPORT_PADDING * invZoom;
    const viewRight = (scrollLeft + containerWidth) * invZoom + VIEWPORT_PADDING * invZoom;
    const viewBottom = (scrollTop + containerHeight) * invZoom + VIEWPORT_PADDING * invZoom;

    return seats.filter(s =>
      s.cx >= viewLeft && s.cx <= viewRight &&
      s.cy >= viewTop && s.cy <= viewBottom
    );
  }, [seats, containerWidth, containerHeight, zoom, scrollLeft, scrollTop]);
}
