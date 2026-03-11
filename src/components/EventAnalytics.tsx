import { useState } from 'react';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { LiveSalesCounter } from './LiveSalesCounter';
import { HourlySalesChart } from './HourlySalesChart';

interface EventAnalyticsProps {
  events: Array<{ id: string; name: string; start_date: string }>;
}

export function EventAnalytics({ events }: EventAnalyticsProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  if (!selectedEventId || !selectedEvent) {
    return (
      <div>
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2 text-white">
            Live <span className="text-red-400">Analytics</span>
          </h2>
          <p className="text-white">Selecteer een event om live verkoopcijfers te bekijken</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => setSelectedEventId(event.id)}
              className="bg-slate-800/80 border-2 border-slate-600 hover:border-red-500 rounded-xl p-6 text-left transition-all group"
            >
              <h3 className="text-lg font-bold text-white group-hover:text-red-400 transition-colors">
                {event.name}
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                {new Date(event.start_date).toLocaleDateString('nl-BE', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'Europe/Brussels',
                })}
              </p>
              <div className="flex items-center gap-2 mt-3 text-sm text-slate-500 group-hover:text-red-400 transition-colors">
                <BarChart3 className="w-4 h-4" />
                <span>Bekijk analytics</span>
              </div>
            </button>
          ))}
        </div>

        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <BarChart3 className="w-16 h-16 mb-4 opacity-50" />
            <p>Geen events gevonden</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setSelectedEventId(null)}
        className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Terug naar event selectie
      </button>

      <div className="space-y-6">
        <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
          <LiveSalesCounter eventId={selectedEventId} eventName={selectedEvent.name} />
        </div>

        <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
          <HourlySalesChart eventId={selectedEventId} />
        </div>
      </div>
    </div>
  );
}
