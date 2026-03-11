import { useState, useEffect } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'logo' | 'fadeout'>('logo');

  useEffect(() => {
    const logoTimer = setTimeout(() => {
      setPhase('fadeout');
    }, 2200);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2800);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity duration-600 ${
        phase === 'fadeout' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="splash-glow-1" />
        <div className="splash-glow-2" />
      </div>

      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="splash-particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Logo container */}
      <div className="relative flex flex-col items-center">
        <div className="splash-logo-container">
          <span className="text-amber-400 font-black text-4xl md:text-5xl lg:text-6xl tracking-widest uppercase drop-shadow-2xl" style={{ letterSpacing: '0.12em' }}>
            STAGENATION
          </span>
        </div>

        {/* Tagline */}
        <div className="splash-tagline mt-8">
          <p className="text-amber-200/60 text-sm md:text-base tracking-[0.3em] font-light">
            PREMIUM EVENT EXPERIENCE
          </p>
        </div>
      </div>
    </div>
  );
}
