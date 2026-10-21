const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

/** Distância em metros (haversine). */
export function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const validLat = (v) => typeof v === 'number' && v >= -90 && v <= 90;
export const validLng = (v) => typeof v === 'number' && v >= -180 && v <= 180;
