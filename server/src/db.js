import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      secret_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🙂',
      color TEXT NOT NULL DEFAULT '#6366f1',
      sharing INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS follows (
      follower_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      alias TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (follower_id, target_id)
    );
    CREATE INDEX IF NOT EXISTS follows_target ON follows(target_id);
    CREATE TABLE IF NOT EXISTS positions (
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      ts INTEGER NOT NULL,
      lat REAL NOT NULL, lng REAL NOT NULL,
      acc REAL, speed REAL, heading REAL, alt REAL,
      battery REAL, charging INTEGER
    );
    CREATE INDEX IF NOT EXISTS positions_dev_ts ON positions(device_id, ts);
    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '📍',
      lat REAL NOT NULL, lng REAL NOT NULL,
      radius REAL NOT NULL DEFAULT 150
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      lat REAL, lng REAL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_rec ON events(recipient_id, ts);
  `);
  return db;
}
