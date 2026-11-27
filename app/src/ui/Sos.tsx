import { useState } from 'react';
import { Button } from '@juninmd/sonido';
import { api } from '../lib/api';
import { haptic } from '../lib/native';
import { getState, setState, toast, useStore } from '../lib/store';
import { Modal } from './Modal';

const QUICK = ['Cheguei 🏠', 'Estou a caminho 🚗', 'Chego atrasado ⏰', 'Preciso de carona 🙏', 'Pode ligar? 📞'];

export function SosModal() {
  const watchers = useStore((s) => s.me?.watchers.length ?? 0);
  const [busy, setBusy] = useState(false);
  const close = () => setState({ sosOpen: false });
  const here = () => {
    const p = getState().myPos;
    return p ? { lat: p.lat, lng: p.lng } : {};
  };

  async function sos() {
    setBusy(true);
    try {
      const r = await api.sos(here());
      void haptic('warning');
      toast(r.notified ? `Alerta enviado para ${r.notified} ${r.notified === 1 ? 'pessoa' : 'pessoas'}` : 'Ninguém acompanha você ainda — ligue 190/192/193 se precisar.', r.notified ? 'ok' : 'err');
      close();
    } catch (e) {
      toast((e as Error).message, 'err');
      setBusy(false);
    }
  }
  async function checkin(message = 'Estou bem ✅') {
    setBusy(true);
    try {
      const r = await api.checkin({ ...here(), message });
      void haptic('success');
      toast(r.notified ? `Avisado: “${message}”` : 'Ninguém acompanha você ainda.', r.notified ? 'ok' : 'err');
      close();
    } catch (e) {
      toast((e as Error).message, 'err');
      setBusy(false);
    }
  }

  return (
    <Modal title="Precisa de ajuda ou quer avisar?" onClose={close} tone="danger">
      <div className="modal-body">
        <p className="lead sm">
          {watchers
            ? `Avisamos ${watchers} ${watchers === 1 ? 'pessoa' : 'pessoas'} que acompanham você, com a sua localização exata.`
            : 'Ninguém acompanha você ainda. Em emergência, ligue 190 (Polícia), 192 (SAMU) ou 193 (Bombeiros).'}
        </p>
        <Button variant="danger" size="lg" className="pulse" onClick={sos} loading={busy}>🚨 Enviar alerta SOS</Button>
        <Button variant="secondary" size="lg" onClick={() => checkin()} disabled={busy}>✅ Só avisar que estou bem</Button>
        <div className="chips wrap">
          {QUICK.map((q) => (
            <Button key={q} variant="secondary" size="sm" disabled={busy} onClick={() => checkin(q)}>{q}</Button>
          ))}
        </div>
        <Button variant="ghost" onClick={close}>Cancelar</Button>
      </div>
    </Modal>
  );
}
