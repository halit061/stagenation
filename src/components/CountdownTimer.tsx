import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

interface CountdownTimerProps {
  targetDate: string;
}

export function CountdownTimer({ targetDate }: CountdownTimerProps) {
  const { t } = useLanguage();
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(calculateTimeRemaining(targetDate));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining(targetDate));
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  function calculateTimeRemaining(date: string): TimeRemaining {
    const target = new Date(date).getTime();
    const now = Date.now();
    const diff = target - now;

    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
    }

    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((diff % (1000 * 60)) / 1000),
      isExpired: false,
    };
  }

  if (timeRemaining.isExpired) {
    return null;
  }

  const timeUnits = [
    { value: timeRemaining.days, label: t('countdown.days') },
    { value: timeRemaining.hours, label: t('countdown.hours') },
    { value: timeRemaining.minutes, label: t('countdown.minutes') },
    { value: timeRemaining.seconds, label: t('countdown.seconds') },
  ];

  return (
    <div className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-amber-500/10 border border-cyan-500/20 rounded-xl p-4">
      <div className="flex items-center justify-center space-x-2 mb-3">
        <Clock className="w-5 h-5 text-cyan-400" />
        <span className="text-sm font-semibold text-cyan-400 uppercase tracking-wide">
          {t('countdown.eventStarts')}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {timeUnits.map((unit, index) => (
          <div key={index} className="text-center">
            <div className="bg-slate-900/50 backdrop-blur border border-slate-700 rounded-lg p-3 mb-1">
              <div className="text-2xl font-bold text-white tabular-nums">
                {String(unit.value).padStart(2, '0')}
              </div>
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">
              {unit.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
