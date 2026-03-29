import { memo } from 'react';
import { Eye } from 'lucide-react';
import { st } from '../lib/seatTranslations';

interface Props {
  count: number;
}

export const AdminViewerCount = memo(function AdminViewerCount({ count }: Props) {
  return (
    <div
      className="flex items-center gap-1.5 text-xs"
      title={st(null, 'admin.viewerTooltip', { count: count })}
      aria-label={st(null, 'admin.viewerTooltip', { count: count })}
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${count > 0 ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      <Eye className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
      <span className="text-slate-300 tabular-nums" aria-live="polite">
        {st(null, 'admin.viewersOnline', { count: count })}
      </span>
    </div>
  );
});
