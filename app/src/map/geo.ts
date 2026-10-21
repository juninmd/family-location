export type LngLat = [number, number];

export function circlePolygon(lat: number, lng: number, radiusM: number, steps = 48): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: LngLat[] = [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

export const emptyFC = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });
