import { useEffect, useRef } from 'react';
import { useToast, type ToastOptions } from '@juninmd/sonido';
import { useStore } from '../lib/store';

/** Maps the app toast kinds to the Sonido tones without changing `toast()` callers. */
export function toastTone(kind: 'ok' | 'err' | 'sos'): NonNullable<ToastOptions['tone']> {
  if (kind === 'err' || kind === 'sos') return 'danger';
  return 'success';
}

/**
 * The app raises toasts from plain modules (`store.ts`), so this host subscribes to that
 * store and forwards every new toast to the Sonido toast region.
 */
export function Toaster() {
  const current = useStore((s) => s.toast);
  const push = useToast();
  const lastId = useRef(0);

  useEffect(() => {
    if (!current || current.id === lastId.current) return;
    lastId.current = current.id;
    push({
      title: current.text,
      tone: toastTone(current.kind),
      duration: current.kind === 'sos' ? 6000 : 3200,
    });
  }, [current, push]);

  return null;
}
