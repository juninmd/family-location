import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, Hub } from './app.js';
import { openDb } from './db.js';
import { Service } from './service.js';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const db = openDb(process.env.DB_PATH ?? join(here, '..', 'data', 'family.sqlite'));
const hub = new Hub();
const service = new Service(db, hub);
const server = createApp({ service, hub, publicDir: process.env.PUBLIC_DIR ?? join(here, '..', 'public') });

service.maintenance();
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
