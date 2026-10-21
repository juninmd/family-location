import type { StyleSpecification } from 'maplibre-gl';
import { MAP_STYLE_URL } from '../lib/config';

let cached: Promise<StyleSpecification> | null = null;
const fetchStyle = () => (cached ??= fetch(MAP_STYLE_URL).then((r) => r.json()) as Promise<StyleSpecification>);

/** Recolore o estilo claro (OpenFreeMap "liberty") para um tema escuro coerente com o app. */
function darken(src: StyleSpecification): StyleSpecification {
  const style = structuredClone(src);
  for (const l of style.layers) {
    const id = l.id;
    const paint = ((l as { paint?: Record<string, unknown> }).paint ??= {});
    if (l.type === 'background') paint['background-color'] = '#0e1325';
    else if (l.type === 'raster') paint['raster-opacity'] = 0.08;
    else if (l.type === 'fill') {
      delete paint['fill-pattern'];
      paint['fill-color'] = /^water$/.test(id)
        ? '#0b2a4a'
        : /park|wood|grass|wetland|pitch/.test(id)
          ? '#10281f'
          : /building/.test(id)
            ? '#1b2340'
            : /sand/.test(id)
              ? '#1b2132'
              : /hospital|school|cemetery|track|aeroway/.test(id)
                ? '#161d33'
                : '#131a2e';
      if (/building/.test(id)) paint['fill-outline-color'] = '#232c4d';
    } else if (l.type === 'fill-extrusion') {
      paint['fill-extrusion-color'] = '#1d2644';
      paint['fill-extrusion-opacity'] = 0.7;
    } else if (l.type === 'line') {
      const casing = /casing/.test(id);
      paint['line-color'] = /waterway/.test(id)
        ? '#0d3157'
        : /boundary/.test(id)
          ? '#3b4670'
          : /rail/.test(id)
            ? '#2a3354'
            : casing
              ? '#0e1325'
              : /motorway|trunk|primary/.test(id)
                ? '#3a4676'
                : /secondary|tertiary/.test(id)
                  ? '#2f3a63'
                  : /path|pedestrian/.test(id)
                    ? '#222b4a'
                    : '#283254';
    } else if (l.type === 'symbol') {
      paint['text-color'] = /water/.test(id) ? '#4f86c6' : '#8d9bc4';
      paint['text-halo-color'] = '#0e1325';
      paint['icon-opacity'] = 0.55;
    }
  }
  return style;
}

export async function loadStyle(dark: boolean): Promise<StyleSpecification> {
  const base = await fetchStyle();
  return dark ? darken(base) : base;
}
