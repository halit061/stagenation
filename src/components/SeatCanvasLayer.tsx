import { useRef, useEffect, useCallback, memo } from 'react';
import type { SeatStatus, SeatType } from '../types/seats';

const STATUS_COLOR: Record<SeatStatus, string> = {
  available: '#4ade80',
  blocked: '#94a3b8',
  reserved: '#fbbf24',
  sold: '#f87171',
};

export interface CanvasSeat {
  id: string;
  cx: number;
  cy: number;
  status: SeatStatus;
  seat_type: SeatType;
  sectionId: string;
  ticket_type_id: string | null;
}

interface SeatDragInfo {
  active: boolean;
  dx: number;
  dy: number;
  seatIds: Set<string>;
}

interface Props {
  seats: CanvasSeat[];
  selectedIds: Set<string>;
  hoveredId: string | null;
  marqueePreviewIds: Set<string>;
  zoom: number;
  seatSize: number;
  ticketTypeColors: Record<string, string>;
  dragState: SeatDragInfo | null;
  canvasWidth: number;
  canvasHeight: number;
}

function drawSeats(
  ctx: CanvasRenderingContext2D,
  seats: CanvasSeat[],
  selectedIds: Set<string>,
  hoveredId: string | null,
  marqueePreviewIds: Set<string>,
  seatSize: number,
  ticketTypeColors: Record<string, string>,
  dragState: SeatDragInfo | null,
  dpr: number,
  zoom: number,
) {
  const scale = zoom * dpr;
  const r = (seatSize / 2) * scale;
  const hoverR = r * 1.25;

  for (const seat of seats) {
    const isDragTarget = dragState?.active && dragState.seatIds.has(seat.id);
    const isSelected = selectedIds.has(seat.id);
    const isHovered = hoveredId === seat.id && !dragState?.active;
    const isMarquee = marqueePreviewIds.has(seat.id);
    const isVip = seat.seat_type === 'vip' && seat.status === 'available';

    if (isDragTarget) {
      ctx.beginPath();
      ctx.arc(seat.cx * scale, seat.cy * scale, r, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLOR[seat.status] || '#4ade80';
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const renderCx = isDragTarget ? (seat.cx + (dragState?.dx ?? 0)) * scale : seat.cx * scale;
    const renderCy = isDragTarget ? (seat.cy + (dragState?.dy ?? 0)) * scale : seat.cy * scale;
    const currentR = isHovered ? hoverR : r;

    const ttColor = seat.ticket_type_id && ticketTypeColors[seat.ticket_type_id];
    const baseColor = isVip && !ttColor
      ? '#fbbf24'
      : (ttColor && seat.status === 'available' ? ttColor : STATUS_COLOR[seat.status] || '#4ade80');

    ctx.beginPath();
    ctx.arc(renderCx, renderCy, currentR, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.globalAlpha = seat.status === 'reserved' ? 0.7 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (seatSize * zoom > 3) {
      const borderColor = isSelected ? '#2563eb' : isMarquee ? '#60a5fa'
        : isVip && !ttColor ? '#d97706'
        : seat.status === 'sold' ? '#ef4444'
        : seat.status === 'blocked' ? '#94a3b8'
        : seat.status === 'reserved' ? '#f59e0b'
        : ttColor && seat.status === 'available' ? ttColor
        : '#22c55e';

      ctx.beginPath();
      ctx.arc(renderCx, renderCy, currentR, 0, Math.PI * 2);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = (isSelected ? 1.5 : isMarquee ? 1.2 : 0.8) * dpr;
      ctx.stroke();
    }

    if (isSelected || isMarquee) {
      ctx.beginPath();
      ctx.arc(renderCx, renderCy, currentR + 1 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }

    if (seatSize * zoom > 4) {
      drawOverlayIcon(ctx, seat, renderCx, renderCy, currentR * 0.45);
    }
  }
}

function drawOverlayIcon(
  ctx: CanvasRenderingContext2D,
  seat: CanvasSeat,
  cx: number,
  cy: number,
  tiny: number,
) {
  ctx.save();

  if (seat.seat_type === 'vip' && seat.status === 'available') {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    const points = [
      [cx, cy - tiny * 1.1],
      [cx + tiny * 0.4, cy - tiny * 0.2],
      [cx + tiny * 1.1, cy - tiny * 0.2],
      [cx + tiny * 0.55, cy + tiny * 0.35],
      [cx + tiny * 0.75, cy + tiny * 1.1],
      [cx, cy + tiny * 0.6],
      [cx - tiny * 0.75, cy + tiny * 1.1],
      [cx - tiny * 0.55, cy + tiny * 0.35],
      [cx - tiny * 1.1, cy - tiny * 0.2],
      [cx - tiny * 0.4, cy - tiny * 0.2],
    ];
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fill();
  } else if (seat.status === 'blocked') {
    const s = tiny * 0.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s);
    ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s);
    ctx.stroke();
  }

  ctx.restore();
}

function SeatCanvasLayerInner({
  seats,
  selectedIds,
  hoveredId,
  marqueePreviewIds,
  zoom,
  seatSize,
  ticketTypeColors,
  dragState,
  canvasWidth,
  canvasHeight,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvasWidth;
    const h = canvasHeight;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSeats(ctx, seats, selectedIds, hoveredId, marqueePreviewIds, seatSize, ticketTypeColors, dragState, dpr, zoom);
  }, [seats, selectedIds, hoveredId, marqueePreviewIds, seatSize, ticketTypeColors, dragState, canvasWidth, canvasHeight, zoom]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        width: canvasWidth,
        height: canvasHeight,
      }}
    />
  );
}

export const SeatCanvasLayer = memo(SeatCanvasLayerInner);
