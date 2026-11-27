import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Badge, Button, Card, EmptyState, Switch, Tabs, TextField } from '@juninmd/sonido';

afterEach(cleanup);

describe('Sonido primitives used by Perto', () => {
  it('renders buttons with Sonido variants', () => {
    render(<Button variant="primary">Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button.className).toContain('sn-button--primary');
  });

  it('renders empty states, cards and badges', () => {
    render(
      <Card surface="solid">
        <EmptyState title="Nenhum lugar ainda" description="Cadastre Casa, Escola, Trabalho…" />
        <Badge tone="success" dot>no seu Wi-Fi</Badge>
      </Card>,
    );
    expect(screen.getByText('Nenhum lugar ainda').className).toContain('sn-empty__title');
    expect(screen.getByText('no seu Wi-Fi').className).toContain('sn-badge--success');
  });

  it('wires text fields and switches to their labels', () => {
    const { rerender } = render(<TextField label="Seu nome" value="Ana" onChange={() => {}} />);
    expect(screen.getByLabelText('Seu nome')).toBeTruthy();
    rerender(<Switch checked={false} onChange={() => {}} label="Compartilhar" />);
    expect(screen.getByRole('switch', { name: 'Compartilhar' })).toBeTruthy();
  });

  it('moves between tabs with the keyboard', () => {
    let value = 'code';
    const items = [{ key: 'code', label: 'Código' }, { key: 'wifi', label: 'Wi‑Fi' }];
    const { rerender } = render(
      <Tabs items={items} value={value} onChange={(next) => { value = next; }} label="Como adicionar" variant="pill" />,
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Código' }), { key: 'ArrowRight' });
    expect(value).toBe('wifi');
    rerender(<Tabs items={items} value={value} onChange={() => {}} label="Como adicionar" variant="pill" />);
    expect(screen.getByRole('tab', { name: 'Wi‑Fi' }).getAttribute('aria-selected')).toBe('true');
  });
});
