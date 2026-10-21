import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { copyText, haptic, shareText } from '../lib/native';
import { select, setState, toast, upsertPerson, useStore } from '../lib/store';
import { ICopy, IShare } from './Icons';
import { Nearby } from './Nearby';
import { QrCode, qrPayload, Scanner } from './Qr';
import { Modal } from './Modal';

const ALPHA = /[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g;
const fmt = (raw: string) => {
  const s = raw.toUpperCase().replace(ALPHA, '').slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
};

export function shareInvite(code: string, name: string) {
  return shareText('Perto', `${name} quer compartilhar a localização com você no app Perto. Meu código de pareamento: ${code}`);
}

export function AddPerson() {
  const me = useStore((s) => s.me);
  const [code, setCode] = useState('');
  const [alias, setAlias] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(false);
  const [mode, setMode] = useState<'code' | 'wifi'>('code');
  const [showQr, setShowQr] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const close = () => setState({ addOpen: false });
  const ready = code.replace('-', '').length === 8;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setErr('');
    try {
      const p = await api.follow(code, alias.trim() || undefined);
      upsertPerson(p);
      void haptic('success');
      toast(p.pending ? `Pedido enviado a ${p.name}. Aguarde a aprovação.` : `${p.name} adicionado(a)!`);
      close();
      select(p.code);
    } catch (e) {
      setErr((e as Error).message);
      void haptic('warning');
      input.current?.classList.remove('shake');
      void input.current?.offsetWidth;
      input.current?.classList.add('shake');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Adicionar pessoa" onClose={close}>
      <div className="seg wide tabs">
        <button className={mode === 'code' ? 'on' : ''} onClick={() => setMode('code')}>🔢 Código</button>
        <button className={mode === 'wifi' ? 'on' : ''} onClick={() => setMode('wifi')}>📡 Wi‑Fi próximo</button>
      </div>
      {mode === 'wifi' && <Nearby onDone={close} />}
      <div className="modal-body" hidden={mode !== 'code'}>
        <label className="field">
          <span>Código de quem você quer acompanhar</span>
          <input
            ref={input}
            className="code-input"
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            onChange={(e) => (setCode(fmt(e.target.value)), setErr(''))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
        <label className="field">
          <span>Apelido (opcional)</span>
          <input value={alias} maxLength={24} placeholder="Ex.: Amor, Mãe, Pedrinho" onChange={(e) => setAlias(e.target.value)} />
        </label>
        {err && <p className="err">{err}</p>}
        <button className="btn primary lg" onClick={submit} disabled={!ready || busy}>{busy ? 'Procurando…' : 'Acompanhar no mapa'}</button>
        <button className="btn soft" onClick={() => setScan(true)}>📷 Escanear QR Code</button>

        <div className="divider"><span>ou deixe que vejam você</span></div>
        <div className="mycode">
          <small>Seu código</small>
          <b>{me?.code ?? '…'}</b>
          <div className="row gap center">
            <button className="btn soft" onClick={async () => me && toast((await copyText(me.code)) ? 'Código copiado' : 'Não foi possível copiar', 'ok')}><ICopy width={18} height={18} /> Copiar</button>
            <button className="btn soft" onClick={() => me && shareInvite(me.code, me.name)}><IShare width={18} height={18} /> Enviar</button>
            <button className="btn soft" onClick={() => setShowQr((v) => !v)}>QR</button>
          </div>
          {showQr && me && <div className="qr-wrap"><QrCode text={qrPayload(me.code)} size={190} /></div>}
        </div>
        <p className="hint">Quem digitar o seu código passa a ver sua localização. Você vê e remove essas pessoas em Perfil → Quem me vê.</p>
      </div>
      {scan && (
        <Scanner
          onClose={() => setScan(false)}
          onCode={(c) => {
            setScan(false);
            setCode(c);
            setErr('');
          }}
        />
      )}
    </Modal>
  );
}
