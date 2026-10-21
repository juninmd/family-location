import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Report } from '../lib/types';
import { batteryPct, ago, clock, compass, coords, dist, dms, haversine, kmh, statusOf } from '../lib/format';
import { copyText, haptic, platform, shareText } from '../lib/native';
import { flyTo, getState, select, setState, setTab, toast, useStore } from '../lib/store';
import type { Person } from '../lib/types';
import { mapApi } from '../map/MapView';
import { Avatar, BatteryChip } from './Avatar';
import { IBattery, IClock, ICompass, ICopy, IEdit, IFit, ILocate, IMountain, INav, IPlay, IPlus, IRoute, IShare, ISos, ISpeed, ITarget, ITrash } from './Icons';
import { Modal } from './Modal';

const NONE: never[] = [];

export function MapHeader() {
  const conn = useStore((s) => s.conn);
  const people = useStore((s) => s.me?.following ?? NONE);
  const live = people.filter((p) => p.pos && p.sharing && Date.now() - p.pos.ts < 180_000).length;
  return (
    <header className="map-head">
      <div className="brand-pill">
        <img src="/icon.svg" alt="" />
        <div>
          <b>Perto</b>
          <small className={`conn ${conn}`}>
            <i />
            {conn === 'online' ? (people.length ? `${live} de ${people.length} ao vivo` : 'conectado') : conn === 'connecting' ? 'conectando…' : 'sem conexão'}
          </small>
        </div>
      </div>
      <button className="icon-btn danger" onClick={() => setState({ sosOpen: true })} aria-label="SOS">
        <ISos />
      </button>
    </header>
  );
}

export function MapButtons() {
  const myPos = useStore((s) => s.myPos);
  const tracking = useStore((s) => s.tracking);
  return (
    <div className="map-btns">
      <button className="icon-btn glass" onClick={() => mapApi.fitAll()} aria-label="Ver todos"><IFit /></button>
      <button
        className="icon-btn glass"
        aria-label="Minha localização"
        onClick={() => (myPos ? flyTo(myPos.lat, myPos.lng, 16) : toast(tracking === 'denied' ? 'Permita a localização nas configurações.' : 'Obtendo sua posição…', 'err'))}
      >
        <ILocate />
      </button>
    </div>
  );
}

export function PeopleDock() {
  const people = useStore((s) => s.me?.following ?? NONE);
  const selected = useStore((s) => s.selected);
  const group = useStore((s) => s.group);
  const sel = people.find((p) => p.code === selected);
  if (sel) return <PersonSheet person={sel} />;
  const groups = [...new Set(people.map((p) => p.group).filter((g): g is string => !!g))];
  const shown = group && groups.includes(group) ? people.filter((p) => p.group === group) : people;
  return (
    <div className="dock">
      {groups.length > 0 && (
        <div className="chips group-chips">
          <button className={`chip-btn${!group ? ' on' : ''}`} onClick={() => setState({ group: null })}>Todos</button>
          {groups.map((g) => (
            <button key={g} className={`chip-btn${group === g ? ' on' : ''}`} onClick={() => setState({ group: g })}>{g}</button>
          ))}
        </div>
      )}
      <div className="dock-scroll">
        {shown.map((p) => (
          <PersonCard key={p.code} p={p} />
        ))}
        <button className="card add-card" onClick={() => setState({ addOpen: true })}>
          <span className="add-ico"><IPlus /></span>
          <b>{people.length ? 'Adicionar' : 'Adicionar pessoa'}</b>
          <small>Digite o código</small>
        </button>
      </div>
      {!people.length && (
        <p className="dock-empty">Peça o código ao seu familiar (Perfil → Seu código) e toque em <b>Adicionar</b>.</p>
      )}
    </div>
  );
}

