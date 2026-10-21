import type { CSSProperties } from 'react';

export function Avatar({ emoji, color, size = 44, ring = false, dot }: { emoji: string; color: string; size?: number; ring?: boolean; dot?: 'live' | 'move' | 'off' | null }) {
  return (
    <span
      className={`avatar${ring ? ' ring' : ''}`}
      style={{ '--c': color, width: size, height: size, fontSize: size * 0.52 } as CSSProperties}
    >
      <span>{emoji}</span>
      {dot && <i className={`avatar-dot ${dot}`} />}
    </span>
  );
}

export function BatteryChip({ level, charging }: { level: number | null; charging: boolean }) {
  if (level == null) return null;
  const pct = Math.round(level * 100);
  const tone = charging ? 'ok' : pct <= 20 ? 'bad' : pct <= 45 ? 'warn' : 'ok';
  return (
    <span className={`chip bat ${tone}`}>
      <span className="bat-icon">
        <i style={{ width: `${pct}%` }} />
      </span>
      {charging ? '⚡' : ''}
      {pct}%
    </span>
  );
}
