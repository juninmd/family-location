import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reverseGeocode } from '../src/geocode.js';

test('reverseGeocode: resposta HTTP de erro (429) não fica em cache', async () => {
  const replies = [
    { ok: false, status: 429, json: async () => ({}) },
    { ok: true, status: 200, json: async () => ({ address: { road: 'Rua A', city: 'Franca', state_code: 'SP' } }) },
  ];
  let calls = 0;
  const fakeFetch = async () => replies[calls++];
  assert.equal(await reverseGeocode(-20.5386, -47.4009, fakeFetch), null);
  assert.equal(await reverseGeocode(-20.5386, -47.4009, fakeFetch), 'Rua A · Franca - SP');
  assert.equal(calls, 2);
});
