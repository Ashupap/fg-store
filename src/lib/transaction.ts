import { getDb } from './db';
import type Database from 'better-sqlite3';

export function withTransaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  const tx = db.transaction(() => fn(db));
  return tx();
}
