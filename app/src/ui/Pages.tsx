import { useState } from 'react';
import { api } from '../lib/api';
import { getServer, setServer, defaultServer } from '../lib/config';
import { ago, dist, haversine } from '../lib/format';
import { copyText, haptic, kv, shareText } from '../lib/native';
import type { Invite } from '../lib/types';
import { stopRealtime } from '../lib/socket';
import { flyTo, select, setState, setTab, setTheme, toast, useStore, type Theme } from '../lib/store';
import { openLocationSettings, startTracking, stopTracking } from '../lib/tracker';
import { Avatar } from './Avatar';
import { COLORS, EMOJIS } from './Onboarding';
import { shareInvite } from './AddPerson';
import { IBell, ICopy, IEye, IEyeOff, IPin, IPlus, IRefresh, IShare, ITrash, IShield } from './Icons';
import { Modal } from './Modal';
import { QrCode, qrPayload } from './Qr';

const NONE: never[] = [];

const dayLabel = (ts: number) => {
  const d = new Date(ts);
  const t = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === t.toDateString()) return 'Hoje';
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
};
const EVENT_ICON: Record<string, string> = { sos: '🚨', arrive: '📥', leave: '📤', checkin: '✅', lowbat: '🔋', speed: '🚗', request: '🙋', approved: '✅' };
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function Activity() {
  const events = useStore((s) => s.events);
  const groups: Record<string, typeof events> = {};
  for (const e of events) (groups[dayLabel(e.ts)] ??= []).push(e);
  return (
    <div className="page">
      <h1 className="page-title">Atividade</h1>
      {!events.length ? (
        <Empty icon={<IBell width={34} height={34} />} title="Tudo tranquilo por aqui" text="Chegadas, saídas dos seus lugares, check-ins e alertas SOS da família aparecem aqui." />
      ) : (
        Object.entries(groups).map(([day, list]) => (
          <section key={day}>
            <h4 className="group">{day}</h4>
            <ul className="feed">
              {list.map((e, i) => (
                <li
                  key={(e.id ?? e.ts) + '-' + i}
                  className={`feed-item ${e.type}`}
                  onClick={() => {
                    if (e.type === 'request') return setTab('profile');
                    if (e.lat != null && e.lng != null) {
                      setTab('map');
                      select(e.who.code);
                      flyTo(e.lat, e.lng, 16);
                    }
                  }}
                >
                  <Avatar emoji={e.who.emoji} color={e.who.color} size={40} />
                  <div>
                    <b>{e.text}</b>
                    <small>{hhmm(e.ts)} · {ago(e.ts)}</small>
                  </div>
                  <span className="feed-ico">{EVENT_ICON[e.type] ?? '✅'}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function Places() {
  const places = useStore((s) => s.me?.places ?? NONE);
  const myPos = useStore((s) => s.myPos);
  return (
    <div className="page">
      <h1 className="page-title">Lugares</h1>
      <p className="lead sm">Receba um aviso quando alguém da família <b>chegar</b> ou <b>sair</b> de um lugar importante.</p>
      {!places.length ? (
        <Empty icon={<IPin width={34} height={34} />} title="Nenhum lugar ainda" text="Cadastre Casa, Escola, Trabalho… e acompanhe as chegadas em tempo real." />
      ) : (
        <ul className="list">
          {places.map((p) => (
            <li key={p.id} className="list-item">
              <span className="place-emoji">{p.emoji}</span>
              <div onClick={() => (setTab('map'), flyTo(p.lat, p.lng, 16))}>
                <b>{p.name}</b>
                <small>raio de {p.radius} m{myPos ? ` · a ${dist(haversine(myPos, p))} de você` : ''}</small>
              </div>
              <button
                className="icon-btn sm"
                aria-label="Excluir"
                onClick={async () => {
                  await api.removePlace(p.id).catch(() => {});
                  setState((s) => (s.me ? { me: { ...s.me, places: s.me.places.filter((x) => x.id !== p.id) } } : {}));
                }}
              >
                <ITrash width={18} height={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        className="btn primary lg"
        onClick={() => {
          setState({ pickPlace: { name: 'Casa', emoji: '🏠', radius: 150 }, selected: null });
          setTab('map');
          if (myPos) flyTo(myPos.lat, myPos.lng, 16);
        }}
      >
        <IPlus width={20} height={20} /> Novo lugar
      </button>
    </div>
  );
}

export function Profile() {
  const me = useStore((s) => s.me);
  const theme = useStore((s) => s.theme);
  const tracking = useStore((s) => s.tracking);
  const [edit, setEdit] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [qr, setQr] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteLabel, setInviteLabel] = useState('');
  const [server, setSrv] = useState(getServer());
  if (!me) return null;

  const setSharing = async (sharing: boolean) => {
    try {
      setState({ me: await api.updateMe({ sharing }) });
      if (sharing) await startTracking();
      void haptic('light');
      toast(sharing ? 'Compartilhando sua localização' : 'Compartilhamento pausado');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const answer = async (id: string, accept: boolean) => {
    try {
      await api.answerRequest(id, accept);
      setState({ me: await api.me() });
      toast(accept ? 'Pedido aceito' : 'Pedido recusado');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };
  const createInvite = async (hours: number | null) => {
    try {
      const inv = await api.createInvite({ ...(hours == null ? { permanent: true } : { hours }), label: inviteLabel.trim() || undefined });
      setInvite(inv);
      setInviteLabel('');
      setState({ me: await api.me() });
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Perfil</h1>

      <section className="hero-card">
        <div className="hero-top">
          <Avatar emoji={me.emoji} color={me.color} size={64} ring />
          <div>
            <h2>{me.name}</h2>
            <small>{me.sharing ? 'Compartilhando ao vivo' : 'Compartilhamento pausado'}</small>
          </div>
          <button className="icon-btn sm glass" onClick={() => setEdit(true)} aria-label="Editar"><span>✏️</span></button>
        </div>
        <div className="code-card">
          <small>Seu código de pareamento</small>
          <b>{me.code}</b>
          <div className="row gap center">
            <button className="btn glass-btn" onClick={async () => toast((await copyText(me.code)) ? 'Código copiado' : 'Falha ao copiar')}><ICopy width={18} height={18} /> Copiar</button>
            <button className="btn glass-btn" onClick={() => shareInvite(me.code, me.name)}><IShare width={18} height={18} /> Enviar</button>
            <button className="btn glass-btn" onClick={() => setQr(true)}>QR</button>
          </div>
        </div>
      </section>

      {me.requests.length > 0 && (
        <>
          <h4 className="group">Pedidos para acompanhar você ({me.requests.length})</h4>
          <section className="group-card req">
            {me.requests.map((r) => (
              <div key={r.id} className="row-item">
                <Avatar emoji={r.emoji} color={r.color} size={40} />
                <div className="grow"><b>{r.name}</b><small>quer ver sua localização</small></div>
                <button className="btn ghost sm" onClick={() => answer(r.id, false)}>Recusar</button>
                <button className="btn primary sm" onClick={() => answer(r.id, true)}>Aceitar</button>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="group-card">
        <Row
          icon={me.sharing ? <IEye /> : <IEyeOff />}
          title="Compartilhar minha localização"
          sub={me.sharing ? 'A família vê você em tempo real' : 'Ninguém vê onde você está'}
          right={<Switch on={me.sharing} onChange={setSharing} />}
        />
        {tracking === 'denied' && (
          <div className="warn-box">
            <b>Permissão de localização negada.</b> Ative a localização do Perto nas configurações do sistema.
            <button className="btn soft" onClick={openLocationSettings}>Abrir configurações</button>
          </div>
        )}
      </section>

      <h4 className="group">Quem me vê ({me.watchers.length})</h4>
      <section className="group-card">
        {!me.watchers.length && <p className="muted pad">Ninguém acompanha você ainda. Envie seu código para a família.</p>}
        {me.watchers.map((w) => (
          <div key={w.id} className="row-item">
            <Avatar emoji={w.emoji} color={w.color} size={38} />
            <div className="grow"><b>{w.name}</b><small>{w.expiresAt ? `até ${new Date(w.expiresAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : `desde ${new Date(w.since).toLocaleDateString('pt-BR')}`}</small></div>
            <button
              className="btn ghost sm danger-text"
              onClick={async () => {
                await api.removeWatcher(w.id).catch(() => {});
                setState((s) => (s.me ? { me: { ...s.me, watchers: s.me.watchers.filter((x) => x.id !== w.id) } } : {}));
                toast(`${w.name} não vê mais você`);
              }}
            >
              Remover
            </button>
          </div>
        ))}
      </section>

      <h4 className="group">Privacidade</h4>
      <section className="group-card">
        <Row
          icon={<IShield />}
          title="Aprovar quem quer me ver"
          sub={me.approval ? 'Novos acompanhantes precisam da sua aprovação' : 'Quem tem seu código vê você na hora'}
          right={<Switch on={me.approval} onChange={async (approval) => setState({ me: await api.updateMe({ approval }) })} />}
        />
        <div className="row-item col">
          <div><b>Códigos extras</b><small>Temporários expiram sozinhos (viagem, encontro). Permanentes valem até você revogar — e revogar também remove quem entrou por eles.</small></div>
          <input className="mini-input" value={inviteLabel} maxLength={24} placeholder="Nome do código (opcional): Vó, Escola…" onChange={(e) => setInviteLabel(e.target.value)} />
          <div className="seg wide">
            {[1, 8, 24].map((h) => (
              <button key={h} onClick={() => createInvite(h)}>{h} h</button>
            ))}
            <button className="perm" onClick={() => createInvite(null)}>Permanente</button>
          </div>
        </div>
        {me.invites.map((i) => (
          <div key={i.code} className="row-item">
            <div className="grow"><b className="mono">{i.code}</b><small>{i.label ? `${i.label} · ` : ''}{i.expiresAt ? `expira ${new Date(i.expiresAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'permanente'}</small></div>
            <button className="btn ghost sm" onClick={() => setInvite(i)}>Ver</button>
            <button className="btn ghost sm danger-text" onClick={async () => { await api.revokeInvite(i.code).catch(() => {}); setState({ me: await api.me() }); }}>Revogar</button>
          </div>
        ))}
      </section>

      <h4 className="group">Preferências</h4>
      <section className="group-card">
        <div className="row-item">
          <div className="grow"><b>Tema</b></div>
          <div className="seg">
            {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
              <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>{t === 'auto' ? 'Auto' : t === 'light' ? 'Claro' : 'Escuro'}</button>
            ))}
          </div>
        </div>
        <Row icon={<IRefresh />} title="Trocar meu código" sub="Remove todos que me acompanham" onClick={() => setRotate(true)} />
        <Row icon={<IShield />} title="Privacidade" sub="Só quem tem seu código vê sua posição. Histórico de 72 h." />
      </section>

      <details className="group-card adv">
        <summary>Avançado</summary>
        <label className="field">
          <span>Servidor</span>
          <input value={server} onChange={(e) => setSrv(e.target.value)} autoCapitalize="none" spellCheck={false} />
        </label>
        <div className="row gap">
          <button
            className="btn soft"
            onClick={() => {
              setServer(server);
              toast('Servidor salvo. Reiniciando…');
              setTimeout(() => location.reload(), 600);
            }}
          >
            Salvar
          </button>
          <button className="btn ghost" onClick={() => (setSrv(defaultServer()), setServer(''))}>Padrão</button>
        </div>
        <button className="btn ghost danger-text" onClick={() => setWipe(true)}>Apagar minha conta e dados</button>
        <p className="muted tiny">
          Mapa © OpenStreetMap contributors · OpenFreeMap · MapLibre. Perto v1.0 — código aberto em github.com/juninmd/family-location
        </p>
      </details>

      {qr && (
        <Modal title="Meu QR Code" onClose={() => setQr(false)}>
          <div className="modal-body center-col">
            <QrCode text={qrPayload(me.code)} size={240} />
            <b className="mono big">{me.code}</b>
            <p className="hint">Peça para a outra pessoa tocar em <b>Adicionar → Escanear QR Code</b>.</p>
          </div>
        </Modal>
      )}
      {invite && (
        <Modal title={invite.expiresAt ? 'Código temporário' : 'Código permanente'} onClose={() => setInvite(null)}>
          <div className="modal-body center-col">
            <QrCode text={qrPayload(invite.code)} size={220} />
            <b className="mono big">{invite.code}</b>
            <p className="hint">
              {invite.expiresAt
                ? `Quem usar este código vê você até ${new Date(invite.expiresAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Depois o acesso termina sozinho.`
                : 'Código permanente: vale até você revogá-lo em Perfil → Privacidade (isso também remove quem entrou por ele).'}
            </p>
            <div className="row gap center">
              <button className="btn soft" onClick={async () => toast((await copyText(invite.code)) ? 'Código copiado' : 'Falha ao copiar')}><ICopy width={18} height={18} /> Copiar</button>
              <button className="btn soft" onClick={() => shareText('Perto', `${me.name} compartilhou a localização com você no Perto${invite.expiresAt ? ' por tempo limitado' : ''}. Código: ${invite.code}`)}><IShare width={18} height={18} /> Enviar</button>
            </div>
          </div>
        </Modal>
      )}
      {edit && <EditProfile onClose={() => setEdit(false)} />}
      {rotate && (
        <Modal title="Trocar meu código?" onClose={() => setRotate(false)} tone="danger">
          <div className="modal-body">
            <p className="lead sm">Um novo código é gerado e <b>todas as pessoas que acompanham você deixam de ver</b> sua localização.</p>
            <button
              className="btn danger lg"
              onClick={async () => {
                try {
                  setState({ me: await api.rotateCode() });
                  setRotate(false);
                  toast('Novo código gerado');
                } catch (e) {
                  toast((e as Error).message, 'err');
                }
              }}
            >
              Gerar novo código
            </button>
            <button className="btn ghost" onClick={() => setRotate(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
      {wipe && (
        <Modal title="Apagar tudo?" onClose={() => setWipe(false)} tone="danger">
          <div className="modal-body">
            <p className="lead sm">Seu código, histórico, lugares e vínculos são apagados do servidor. Não dá para desfazer.</p>
            <button
              className="btn danger lg"
              onClick={async () => {
                await api.deleteMe().catch(() => {});
                await stopTracking();
                stopRealtime();
                kv.del('creds');
                location.reload();
              }}
            >
              Apagar definitivamente
            </button>
            <button className="btn ghost" onClick={() => setWipe(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ icon, title, sub, right, onClick }: { icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; onClick?: () => void }) {
  return (
    <div className={`row-item${onClick ? ' tap' : ''}`} onClick={onClick}>
      <span className="row-ico">{icon}</span>
      <div className="grow"><b>{title}</b>{sub && <small>{sub}</small>}</div>
      {right}
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function EditProfile({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me)!;
  const [name, setName] = useState(me.name);
  const [emoji, setEmoji] = useState(me.emoji);
  const [color, setColor] = useState(me.color);
  return (
    <Modal title="Editar perfil" onClose={onClose}>
      <div className="modal-body">
        <div className="onb-avatar"><Avatar emoji={emoji} color={color} size={80} ring /></div>
        <label className="field"><span>Nome</span><input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} /></label>
        <div className="pick-row">{EMOJIS.map((e) => <button key={e} className={`pick${e === emoji ? ' on' : ''}`} onClick={() => setEmoji(e)}>{e}</button>)}</div>
        <div className="pick-row colors">{COLORS.map((c) => <button key={c} className={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div>
        <button
          className="btn primary lg"
          onClick={async () => {
            try {
              setState({ me: await api.updateMe({ name: name.trim() || me.name, emoji, color }) });
              onClose();
            } catch (e) {
              toast((e as Error).message, 'err');
            }
          }}
        >
          Salvar
        </button>
      </div>
    </Modal>
  );
}
