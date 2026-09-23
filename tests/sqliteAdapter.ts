import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Database } from '../src/db/connection';

function bindings(values: unknown[]): SQLInputValue[] {
  return (values.length === 1 && Array.isArray(values[0]) ? values[0] : values) as SQLInputValue[];
}
export function openTestDatabase(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  const db: Database = {
    async withTransactionAsync(task) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await task(); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    async execAsync(sql: string) { sqlite.exec(sql); },
    async runAsync(sql: string, ...args: unknown[]) {
      const result = sqlite.prepare(sql).run(...bindings(args));
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getFirstAsync<T>(sql: string, ...args: unknown[]): Promise<T | null> {
      return (sqlite.prepare(sql).get(...bindings(args)) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...args: unknown[]): Promise<T[]> {
      return sqlite.prepare(sql).all(...bindings(args)) as T[];
    },
    async withExclusiveTransactionAsync(task) {
      if (path !== ':memory:') {
        // Expo opens a separate connection for exclusive transactions. Exercise
        // the same isolation and non-inherited connection pragmas in file tests.
        const transaction = openTestDatabase(path);
        try {
          await transaction.db.execAsync('PRAGMA foreign_keys = OFF');
          await transaction.db.withTransactionAsync(() => task(transaction.db));
        } finally { transaction.close(); }
        return;
      }
      sqlite.exec('BEGIN IMMEDIATE');
      try { await task(db); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, close: () => sqlite.close() };
}
