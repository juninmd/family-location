import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const noPush = { configured: false, notify: async () => [] };
const b64url = (b) => Buffer.from(b).toString('base64url');

/**
 * Notificações push via Firebase Cloud Messaging (HTTP v1). Ativa quando há uma
 * conta de serviço em FCM_SERVICE_ACCOUNT_JSON (JSON ou base64) ou FCM_SERVICE_ACCOUNT_FILE.
 * Sem configuração, vira no-op e o app segue funcionando só com WebSocket.
 */
export function createPush({ env = process.env, fetchImpl = fetch } = {}) {
  let sa;
  try {
    const raw = env.FCM_SERVICE_ACCOUNT_JSON ?? (env.FCM_SERVICE_ACCOUNT_FILE ? readFileSync(env.FCM_SERVICE_ACCOUNT_FILE, 'utf8') : '');
    if (!raw) return noPush;
    sa = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    if (!sa.private_key || !sa.client_email || !sa.project_id) return noPush;
  } catch (e) {
    console.error('push: conta de serviço inválida:', e.message);
    return noPush;
  }

  let cached = { token: '', exp: 0 };
  async function accessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cached.token && cached.exp - 60 > now) return cached.token;
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    );
    const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key, 'base64url');
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
    });
    if (!res.ok) throw new Error(`oauth ${res.status}`);
    const j = await res.json();
    cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
    return cached.token;
  }

  return {
    configured: true,
    /** Envia para todos os tokens; devolve os tokens inválidos (para remoção). */
    async notify(tokens, { title, body, data = {}, urgent = false }) {
      const bearer = await accessToken();
      const invalid = [];
      await Promise.all(
        tokens.map(async ({ token }) => {
          const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
            method: 'POST',
            headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              message: {
                token,
                notification: { title, body },
                data,
                android: { priority: urgent ? 'HIGH' : 'NORMAL', notification: { channel_id: urgent ? 'sos' : 'family' } },
                apns: { headers: { 'apns-priority': urgent ? '10' : '5' }, payload: { aps: { sound: 'default' } } },
              },
            }),
          });
          if (res.status === 404 || res.status === 400) invalid.push(token);
        }),
      );
      return invalid;
    },
  };
}
