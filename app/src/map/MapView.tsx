import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { getState, select, useStore } from '../lib/store';
import type { Person } from '../lib/types';
import { circlePolygon, emptyFC } from './geo';
import { createMeEl, createPersonEl, createPlaceEl, isStale, tween, updatePersonEl } from './markers';
import { loadStyle } from './style';

const FRANCA: [number, number] = [-47.4009, -20.5386];

interface PinRec { marker: maplibregl.Marker; el: HTMLElement; cur: { lat: number; lng: number }; cancel?: () => void }

let mapRef: maplibregl.Map | null = null;
export const mapApi = {
  center: () => (mapRef ? { lat: mapRef.getCenter().lat, lng: mapRef.getCenter().lng } : null),
  zoomBy: (d: number) => mapRef?.easeTo({ zoom: mapRef.getZoom() + d, duration: 250 }),
  fitAll() {
    const { me, myPos } = getState();
    if (!mapRef) return;
    const pts: [number, number][] = [];
    me?.following.forEach((p) => p.pos && pts.push([p.pos.lng, p.pos.lat]));
    if (myPos) pts.push([myPos.lng, myPos.lat]);
    if (!pts.length) return;
    if (pts.length === 1) return void mapRef.easeTo({ center: pts[0], zoom: 15, duration: 700 });
    const b = pts.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(pts[0], pts[0]));
    mapRef.fitBounds(b, { padding: { top: 120, bottom: 300, left: 50, right: 50 }, maxZoom: 16, duration: 900 });
  },
};

