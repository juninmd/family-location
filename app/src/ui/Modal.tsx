import type { ReactNode } from 'react';
import { Dialog } from '@juninmd/sonido';

/**
 * Adapter over Sonido's Dialog so screens keep their existing `Modal` call sites.
 * Sonido owns focus trapping, Esc/backdrop close, the accessible heading and the close button.
 */
export function Modal({ title, onClose, children, tone }: { title?: string; onClose: () => void; children: ReactNode; tone?: 'danger' }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={title ?? 'Perto'}
      className={tone === 'danger' ? 'app-dialog-danger' : undefined}
    >
      {children}
    </Dialog>
  );
}
