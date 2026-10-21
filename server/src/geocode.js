// Geocodificação reversa via Nominatim, respeitando a política de uso:
// 1 req/s, User-Agent identificado e cache. Só é chamado por aparelhos autenticados.
const UA = 'Perto-FamilyLocation/1.0 (https://github.com/juninmd/family-location)';
const cache = new Map();
let chain = Promise.resolve();

const key = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

export function reverseGeocode(lat, lng, fetchImpl = fetch) {
  const k = key(lat, lng);
  if (cache.has(k)) return Promise.resolve(cache.get(k));
  const job = chain.then(async () => {
    if (cache.has(k)) return cache.get(k);
    let address = null;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
      const res = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const j = await res.json();
        const a = j.address ?? {};
        const street = [a.road, a.house_number].filter(Boolean).join(', ');
        const area = a.suburb ?? a.neighbourhood ?? a.city_district;
        const city = a.city ?? a.town ?? a.village ?? a.municipality;
        address = [street, area, city && a.state_code ? `${city} - ${a.state_code}` : city].filter(Boolean).join(' · ') || j.display_name || null;
      }
    } catch {
      return null; // não guarda falhas em cache
    }
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    cache.set(k, address);
    return address;
  });
  chain = job.then(() => new Promise((r) => setTimeout(r, 1100)), () => {});
  return job;
}
