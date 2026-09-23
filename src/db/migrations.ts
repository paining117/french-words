import type { Database } from './connection';
import { SCHEMA_V1 } from './schema';
import { migrateV4 } from './migrationV4';
import { migrateV5 } from './migrationV5';
import { migrateV6 } from './migrationV6';

export async function migrateDatabase(db: Database): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  // Runs before SQLiteProvider mounts consumers. Use this connection so its
  // foreign_keys pragma applies (Expo exclusive transactions open another one).
  await db.withTransactionAsync(async () => {
    const tx = db;
    const version = await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) > 6) throw new Error('Unsupported database version');
    if (!version?.user_version) {
      await tx.execAsync(SCHEMA_V1);
      await tx.execAsync('PRAGMA user_version = 1');
    }
    if ((version?.user_version ?? 0) < 2) {
      await tx.execAsync(`CREATE TABLE study_rounds (
        local_date TEXT PRIMARY KEY NOT NULL,
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      ); PRAGMA user_version = 2;`);
    }
    if ((version?.user_version ?? 0) < 3) {
      // Rebuild only the round index; retain every saved state and revision.
      await tx.execAsync(`CREATE TABLE study_rounds_v3 (
        round_id TEXT PRIMARY KEY NOT NULL,
        local_date TEXT NOT NULL,
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO study_rounds_v3 (round_id, local_date, state_json, revision)
        SELECT json_extract(state_json, '$.sessionId'), local_date, state_json, revision
        FROM study_rounds WHERE state_json <> 'null';
      DROP TABLE study_rounds;
      ALTER TABLE study_rounds_v3 RENAME TO study_rounds;
      CREATE INDEX idx_study_rounds_date ON study_rounds(local_date);
      PRAGMA user_version = 3;`);
    }
    if ((version?.user_version ?? 0) < 4) await migrateV4(tx);
    if ((version?.user_version ?? 0) < 5) await migrateV5(tx);
    if ((version?.user_version ?? 0) < 6) await migrateV6(tx);
  });
}
