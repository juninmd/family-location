import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimiter } from '../src/util.js';

test('rateLimiter: chaves vistas uma vez só expiram e não acumulam sem teto', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const allow = rateLimiter(3, 1000);
    for (let i = 0; i < 6000; i++) allow(`old-${i}`);
    mock.timers.tick(1001);
    for (let i = 0; i < 10; i++) allow(`new-${i}`);
    assert.ok(allow.size() <= 10, `esperava só as chaves vivas, havia ${allow.size()}`);
  } finally {
    mock.timers.reset();
  }
});

test('rateLimiter: limita por chave e libera de novo após a janela', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const allow = rateLimiter(2, 1000);
    assert.deepEqual([allow('a'), allow('a'), allow('a'), allow('b')], [true, true, false, true]);
    mock.timers.tick(1001);
    assert.equal(allow('a'), true);
  } finally {
    mock.timers.reset();
  }
});
