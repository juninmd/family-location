import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@juninmd/sonido';
import { setState } from '../lib/store';
import { Toaster, toastTone } from './Toaster';

afterEach(() => {
  cleanup();
  setState({ toast: null });
});

describe('Toaster', () => {
  it('maps app toast kinds to Sonido tones', () => {
    expect(toastTone('ok')).toBe('success');
    expect(toastTone('err')).toBe('danger');
    expect(toastTone('sos')).toBe('danger');
  });

  it('forwards store toasts into the Sonido toast region', async () => {
    render(
      <ToastProvider>
        <Toaster />
      </ToastProvider>,
    );
    setState({ toast: { id: 42, text: 'Código copiado', kind: 'ok' } });
    await waitFor(() => expect(screen.getByText('Código copiado')).toBeTruthy());
    expect(screen.getByText('Código copiado').className).toContain('sn-toast__title');
  });
});
