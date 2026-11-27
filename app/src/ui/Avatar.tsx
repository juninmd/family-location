import type { CSSProperties } from 'react';
import { Avatar as SonidoAvatar, Badge } from '@juninmd/sonido';

/**
 * Perto identity is an emoji plus a per-person colour, which Sonido's Avatar does not model.
 * We keep the identity by rendering it into the Avatar image and let Sonido own size, ring
 * and presence dot.
 */
export function emojiAvatarSrc(emoji: string, color: string): string {
  const safeColor = /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#7c6cff';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${safeColor}"/><stop offset="1" stop-color="${safeColor}" stop-opacity=".62"/>
</linearGradient></defs>
<circle cx="48" cy="48" r="47" fill="url(#g)"/>
<circle cx="48" cy="48" r="44" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3"/>
<text x="48" y="50" font-size="46" text-anchor="middle" dominant-baseline="central">${emoji}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function Avatar({
  emoji,
  color,
  name,
  size = 44,
  ring = false,
  dot,
}: {
  emoji: string;
  color: string;
  name?: string;
  size?: number;
  ring?: boolean;
  dot?: 'live' | 'move' | 'off' | null;
}) {
  const status = dot === 'live' ? 'online' : dot === 'move' ? 'away' : dot === 'off' ? 'offline' : undefined;
  return (
    <span className="app-avatar" style={{ '--c': color } as CSSProperties}>
      <SonidoAvatar name={name ?? emoji} src={emojiAvatarSrc(emoji, color)} size={size} ring={ring} status={status} />
    </span>
  );
}

export function BatteryChip({ level, charging }: { level: number | null; charging: boolean }) {
  if (level == null) return null;
  const pct = Math.round(level * 100);
  const tone = charging || pct > 45 ? 'success' : pct <= 20 ? 'danger' : 'warning';
  return (
    <Badge tone={tone} appearance="soft" className="bat">
      <span className="bat-icon">
        <i style={{ width: `${pct}%` }} />
      </span>
      {charging ? '⚡' : ''}
      {pct}%
    </Badge>
  );
}
