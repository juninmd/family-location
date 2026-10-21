import { useState } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/native';
import { getState, setState, toast, useStore } from '../lib/store';
import { Modal } from './Modal';

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
  async function checkin() {
    setBusy(true);
    try {
      await api.checkin({ ...here(), message: 'Estou bem ✅' });
      void haptic('success');
      toast('Família avisada: você está bem ✅');
      close();
    } catch (e) {
      toast((e as Error).message, 'err');
      setBusy(false);
    }
  }

  return (
    <Modal title="Precisa de ajuda?" onClose={close} tone="danger">
      <div className="modal-body">
        <p className="lead sm">
          {watchers
            ? `Avisamos ${watchers} ${watchers === 1 ? 'pessoa' : 'pessoas'} que acompanham você, com a sua localização exata.`
            : 'Ninguém acompanha você ainda. Em emergência, ligue 190 (Polícia), 192 (SAMU) ou 193 (Bombeiros).'}
        </p>
        <button className="btn danger lg pulse" onClick={sos} disabled={busy}>🚨 Enviar alerta SOS</button>
        <button className="btn soft lg" onClick={checkin} disabled={busy}>✅ Só avisar que estou bem</button>
        <button className="btn ghost" onClick={close}>Cancelar</button>
      </div>
    </Modal>
  );
}
