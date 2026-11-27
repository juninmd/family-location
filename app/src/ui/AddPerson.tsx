import { useRef, useState } from 'react';
import { Button, Tabs, TextField } from '@juninmd/sonido';
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
  const input = useRef<HTMLDivElement>(null);
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
      <Tabs
        items={[
          { key: 'code', label: '🔢 Código' },
          { key: 'wifi', label: '📡 Wi‑Fi próximo' },
        ]}
        value={mode}
        onChange={setMode}
        label="Como adicionar"
        variant="pill"
        className="add-tabs"
      />
      {mode === 'wifi' && <Nearby onDone={close} />}
      <div className="modal-body" hidden={mode !== 'code'}>
        <div ref={input}>
          <TextField
            label="Código de quem você quer acompanhar"
            className="code-input"
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            error={err || undefined}
            onChange={(e) => (setCode(fmt(e.target.value)), setErr(''))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <TextField
          label="Apelido (opcional)"
          value={alias}
          maxLength={24}
          placeholder="Ex.: Amor, Mãe, Pedrinho"
          onChange={(e) => setAlias(e.target.value)}
        />
        <Button variant="primary" size="lg" onClick={submit} disabled={!ready} loading={busy}>
          {busy ? 'Procurando…' : 'Acompanhar no mapa'}
        </Button>
        <Button variant="secondary" onClick={() => setScan(true)}>
          📷 Escanear QR Code
        </Button>

        <div className="divider"><span>ou deixe que vejam você</span></div>
        <div className="mycode">
          <small>Seu código</small>
          <b>{me?.code ?? '…'}</b>
          <div className="row gap center">
            <Button variant="secondary" size="sm" onClick={async () => me && toast((await copyText(me.code)) ? 'Código copiado' : 'Não foi possível copiar', 'ok')}>
              <ICopy width={18} height={18} /> Copiar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => me && shareInvite(me.code, me.name)}>
              <IShare width={18} height={18} /> Enviar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowQr((v) => !v)}>QR</Button>
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