function PersonCard({ p }: { p: Person }) {
  const st = statusOf(p);
  const myPos = useStore((s) => s.myPos);
  const d = p.pos && myPos ? dist(haversine(myPos, p.pos)) : null;
  return (
    <button className="card person-card" onClick={() => (void haptic('light'), select(p.code))} style={{ '--c': p.color } as React.CSSProperties}>
      <div className="pc-top">
        <Avatar emoji={p.emoji} color={p.color} size={42} dot={st.tone === 'move' ? 'move' : st.tone === 'live' ? 'live' : 'off'} />
        <BatteryChip level={p.pos?.battery ?? null} charging={!!p.pos?.charging} />
      </div>
      <b>{p.name}</b>
      <small className={`st ${st.tone}`}>{p.pending ? 'Aguardando aprovação' : (st.short ?? st.label)}</small>
      {p.expiresAt ? <small className="dim">⏳ até {new Date(p.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small> : d && <small className="dim">a {d} de você</small>}
    </button>
  );
}

function openRoute(p: Person) {
  if (!p.pos) return;
  const { lat, lng } = p.pos;
  const url =
    platform === 'ios'
      ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  window.open(url, '_blank');
}

const addrCache = new Map<string, string | null>();

function PersonSheet({ person: p }: { person: Person }) {
  const trailHours = useStore((s) => s.trailHours);
  const myPos = useStore((s) => s.myPos);
  const [address, setAddress] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const trail = useStore((s) => s.trails[p.code]);
  const replay = useStore((s) => s.replay);
  const [removing, setRemoving] = useState(false);
  const [now, setNow] = useState(Date.now());
  const st = statusOf(p, now);
  const pos = p.pos;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const key = pos ? `${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}` : '';
  useEffect(() => {
    if (!pos) return;
    if (addrCache.has(key)) return setAddress(addrCache.get(key) ?? null);
    const t = setTimeout(() => {
      api.geocode(pos.lat, pos.lng).then((r) => (addrCache.set(key, r.address), setAddress(r.address))).catch(() => setAddress(null));
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function toggleReport() {
    const open = !reportOpen;
    setReportOpen(open);
    if (open && !report) {
      try {
        setReport(await api.report(p.code, 24));
      } catch (e) {
        toast((e as Error).message, 'err');
      }
    }
  }

  // Reprodução do trajeto: avança o índice e o mapa mostra a posição naquele instante.
  useEffect(() => {
    if (!replay?.playing || replay.code !== p.code || !trail?.length) return;
    const step = Math.max(1, Math.round(trail.length / 150));
    const t = setInterval(() => {
      const r = getState().replay;
      if (!r?.playing) return;
      const next = r.idx + step;
      if (next >= trail.length - 1) setState({ replay: { ...r, idx: trail.length - 1, playing: false } });
      else setState({ replay: { ...r, idx: next } });
    }, 120);
    return () => clearInterval(t);
  }, [replay?.playing, replay?.code, p.code, trail?.length]);

  function toggleReplay() {
    if (!trail || trail.length < 2) return toast('Carregue um trajeto (1 h, 6 h ou 24 h) primeiro.');
    const r = getState().replay;
    if (r?.code === p.code && r.playing) return setState({ replay: { ...r, playing: false } });
    const idx = r?.code === p.code && r.idx < trail.length - 1 ? r.idx : 0;
    setState({ replay: { code: p.code, idx, playing: true } });
  }

  async function loadTrail(hours: number | null) {
    setState({ replay: null });
    if (hours == null || hours === trailHours) return setState({ trailHours: null });
    setState({ trailHours: hours });
    try {
      const pts = await api.history(p.code, hours);
      setState((s) => ({ trails: { ...s.trails, [p.code]: pts } }));
      if (pts.length < 2) toast('Ainda sem trajeto nesse período.');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  const stats = useMemo(() => {
    if (!pos) return [];
    const v = kmh(pos.speed);
    const bat = batteryPct(pos.battery);
    return [
      { icon: <ISpeed />, label: 'Velocidade', value: v == null ? '—' : `${Math.round(v)} km/h` },
      { icon: <IBattery />, label: 'Bateria', value: bat == null ? '—' : `${bat}%${pos.charging ? ' ⚡' : ''}`, tone: bat != null && bat <= 20 && !pos.charging ? 'bad' : '' },
      { icon: <ITarget />, label: 'Precisão GPS', value: pos.acc == null ? '—' : `±${Math.round(pos.acc)} m` },
      { icon: <IMountain />, label: 'Altitude', value: pos.alt == null ? '—' : `${Math.round(pos.alt)} m` },
      { icon: <ICompass />, label: 'Direção', value: pos.heading == null || (v ?? 0) < 1 ? '—' : `${compass(pos.heading)} ${Math.round(pos.heading)}°` },
      { icon: <IClock />, label: 'Atualizado', value: `${clock(pos.ts)} · ${ago(pos.ts, now)}` },
    ];
  }, [pos, now]);

  return (
    <div className="sheet" style={{ '--c': p.color } as React.CSSProperties}>
      <div className="sheet-grab" onClick={() => select(null)} />
      <div className="sheet-head">
        <Avatar emoji={p.emoji} color={p.color} size={54} ring dot={st.tone === 'move' ? 'move' : st.tone === 'live' ? 'live' : 'off'} />
        <div className="sheet-title">
          <h2>{p.name}</h2>
          <small className={`st ${st.tone}`}>{st.short ?? st.label}</small>
        </div>
        <button className="icon-btn sm" onClick={() => setRenaming(true)} aria-label="Ajustes da pessoa"><IEdit width={17} height={17} /></button>
        <button className="icon-btn sm danger-text" onClick={() => setRemoving(true)} aria-label="Remover"><ITrash width={17} height={17} /></button>
        <button className="icon-btn sm" onClick={() => select(null)} aria-label="Fechar">✕</button>
      </div>

      {p.pending ? (
        <p className="lead sm pad">Pedido enviado. {p.realName} precisa aceitar no Perfil para você ver a localização.</p>
      ) : pos ? (
        <>
          <div className="stats">
            {stats.map((s) => (
              <div key={s.label} className={`stat ${s.tone ?? ''}`}>
                <span className="stat-ico">{s.icon}</span>
                <small>{s.label}</small>
                <b>{s.value}</b>
              </div>
            ))}
          </div>

          <button className="coords" onClick={async () => toast((await copyText(coords(pos, 6))) ? 'Coordenadas copiadas' : 'Falha ao copiar')}>
            <div>
              <small>Coordenadas GPS</small>
              <b>{coords(pos, 6)}</b>
              <em>{dms(pos.lat, 'N', 'S')} · {dms(pos.lng, 'L', 'O')}</em>
            </div>
            <ICopy width={18} height={18} />
          </button>

          <p className="address">
            📍 {address ?? 'Buscando endereço…'}
            {myPos && <span> · a {dist(haversine(myPos, pos))} de você</span>}
          </p>

          <div className="seg-row">
            <span>Trajeto</span>
            <div className="seg">
              {[1, 6, 24].map((h) => (
                <button key={h} className={trailHours === h ? 'on' : ''} onClick={() => loadTrail(h)}>{h} h</button>
              ))}
              <button className={trailHours == null ? 'on' : ''} onClick={() => setState({ trailHours: null })}>Off</button>
            </div>
          </div>

          {trail && trail.length > 1 && trailHours != null && (
            <div className="replay">
              <button className="icon-btn sm" onClick={toggleReplay} aria-label="Reproduzir trajeto">
                {replay?.code === p.code && replay.playing ? '⏸' : <IPlay width={16} height={16} />}
              </button>
              <input
                type="range" min={0} max={trail.length - 1}
                value={replay?.code === p.code ? replay.idx : trail.length - 1}
                onChange={(e) => setState({ replay: { code: p.code, idx: +e.target.value, playing: false } })}
              />
              <small>{clock(trail[Math.min(trail.length - 1, replay?.code === p.code ? replay.idx : trail.length - 1)].ts)}</small>
            </div>
          )}

          <button className="report-toggle" onClick={toggleReport}>
            <span>📊 Resumo das últimas 24 h</span><span>{reportOpen ? '▴' : '▾'}</span>
          </button>
          {reportOpen && (
            <div className="report">
              {!report ? <small>Calculando…</small> : report.points < 2 ? <small>Ainda sem dados suficientes.</small> : (
                <>
                  <div><b>{report.distanceKm.toString().replace('.', ',')} km</b><small>percorridos</small></div>
                  <div><b>{report.maxKmh} km/h</b><small>máxima</small></div>
                  <div><b>{report.avgKmh} km/h</b><small>média em movimento</small></div>
                  <div><b>{report.movingMin} min</b><small>em movimento</small></div>
                  <div><b>{report.stops}</b><small>paradas (≥5 min)</small></div>
                  <div><b>{report.longestStopMin} min</b><small>maior parada</small></div>
                </>
              )}
            </div>
          )}

          <div className="actions">
            <button className="btn soft" onClick={() => openRoute(p)}><IRoute width={18} height={18} /> Rota até aqui</button>
            <button
              className="btn soft"
              onClick={() => shareText(`Localização de ${p.name}`, `${p.name} está aqui: https://www.google.com/maps?q=${pos.lat},${pos.lng}`)}
            >
              <IShare width={18} height={18} /> Enviar
            </button>
            <button className="btn soft" onClick={() => flyTo(pos.lat, pos.lng, 17)}><INav width={18} height={18} /> Centralizar</button>
          </div>
        </>
      ) : (
        <p className="lead sm pad">
          {p.sharing ? 'Ainda não recebemos a localização. Peça para abrir o Perto e permitir a localização.' : `${p.realName} pausou o compartilhamento. Você vê de novo quando for retomado.`}
        </p>
      )}

      {renaming && <PersonSettings person={p} onClose={() => setRenaming(false)} />}
      {removing && (
        <Modal title={`Parar de acompanhar ${p.name}?`} onClose={() => setRemoving(false)}>
          <div className="modal-body">
            <p className="lead sm">Você deixa de ver essa pessoa. Para ver de novo, vai precisar do código dela.</p>
            <button
              className="btn danger lg"
              onClick={async () => {
                try {
                  await api.unfollow(p.code);
                  select(null);
                  setState((s) => (s.me ? { me: { ...s.me, following: s.me.following.filter((x) => x.code !== p.code) } } : {}));
                  setRemoving(false);
                  toast('Pessoa removida');
                } catch (e) {
                  toast((e as Error).message, 'err');
                }
              }}
            >
              Remover
            </button>
            <button className="btn ghost" onClick={() => setRemoving(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const LIMITS = [null, 60, 80, 100, 120] as const;

function PersonSettings({ person, onClose }: { person: Person; onClose: () => void }) {
  const people = useStore((s) => s.me?.following ?? NONE);
  const [alias, setAlias] = useState(person.name);
  const [group, setGroup] = useState(person.group ?? '');
  const [limit, setLimit] = useState<number | null>(person.speedLimit ?? null);
  const groups = [...new Set(['Família', ...people.map((x) => x.group).filter((g): g is string => !!g)])];

  async function save() {
    try {
      const name = alias.trim();
      if (name !== person.name) await api.rename(person.code, name === person.realName ? '' : name);
      await api.followMeta(person.code, { group: group.trim() || null, speedLimit: limit });
      setState((s) =>
        s.me
          ? { me: { ...s.me, following: s.me.following.map((x) => (x.code === person.code ? { ...x, name: name || x.realName, group: group.trim() || null, speedLimit: limit } : x)) } }
          : {},
      );
      onClose();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  return (
    <Modal title="Ajustes" onClose={onClose}>
      <div className="modal-body">
        <label className="field">
          <span>Apelido para {person.realName}</span>
          <input value={alias} maxLength={24} onChange={(e) => setAlias(e.target.value)} />
        </label>
        <div className="field">
          <span>Grupo</span>
          <div className="chips wrap">
            <button className={`chip-btn${!group ? ' on' : ''}`} onClick={() => setGroup('')}>Nenhum</button>
            {groups.map((g) => (
              <button key={g} className={`chip-btn${group === g ? ' on' : ''}`} onClick={() => setGroup(g)}>{g}</button>
            ))}
          </div>
          <input value={group} maxLength={20} placeholder="Ou crie um grupo (ex.: Amigos)" onChange={(e) => setGroup(e.target.value)} />
        </div>
        <div className="field">
          <span>Avisar se passar de…</span>
          <div className="chips wrap">
            {LIMITS.map((l) => (
              <button key={String(l)} className={`chip-btn${limit === l ? ' on' : ''}`} onClick={() => setLimit(l)}>{l ? `${l} km/h` : 'Desligado'}</button>
            ))}
          </div>
        </div>
        <button className="btn primary lg" onClick={save}>Salvar</button>
      </div>
    </Modal>
  );
}

const PRESETS = [
  { emoji: '🏠', name: 'Casa' },
  { emoji: '🏫', name: 'Escola' },
  { emoji: '💼', name: 'Trabalho' },
  { emoji: '⛪', name: 'Igreja' },
  { emoji: '🏋️', name: 'Academia' },
  { emoji: '👵', name: 'Vó' },
];

/** Painel mostrado sobre o mapa enquanto o usuário escolhe a posição de um novo lugar. */
export function PlaceComposer() {
  const pick = useStore((s) => s.pickPlace)!;
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<typeof pick>) => setState({ pickPlace: { ...pick, ...p } });
  const cancel = () => (setState({ pickPlace: null }), setTab('places'));

  async function save() {
    const c = mapApi.center();
    if (!c) return;
    setBusy(true);
    try {
      const place = await api.addPlace({ name: pick.name.trim() || 'Lugar', emoji: pick.emoji, lat: c.lat, lng: c.lng, radius: pick.radius });
      setState((s) => ({ me: s.me ? { ...s.me, places: [...s.me.places, place] } : s.me, pickPlace: null }));
      void haptic('success');
      toast(`${place.emoji} ${place.name} salvo! Você será avisado quando alguém chegar ou sair.`);
      setTab('places');
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet composer">
      <div className="sheet-head">
        <div className="sheet-title">
          <h2>Novo lugar</h2>
          <small>Mova o mapa até o ponto desejado</small>
        </div>
        <button className="icon-btn sm" onClick={cancel} aria-label="Cancelar">✕</button>
      </div>
      <div className="chips">
        {PRESETS.map((p) => (
          <button key={p.name} className={`chip-btn${pick.name === p.name ? ' on' : ''}`} onClick={() => patch({ ...p })}>{p.emoji} {p.name}</button>
        ))}
      </div>
      <label className="field inline">
        <span>{pick.emoji}</span>
        <input value={pick.name} maxLength={24} placeholder="Nome do lugar" onChange={(e) => patch({ name: e.target.value })} />
      </label>
      <label className="range">
        <span>Raio <b>{pick.radius} m</b></span>
        <input type="range" min={50} max={1000} step={25} value={pick.radius} onChange={(e) => patch({ radius: +e.target.value })} />
      </label>
      <div className="row gap">
        <button className="btn ghost" onClick={cancel}>Cancelar</button>
        <button className="btn primary grow" onClick={save} disabled={busy}>Salvar lugar aqui</button>
      </div>
    </div>
  );
}
