import { useState } from 'react';
import { api } from '../lib/api';
import { haptic, kv } from '../lib/native';
import { startRealtime } from '../lib/socket';
import { setState } from '../lib/store';
import { getServer } from '../lib/config';
import { startTracking } from '../lib/tracker';
import { Avatar } from './Avatar';
import { ICheck, IEye, ILocate, IShield } from './Icons';

export const EMOJIS = ['😀', '😎', '🥰', '👨', '👩', '👦', '👧', '👴', '👵', '🧔', '👱‍♀️', '🧑‍🦱', '🐶', '🐱', '🦊', '🐼', '🦁', '🚗', '⚽', '🌻'];
export const COLORS = ['#7c6cff', '#ec4899', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#ef4444'];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('😀');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function finish() {
    setBusy(true);
    setErr('');
    try {
      const d = await api.register({ name: name.trim() || 'Eu', emoji, color });
      const creds = { id: d.id, secret: d.secret };
      kv.set('creds', creds);
      kv.set('welcome', true);
      setState({ creds, addOpen: true });
      void haptic('success');
      startRealtime(creds);
      void startTracking();
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErr(
        status === 0
          ? `Sem conexão com o servidor (${getServer()}). Verifique a internet e tente de novo.`
          : `O servidor (${getServer()}) não respondeu como esperado${status ? ` (erro ${status})` : ''}. Ele pode estar iniciando — tente de novo em instantes.`,
      );
      setBusy(false);
    }
  }

  return (
    <div className="onb">
      <div className="onb-bg" aria-hidden>
        <span style={{ left: '12%', top: '14%' }}>📍</span>
        <span style={{ left: '78%', top: '22%', animationDelay: '-2s' }}>👩</span>
        <span style={{ left: '62%', top: '8%', animationDelay: '-4s' }}>🧒</span>
        <span style={{ left: '22%', top: '34%', animationDelay: '-1s' }}>👴</span>
        <i className="ring r1" />
        <i className="ring r2" />
        <i className="ring r3" />
      </div>

      {step === 0 && (
        <div className="onb-card fade-up">
          <div className="logo-lg">
            <img src="/icon.svg" alt="" />
          </div>
          <h1>Perto</h1>
          <p className="lead">A família sempre por perto. Veja no mapa, em tempo real, onde estão as pessoas que você ama.</p>
          <ul className="feat">
            <li><span><ILocate /></span><div><b>Tempo real</b><small>Posição, GPS, velocidade e bateria ao vivo.</small></div></li>
            <li><span><IShield /></span><div><b>Sem cadastro</b><small>Nada de e-mail ou senha. Só um código de pareamento.</small></div></li>
            <li><span><IEye /></span><div><b>Você no controle</b><small>Pause quando quiser e veja quem acompanha você.</small></div></li>
          </ul>
          <button className="btn primary lg" onClick={() => setStep(1)}>Começar</button>
        </div>
      )}

      {step === 1 && (
        <div className="onb-card fade-up">
          <h2>Como a família vai te ver?</h2>
          <div className="onb-avatar"><Avatar emoji={emoji} color={color} size={96} ring /></div>
          <label className="field">
            <span>Seu nome</span>
            <input value={name} maxLength={24} placeholder="Ex.: Junin" onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <div className="pick-row">
            {EMOJIS.map((e) => (
              <button key={e} className={`pick${e === emoji ? ' on' : ''}`} onClick={() => setEmoji(e)} aria-label={e}>{e}</button>
            ))}
          </div>
          <div className="pick-row colors">
            {COLORS.map((c) => (
              <button key={c} className={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c}>
                {c === color && <ICheck width={16} height={16} />}
              </button>
            ))}
          </div>
          <div className="row gap">
            <button className="btn ghost" onClick={() => setStep(0)}>Voltar</button>
            <button className="btn primary grow" onClick={() => setStep(2)} disabled={!name.trim()}>Continuar</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="onb-card fade-up">
          <div className="perm-ico"><ILocate width={34} height={34} /></div>
          <h2>Permita a localização</h2>
          <p className="lead">
            Toque em <b>“Permitir”</b> (ou <b>“Ao usar o app”</b>) quando o sistema perguntar. Com a tela bloqueada ou o app em segundo plano,
            uma notificação fixa avisa que o compartilhamento está ativo — nada é escondido.
          </p>
          <ul className="feat compact">
            <li><span><ICheck /></span><div><b>Só quem tem o seu código</b><small>E você pode trocá-lo a qualquer momento.</small></div></li>
            <li><span><ICheck /></span><div><b>Pausa com um toque</b><small>No perfil, em “Compartilhar minha localização”.</small></div></li>
          </ul>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="row gap">
            <button className="btn ghost" onClick={() => setStep(1)}>Voltar</button>
            <button className="btn primary grow" onClick={finish} disabled={busy}>{busy ? 'Criando…' : err ? 'Tentar de novo' : 'Permitir e criar meu código'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
