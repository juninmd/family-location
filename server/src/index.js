import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, Hub } from './app.js';
import { openDb } from './db.js';
import { startBackups } from './backup.js';
import { createPush } from './push.js';
import { Service } from './service.js';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const db = openDb(process.env.DB_PATH ?? join(here, '..', 'data', 'family.sqlite'));
const hub = new Hub();
const push = createPush();
const service = new Service(db, hub, push);
if (push.configured) console.log('push: FCM ativo');
const server = createApp({ service, hub, publicDir: process.env.PUBLIC_DIR ?? join(here, '..', 'public') });

service.maintenance();
const dbPath = process.env.DB_PATH ?? join(here, '..', 'data', 'family.sqlite');
if (process.env.BACKUP !== 'off') startBackups(db, process.env.BACKUP_DIR ?? join(dirname(dbPath), 'backups'), { keep: Number(process.env.BACKUP_KEEP ?? 7) });
setInterval(() => service.maintenance(), 6 * 3600e3).unref();

server.listen(port, () => console.log(`family-location listening on :${port}`));
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
