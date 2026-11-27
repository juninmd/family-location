import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Skeleton, Spinner } from '@juninmd/sonido';
import { api } from '../lib/api';
import { haptic } from '../lib/native';
import { select, toast, upsertPerson } from '../lib/store';
import type { NearbyPeer } from '../lib/types';
import { Avatar } from './Avatar';

/**
 * Descoberta no mesmo Wi-Fi. Os dois lados precisam estar nesta tela (opt-in), ninguém vê
 * código de ninguém e o pedido sempre passa pela aprovação de quem é encontrado.
 */
export function Nearby({ onDone }: { onDone: () => void }) {
  const [peers, setPeers] = useState<NearbyPeer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const alive = useRef(true);

  const poll = useCallback(async () => {
    try {
      const list = await api.nearby(true);
      if (alive.current) setPeers(list);
    } catch {
      if (alive.current) setPeers([]);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void poll();
    const t = setInterval(poll, 5000);
    window.addEventListener('perto:nearby', poll);
    return () => {
      alive.current = false;
      clearInterval(t);
      window.removeEventListener('perto:nearby', poll);
      void api.stopNearby().catch(() => {});
    };
  }, [poll]);

  async function request(p: NearbyPeer) {
    setBusy(p.ref);
    try {
      const person = await api.requestNearby(p.ref);
      upsertPerson(person);
      void haptic('success');
      toast(person.pending ? `Pedido enviado a ${person.name}. Peça para aprovar no Perfil.` : `${person.name} adicionado(a)!`);
      if (!person.pending) {
        onDone();
        select(person.code);
      } else void poll();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="nearby">
      <div className="radar" aria-hidden><i /><i /><i /><span>📡</span></div>
      <p className="lead sm center-text">
        Pedimos para <b>quem estiver no mesmo Wi-Fi com esta tela aberta</b> aparecer aqui. Você só fica visível enquanto ela estiver aberta.
      </p>
      {peers === null && (
        <div className="nearby-loading">
          <p className="hint row gap center"><Spinner size={16} label="Procurando pessoas" /> Procurando pessoas no mesmo Wi-Fi…</p>
          <Skeleton rows={3} media label="Carregando pessoas próximas" />
        </div>
      )}
      {peers && !peers.length && <p className="hint">Ninguém por perto ainda. Peça para a outra pessoa abrir <b>Adicionar → Wi-Fi próximo</b> neste mesmo Wi-Fi.</p>}
      <ul className="list">
        {(peers ?? []).map((p) => (
          <li key={p.ref} className="list-item">
            <Avatar emoji={p.emoji} color={p.color} name={p.name} size={44} />
            <div>
              <b>{p.name}</b>
              <Badge tone="success" dot appearance="soft">no seu Wi-Fi</Badge>
            </div>
            <Button variant="primary" size="sm" loading={busy === p.ref} disabled={p.requested} onClick={() => request(p)}>
              {p.requested ? 'Aguardando…' : 'Pedir para ver'}
            </Button>
          </li>
        ))}
      </ul>
      <p className="hint">Use apenas em redes de confiança (casa). Em Wi-Fi público ou rede móvel, outras pessoas podem aparecer — e ninguém é adicionado sem aprovar.</p>
    </div>
  );
}
