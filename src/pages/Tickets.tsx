import { Calendar, Heart } from 'lucide-react';
import { useDocumentHead } from '../hooks/useDocumentHead';

interface TicketsProps {
  onNavigate?: (page: string) => void;
}

export function Tickets({ onNavigate }: TicketsProps) {
  useDocumentHead({
    title: 'Evenement Voorbij - StageNation',
    description: 'Dit evenement is afgelopen. Bedankt voor jullie steun!',
    path: '/tickets',
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="max-w-lg w-full text-center">
        <div className="relative mb-8">
          <div className="w-24 h-24 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center">
            <Calendar className="w-12 h-12 text-slate-500" />
          </div>
          <div className="absolute -bottom-1 -right-1 left-0 right-0 mx-auto w-fit">
            <span className="inline-block px-3 py-1 bg-slate-800 border border-slate-600 rounded-full text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Afgelopen
            </span>
          </div>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Dit evenement is voorbij
        </h1>

        <p className="text-slate-400 text-lg leading-relaxed mb-8 max-w-md mx-auto">
          Bedankt aan iedereen die erbij was! De ticketverkoop is gesloten.
        </p>

        <div className="inline-flex items-center gap-2 text-slate-500 text-sm">
          <Heart className="w-4 h-4" />
          <span>Tot de volgende keer</span>
        </div>

        <div className="mt-12">
          <button
            onClick={() => onNavigate?.('')}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 rounded-xl text-white font-medium transition-all"
          >
            Terug naar home
          </button>
        </div>
      </div>
    </div>
  );
}
