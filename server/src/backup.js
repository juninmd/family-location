import { backup } from 'node:sqlite';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;

/** Cópia consistente do SQLite (API de backup online) com rotação. */
export async function runBackup(db, dir, keep = 7) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `family-${stamp()}.sqlite`);
  await backup(db, file);
  const all = readdirSync(dir).filter((f) => /^family-.*\.sqlite$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) unlinkSync(join(dir, old));
  return file;
}

export function startBackups(db, dir, { keep = 7, everyMs = 24 * 3600e3 } = {}) {
  const run = () => runBackup(db, dir, keep).then((f) => console.log('backup:', f)).catch((e) => console.error('backup falhou:', e.message));
  let newest = 0;
  try {
    for (const f of readdirSync(dir)) newest = Math.max(newest, statSync(join(dir, f)).mtimeMs);
  } catch {
    /* pasta ainda não existe */
  }
  if (Date.now() - newest > everyMs - 4 * 3600e3) run();
  return setInterval(run, everyMs).unref();
}
