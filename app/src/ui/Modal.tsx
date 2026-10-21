import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IClose } from './Icons';

export function Modal({ title, onClose, children, tone }: { title?: string; onClose: () => void; children: ReactNode; tone?: 'danger' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className={`modal ${tone ?? ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="grab" />
        {title && (
          <header className="modal-head">
            <h3>{title}</h3>
            <button className="icon-btn sm" onClick={onClose} aria-label="Fechar"><IClose width={18} height={18} /></button>
          </header>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
