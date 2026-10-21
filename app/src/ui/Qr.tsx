import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';

/** QR Code em SVG (gerado localmente, sem enviar o código para nenhum serviço). */
export function QrCode({ text, size = 200 }: { text: string; size?: number }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label="QR Code do código de pareamento" />;
}

export const qrPayload = (code: string) => `PERTO:${code}`;
const CODE_RE = /([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})-?([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})/i;
export const parseCode = (text: string) => {
  const m = CODE_RE.exec(text.toUpperCase());
  return m ? `${m[1]}-${m[2]}` : null;
};

/** Leitor de QR via câmera (getUserMedia + jsQR). Funciona no PWA, no Android e no iOS. */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (done || !v || !ctx) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 480 / v.videoWidth);
        canvas.width = v.videoWidth * scale;
        canvas.height = v.videoHeight * scale;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        const code = r && parseCode(r.data);
        if (code) {
          done = true;
          onCode(code);
          return;
        }
      }
      raf = window.setTimeout(tick, 120);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (done) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        tick();
      })
      .catch(() => setErr('Não foi possível abrir a câmera. Permita o acesso à câmera nas configurações, ou digite o código.'));
    if (!navigator.mediaDevices) setErr('Câmera indisponível neste aparelho. Digite o código.');

    return () => {
      done = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <Modal title="Escanear QR Code" onClose={onClose}>
      <div className="modal-body">
        <div className="scanner">
          <video ref={video} muted playsInline />
          <i className="scan-frame" />
        </div>
        {err ? <p className="err">{err}</p> : <p className="hint">Aponte para o QR Code do Perfil da outra pessoa.</p>}
      </div>
    </Modal>
  );
}
