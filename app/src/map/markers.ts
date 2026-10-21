import type { Person, Pos } from '../lib/types';
import { batteryPct, kmh } from '../lib/format';

/** Cria o elemento HTML do marcador de uma pessoa. Atualizado via `updatePersonEl`. */
export function createPersonEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'pin';
  el.innerHTML = `
    <div class="pin-pulse"></div>
    <div class="pin-arrow"></div>
    <div class="pin-avatar"><span class="pin-emoji"></span><i class="pin-dot"></i></div>
    <div class="pin-label"><b></b><small></small></div>`;
  return el;
}

export function updatePersonEl(el: HTMLElement, p: Person, selected: boolean, stale: boolean) {
  el.style.setProperty('--c', p.color);
  el.classList.toggle('selected', selected);
  el.classList.toggle('stale', stale || !p.sharing);
  el.classList.toggle('moving', p.moving && !stale);
  el.classList.toggle('live', p.online && !stale && !p.moving);
  const pos = p.pos;
  const arrow = el.querySelector<HTMLElement>('.pin-arrow')!;
  const showArrow = !!pos && pos.heading != null && (kmh(pos.speed) ?? 0) >= 4 && !stale;
  arrow.style.opacity = showArrow ? '1' : '0';
  if (showArrow) arrow.style.transform = `rotate(${pos!.heading}deg)`;
  el.querySelector('.pin-emoji')!.textContent = p.emoji;
  el.querySelector('.pin-label b')!.textContent = p.name;
  const bat = batteryPct(pos?.battery ?? null);
  const small = el.querySelector('.pin-label small')!;
  small.textContent = bat != null ? `${pos?.charging ? '⚡' : '🔋'} ${bat}%` : '';
  el.classList.toggle('lowbat', bat != null && bat <= 20 && !pos?.charging);
}

export function createMeEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'me-dot';
  el.innerHTML = '<div class="me-pulse"></div><div class="me-core"></div>';
  return el;
}

export function createPlaceEl(emoji: string, name: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'place-pin';
  el.innerHTML = `<span>${emoji}</span><em></em>`;
  el.querySelector('em')!.textContent = name;
  return el;
}

/** Animação suave entre posições (easeOut). Retorna função de cancelamento. */
export function tween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  ms: number,
  step: (lat: number, lng: number) => void,
): () => void {
  let raf = 0;
  const t0 = performance.now();
  const frame = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - (1 - k) ** 3;
    step(from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e);
    if (k < 1) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

export const isStale = (pos: Pos | null) => !pos || Date.now() - pos.ts > 3 * 60_000;
