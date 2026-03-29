import { Eye } from 'lucide-react';

interface Props {
  count: number;
}

export function AdminViewerCount({ count }: Props) {
  return (
    <div className="flex items-center gap-1.5 text-xs" title={`${count} bezoeker${count !== 1 ? 's' : ''} bekijk${count !== 1 ? 'en' : 't'} momenteel het zaalplan voor dit event`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${count > 0 ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      <Eye className="w-3.5 h-3.5 text-slate-400" />
      <span className="text-slate-300 tabular-nums">
        {count} bezoeker{count !== 1 ? 's' : ''} online
      </span>
    </div>
  );
}
