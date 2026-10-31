'use client';

import { useMemo } from 'react';

interface Flake {
  id: number;
  left: number;
  size: number;
  dur: number;
  delay: number;
  opacity: number;
  swayDur: number;
}

/** Детерминированный «случайный» снег: одинаков на сервере и клиенте (без рассинхрона гидратации) */
function flake(i: number): Flake {
  const r = (k: number) => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    id: i,
    left: r(1) * 100,
    size: 2 + r(2) * 3.5,
    dur: 8 + r(3) * 14,
    delay: -r(4) * 22,
    opacity: 0.2 + r(5) * 0.45,
    swayDur: 2.5 + r(6) * 3.5,
  };
}

export function Snowfall({ count = 34 }: { count?: number }) {
  const flakes = useMemo(() => Array.from({ length: count }, (_, i) => flake(i)), [count]);
  return (
    <div aria-hidden="true">
      {flakes.map((f) => (
        <span
          key={f.id}
          className="snowflake"
          style={{
            left: `${f.left}vw`,
            width: f.size,
            height: f.size,
            opacity: f.opacity,
            animationDuration: `${f.dur}s, ${f.swayDur}s`,
            animationDelay: `${f.delay}s, 0s`,
          }}
        />
      ))}
    </div>
  );
}
