import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Avatar, BatteryChip, emojiAvatarSrc } from './Avatar';

afterEach(cleanup);

describe('Avatar', () => {
  it('keeps the emoji and person colour inside the Sonido avatar', () => {
    const { container } = render(<Avatar emoji="🦊" color="#7c6cff" name="Ana" size={44} ring dot="live" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(emojiAvatarSrc('🦊', '#7c6cff'));
    expect(img?.getAttribute('alt')).toBe('Ana');
    expect(container.querySelector('.sn-avatar--ring')).toBeTruthy();
    expect(container.querySelector('.sn-avatar__status--online')).toBeTruthy();
  });

  it('maps the moving state to the away presence dot', () => {
    const { container } = render(<Avatar emoji="🚗" color="#2dd4bf" dot="move" />);
    expect(container.querySelector('.sn-avatar__status--away')).toBeTruthy();
  });

  it('renders the battery as a Sonido badge with a low-battery tone', () => {
    render(<BatteryChip level={0.12} charging={false} />);
    const badge = screen.getByText('12%');
    expect(badge.className).toContain('sn-badge--danger');
  });
});
