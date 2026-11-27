import { useState } from 'react';
import { Button, Card, ConfirmButton, EmptyState, PageHeader, Switch, Tabs, TextField } from '@juninmd/sonido';
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
const EVENT_ICON: Record<string, string> = { sos: '🆘', arrive: '🏠', leave: '🚶', checkin: '✅', lowbat: '🪫', speed: '💨', request: '👋', approved: '✅' };
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function Activity() {
  const events = useStore((s) => s.events);
  const groups: Record<string, typeof events> = {};
  for (const e of events) (groups[dayLabel(e.ts)] ??= []).push(e);
  return (
    <div className="page">
      <PageHeader title="Atividade" titleAs="h1" />
      {!events.length ? (
        <EmptyState
          titleAs="h2"
          icon={<IBell width={34} height={34} />}
          title="Tudo tranquilo por aqui"
          description="Chegadas, saídas dos seus lugares, check-ins e alertas SOS da família aparecem aqui."
        />
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
                  <Avatar emoji={e.who.emoji} color={e.who.color} name={e.who.name} size={40} />
                  <div>
                    <b>{e.text}</b>
                    <small>{hhmm(e.ts)} · {ago(e.ts)}</small>
                  </div>
                  <span className="feed-ico">{EVENT_ICON[e.type] ?? '•'}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function Places() {
  const places = useStore((s) => s.me?.places ?? NONE);
  const myPos = useStore((s) => s.myPos);
  return (
    <div className="page">
      <PageHeader title="Lugares" titleAs="h1" />
      <p className="lead sm">Receba um aviso quando alguém da família <b>chegar</b> ou <b>sair</b> de um lugar importante.</p>
      {!places.length ? (
        <EmptyState
          titleAs="h2"
          icon={<IPin width={34} height={34} />}
          title="Nenhum lugar ainda"
          description="Cadastre Casa, Escola, Trabalho… e acompanhe as chegadas em tempo real."
        />
      ) : (
        <ul className="list">
          {places.map((p) => (
            <li key={p.id} className="list-item">
              <span className="place-emoji">{p.emoji}</span>
              <div onClick={() => (setTab('map'), flyTo(p.lat, p.lng, 16))}>
                <b>{p.name}</b>
                <small>raio de {p.radius} m{myPos ? ` · a ${dist(haversine(myPos, p))} de você` : ''}</small>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="icon-sm danger-text"
                aria-label="Excluir"
                onClick={async () => {
                  await api.removePlace(p.id).catch(() => {});
                  setState((s) => (s.me ? { me: { ...s.me, places: s.me.places.filter((x) => x.id !== p.id) } } : {}));
                }}
              >
                <ITrash width={18} height={18} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="primary"
        size="lg"
        onClick={() => {
          setState({ pickPlace: { name: 'Casa', emoji: '🏠', radius: 150 }, selected: null });
          setTab('map');
          if (myPos) flyTo(myPos.lat, myPos.lng, 16);
        }}
      >
        <IPlus width={20} height={20} /> Novo lugar
      </Button>
    </div>
  );
}

export function Profile() {
  const me = useStore((s) => s.me);
  const theme = useStore((s) => s.theme);
  const tracking = useStore((s) => s.tracking);
  const [edit, setEdit] = useState(false);
  const [rotate, setRotate] = useState(false);
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
      <PageHeader title="Perfil" titleAs="h1" />

      <section className="hero-card">
        <div className="hero-top">
          <Avatar emoji={me.emoji} color={me.color} name={me.name} size={64} ring />
          <div>
            <h2>{me.name}</h2>
            <small>{me.sharing ? 'Compartilhando ao vivo' : 'Compartilhamento pausado'}</small>
          </div>
          <Button variant="secondary" size="icon" className="icon-glass" onClick={() => setEdit(true)} aria-label="Editar"><span>✏️</span></Button>
        </div>
        <div className="code-card">
          <small>Seu código de pareamento</small>
          <b>{me.code}</b>
          <div className="row gap center">
            <Button variant="secondary" size="sm" className="glass-btn" onClick={async () => toast((await copyText(me.code)) ? 'Código copiado' : 'Falha ao copiar')}><ICopy width={18} height={18} /> Copiar</Button>
            <Button variant="secondary" size="sm" className="glass-btn" onClick={() => shareInvite(me.code, me.name)}><IShare width={18} height={18} /> Enviar</Button>
            <Button variant="secondary" size="sm" className="glass-btn" onClick={() => setQr(true)}>QR</Button>
          </div>
        </div>
      </section>

      {me.requests.length > 0 && (
        <>
          <h4 className="group">Pedidos para acompanhar você ({me.requests.length})</h4>
          <Card surface="solid" padding="none" className="group-card req">
            {me.requests.map((r) => (
              <div key={r.id} className="row-item">
                <Avatar emoji={r.emoji} color={r.color} name={r.name} size={40} />
                <div className="grow"><b>{r.name}</b><small>quer ver sua localização</small></div>
                <Button variant="ghost" size="sm" onClick={() => answer(r.id, false)}>Recusar</Button>
                <Button variant="primary" size="sm" onClick={() => answer(r.id, true)}>Aceitar</Button>
              </div>
            ))}
          </Card>
        </>
      )}

      <Card surface="solid" padding="none" className="group-card">
        <div className="row-item">
          <span className="row-ico">{me.sharing ? <IEye /> : <IEyeOff />}</span>
          <Switch
            className="row-switch"
            checked={me.sharing}
            onChange={setSharing}
            label="Compartilhar minha localização"
            description={me.sharing ? 'A família vê você em tempo real' : 'Ninguém vê onde você está'}
          />
        </div>
        {tracking === 'denied' && (
          <div className="warn-box">
            <b>Permissão de localização negada.</b> Ative a localização do Perto nas configurações do sistema.
            <Button variant="secondary" onClick={openLocationSettings}>Abrir configurações</Button>
          </div>
        )}
      </Card>

      <h4 className="group">Quem me vê ({me.watchers.length})</h4>
      <Card surface="solid" padding="none" className="group-card">
        {!me.watchers.length && <p className="muted pad">Ninguém acompanha você ainda. Envie seu código para a família.</p>}
        {me.watchers.map((w) => (
          <div key={w.id} className="row-item">
            <Avatar emoji={w.emoji} color={w.color} name={w.name} size={38} />
            <div className="grow"><b>{w.name}</b><small>{w.expiresAt ? `até ${new Date(w.expiresAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : `desde ${new Date(w.since).toLocaleDateString('pt-BR')}`}</small></div>
            <ConfirmButton
              appearance="inline"
              variant="ghost"
              size="sm"
              className="danger-text"
              ask={`${w.name} não vê mais você?`}
              confirmLabel="Remover"
              onConfirm={async () => {
                await api.removeWatcher(w.id).catch(() => {});
                setState((s) => (s.me ? { me: { ...s.me, watchers: s.me.watchers.filter((x) => x.id !== w.id) } } : {}));
                toast(`${w.name} não vê mais você`);
              }}
            >
              Remover
            </ConfirmButton>
          </div>
        ))}
      </Card>

      <h4 className="group">Privacidade</h4>
      <Card surface="solid" padding="none" className="group-card">
        <div className="row-item">
          <span className="row-ico"><IShield /></span>
          <Switch
            className="row-switch"
            checked={me.approval}
            onChange={async (approval) => setState({ me: await api.updateMe({ approval }) })}
            label="Aprovar quem quer me ver"
            description={me.approval ? 'Novos acompanhantes precisam da sua aprovação' : 'Quem tem seu código vê você na hora'}
          />
        </div>
        <div className="row-item col">
          <div><b>Códigos extras</b><small>Temporários expiram sozinhos (viagem, encontro). Permanentes valem até você revogar — e revogar também remove quem entrou por eles.</small></div>
          <TextField
            label="Nome do código (opcional)"
            hideLabel
            compact
            value={inviteLabel}
            maxLength={24}
            placeholder="Nome do código (opcional): Vó, Escola…"
            onChange={(e) => setInviteLabel(e.target.value)}
          />
          <div className="row gap wrap">
            {[1, 8, 24].map((h) => (
              <Button key={h} variant="secondary" size="sm" onClick={() => createInvite(h)}>{h} h</Button>
            ))}
            <Button variant="primary" size="sm" onClick={() => createInvite(null)}>Permanente</Button>
          </div>
        </div>
        {me.invites.map((i) => (
          <div key={i.code} className="row-item">
            <div className="grow"><b className="mono">{i.code}</b><small>{i.label ? `${i.label} · ` : ''}{i.expiresAt ? `expira ${new Date(i.expiresAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'permanente'}</small></div>
            <Button variant="ghost" size="sm" onClick={() => setInvite(i)}>Ver</Button>
            <ConfirmButton
              appearance="inline"
              variant="ghost"
              size="sm"
              className="danger-text"
              ask={`Revogar ${i.code}?`}
              confirmLabel="Revogar"
              onConfirm={async () => { await api.revokeInvite(i.code).catch(() => {}); setState({ me: await api.me() }); }}
            >
              Revogar
            </ConfirmButton>
          </div>
        ))}
      </Card>

      <h4 className="group">Preferências</h4>
      <Card surface="solid" padding="none" className="group-card">
        <div className="row-item">
          <div className="grow"><b>Tema</b></div>
          <Tabs
            items={[
              { key: 'auto', label: 'Auto' },
              { key: 'light', label: 'Claro' },
              { key: 'dark', label: 'Escuro' },
            ]}
            value={theme}
            onChange={(t) => setTheme(t as Theme)}
            label="Tema"
            variant="pill"
          />
        </div>
        <Row icon={<IRefresh />} title="Trocar meu código" sub="Remove todos que me acompanham" onClick={() => setRotate(true)} />
        <Row icon={<IShield />} title="Privacidade" sub="Só quem tem seu código vê sua posição. Histórico de 72 h." />
      </Card>

      <details className="group-card adv">
        <summary>Avançado</summary>
        <TextField
          label="Servidor"
          value={server}
          onChange={(e) => setSrv(e.target.value)}
          autoCapitalize="none"
          spellCheck={false}
        />
        <div className="row gap">
          <Button
            variant="secondary"
            onClick={() => {
              setServer(server);
              toast('Servidor salvo. Reiniciando.');
              setTimeout(() => location.reload(), 600);
            }}
          >
            Salvar
          </Button>
          <Button variant="ghost" onClick={() => (setSrv(defaultServer()), setServer(''))}>Padrão</Button>
        </div>
        <ConfirmButton
          appearance="inline"
          variant="ghost"
          className="danger-text"
          ask="Apagar sua conta, histórico e lugares? Não dá para desfazer."
          confirmLabel="Apagar tudo"
          onConfirm={async () => {
            await api.deleteMe().catch(() => {});
            await stopTracking();
            stopRealtime();
            kv.del('creds');
            location.reload();
          }}
        >
          Apagar minha conta e dados
        </ConfirmButton>
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
              <Button variant="secondary" onClick={async () => toast((await copyText(invite.code)) ? 'Código copiado' : 'Falha ao copiar')}><ICopy width={18} height={18} /> Copiar</Button>
              <Button variant="secondary" onClick={() => shareText('Perto', `${me.name} compartilhou a localização com você no Perto${invite.expiresAt ? ' por tempo limitado' : ''}. Código: ${invite.code}`)}><IShare width={18} height={18} /> Enviar</Button>
            </div>
          </div>
        </Modal>
      )}
      {edit && <EditProfile onClose={() => setEdit(false)} />}
      {rotate && (
        <Modal title="Trocar meu código?" onClose={() => setRotate(false)} tone="danger">
          <div className="modal-body">
            <p className="lead sm">Um novo código é gerado e <b>todas as pessoas que acompanham você deixam de ver</b> sua localização.</p>
            <Button
              variant="danger"
              size="lg"
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
            </Button>
            <Button variant="ghost" onClick={() => setRotate(false)}>Cancelar</Button>
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

function EditProfile({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me)!;
  const [name, setName] = useState(me.name);
  const [emoji, setEmoji] = useState(me.emoji);
  const [color, setColor] = useState(me.color);
  return (
    <Modal title="Editar perfil" onClose={onClose}>
      <div className="modal-body">
        <div className="onb-avatar"><Avatar emoji={emoji} color={color} name={name} size={80} ring /></div>
        <TextField label="Nome" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        <div className="pick-row">{EMOJIS.map((e) => <button key={e} className={`pick${e === emoji ? ' on' : ''}`} onClick={() => setEmoji(e)}>{e}</button>)}</div>
        <div className="pick-row colors">{COLORS.map((c) => <button key={c} className={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div>
        <Button
          variant="primary"
          size="lg"
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
        </Button>
      </div>
    </Modal>
  );
}