export function MapView({ dark }: { dark: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const pins = useRef(new Map<string, PinRec>());
  const placePins = useRef<maplibregl.Marker[]>([]);
  const meMarker = useRef<maplibregl.Marker | null>(null);
  const [attr, setAttr] = useState(false);
  const loaded = useRef(false);
  const fitted = useRef(false);
  const centered = useRef(false);

  const me = useStore((s) => s.me);
  const myPos = useStore((s) => s.myPos);
  const selected = useStore((s) => s.selected);
  const trails = useStore((s) => s.trails);
  const trailHours = useStore((s) => s.trailHours);
  const focus = useStore((s) => s.focus);
  const pick = useStore((s) => s.pickPlace);
  const tab = useStore((s) => s.tab);

  // Criação do mapa (uma vez)
  useEffect(() => {
    const map = new maplibregl.Map({
      container: box.current!,
      center: FRANCA,
      zoom: 13,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      style: { version: 8, sources: {}, layers: [] },
    });
    map.touchZoomRotate.disableRotation();
    map.on('click', () => !getState().pickPlace && select(null));
    mapRef = map;
    return () => {
      pins.current.forEach((p) => p.marker.remove());
      pins.current.clear();
      map.remove();
      mapRef = null;
      loaded.current = false;
    };
  }, []);

  // Estilo claro/escuro + camadas de dados
  useEffect(() => {
    const map = mapRef;
    if (!map) return;
    let cancelled = false;
    loaded.current = false;
    loadStyle(dark).then((style) => {
      if (cancelled) return;
      map.setStyle(style, { diff: false });
      map.once('style.load', () => {
        const fc = emptyFC();
        for (const id of ['acc', 'places', 'trail', 'pick']) map.addSource(id, { type: 'geojson', data: fc });
        const fillOp = dark ? 0.16 : 0.14;
        map.addLayer({ id: 'places-fill', type: 'fill', source: 'places', paint: { 'fill-color': '#8b5cf6', 'fill-opacity': fillOp } });
        map.addLayer({ id: 'places-line', type: 'line', source: 'places', paint: { 'line-color': '#8b5cf6', 'line-width': 1.5, 'line-dasharray': [2, 2] } });
        map.addLayer({ id: 'acc-fill', type: 'fill', source: 'acc', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.13 } });
        map.addLayer({ id: 'acc-line', type: 'line', source: 'acc', paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.5, 'line-width': 1 } });
        map.addLayer({ id: 'trail-casing', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#0e1325' : '#ffffff', 'line-width': 9, 'line-opacity': 0.85 } });
        map.addLayer({ id: 'trail', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.95 } });
        map.addLayer({ id: 'pick-fill', type: 'fill', source: 'pick', paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.22 } });
        map.addLayer({ id: 'pick-line', type: 'line', source: 'pick', paint: { 'line-color': '#8b5cf6', 'line-width': 2 } });
        loaded.current = true;
        syncData();
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  const setData = (id: string, data: GeoJSON.FeatureCollection) =>
    (mapRef?.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);

  function syncData() {
    if (!loaded.current || !mapRef) return;
    const s = getState();
    const acc: GeoJSON.Feature[] = [];
    s.me?.following.forEach((p) => {
      if (p.pos && p.sharing && (p.pos.acc ?? 0) > 15) {
        const f = circlePolygon(p.pos.lat, p.pos.lng, Math.min(p.pos.acc!, 500));
        f.properties = { color: p.color };
        acc.push(f);
      }
    });
    setData('acc', { type: 'FeatureCollection', features: acc });
    setData('places', {
      type: 'FeatureCollection',
      features: (s.me?.places ?? []).map((pl) => circlePolygon(pl.lat, pl.lng, pl.radius)),
    });
    const sel = s.me?.following.find((p) => p.code === s.selected);
    const trail = s.selected && s.trailHours != null ? s.trails[s.selected] : null;
    setData('trail', {
      type: 'FeatureCollection',
      features:
        sel && trail && trail.length > 1
          ? [{ type: 'Feature', properties: { color: sel.color }, geometry: { type: 'LineString', coordinates: trail.map((t) => [t.lng, t.lat]) } }]
          : [],
    });
  }

  // Marcadores de pessoas
  useEffect(() => {
    const map = mapRef;
    if (!map) return;
    const people: Person[] = me?.following ?? [];
    const seen = new Set<string>();
    for (const p of people) {
      if (!p.pos) continue;
      seen.add(p.code);
      const stale = isStale(p.pos);
      let rec = pins.current.get(p.code);
      if (!rec) {
        const el = createPersonEl();
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          select(p.code);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.pos.lng, p.pos.lat]).addTo(map);
        rec = { marker, el, cur: { lat: p.pos.lat, lng: p.pos.lng } };
        pins.current.set(p.code, rec);
      } else if (rec.cur.lat !== p.pos.lat || rec.cur.lng !== p.pos.lng) {
        rec.cancel?.();
        const r = rec;
        const from = { ...r.cur };
        r.cancel = tween(from, p.pos, 1600, (lat, lng) => {
          r.cur = { lat, lng };
          r.marker.setLngLat([lng, lat]);
        });
      }
      updatePersonEl(rec.el, p, p.code === selected, stale);
      rec.el.style.zIndex = p.code === selected ? '5' : '2';
    }
    for (const [code, rec] of pins.current) {
      if (!seen.has(code)) {
        rec.cancel?.();
        rec.marker.remove();
        pins.current.delete(code);
      }
    }
    syncData();
    if (!fitted.current && seen.size) {
      fitted.current = true;
      setTimeout(() => mapApi.fitAll(), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, selected, trails, trailHours]);

  // Lugares
  useEffect(() => {
    const map = mapRef;
    if (!map) return;
    placePins.current.forEach((m) => m.remove());
    placePins.current = (me?.places ?? []).map((pl) =>
      new maplibregl.Marker({ element: createPlaceEl(pl.emoji, pl.name) }).setLngLat([pl.lng, pl.lat]).addTo(map),
    );
    syncData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.places]);

  // Minha posição
  useEffect(() => {
    const map = mapRef;
    if (!map || !myPos) return;
    if (!meMarker.current) meMarker.current = new maplibregl.Marker({ element: createMeEl() }).setLngLat([myPos.lng, myPos.lat]).addTo(map);
    else meMarker.current.setLngLat([myPos.lng, myPos.lat]);
    if (!fitted.current && !centered.current) {
      centered.current = true;
      map.jumpTo({ center: [myPos.lng, myPos.lat], zoom: 15 });
    }
  }, [myPos]);

  // Foco programático
  useEffect(() => {
    if (!focus || !mapRef) return;
    mapRef.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? Math.max(mapRef.getZoom(), 15),
      padding: { bottom: getState().tab !== 'map' ? 0 : getState().selected ? Math.min(window.innerHeight * 0.55, 470) : 230, top: 70, left: 0, right: 0 },
      duration: 900,
      essential: true,
    });
  }, [focus]);

  // Modo "escolher lugar": círculo segue o centro do mapa
  useEffect(() => {
    const map = mapRef;
    if (!map) return;
    if (!pick) {
      setData('pick', emptyFC());
      map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      return;
    }
    // O painel cobre a parte de baixo: o "centro" do mapa passa a ser o centro da área visível.
    map.setPadding({ top: 70, bottom: 330, left: 0, right: 0 });
    const draw = () => {
      const c = map.getCenter();
      setData('pick', { type: 'FeatureCollection', features: [circlePolygon(c.lat, c.lng, pick.radius)] });
    };
    draw();
    map.on('move', draw);
    return () => void map.off('move', draw);
  }, [pick]);

  useEffect(() => void mapRef?.resize(), [tab]);

  return (
    <div className="map-wrap">
      <div ref={box} className="map" />
      <button className="attr-btn" onClick={() => setAttr((a) => !a)} aria-label="Créditos do mapa">ⓘ</button>
      {attr && <div className="attr-pill" onClick={() => setAttr(false)}>© OpenStreetMap contributors · OpenFreeMap · MapLibre</div>}
      {pick && (
        <div className="crosshair" aria-hidden>
          <span>📍</span>
        </div>
      )}
    </div>
  );
}
