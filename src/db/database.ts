import sample from '../../content/wordbooks/a1.sample.json';
import { importWordBook } from '../../scripts/import-wordbook';
import type { Database } from './connection';
import { migrateDatabase } from './migrations';

export async function initializeSampleDatabase(db: Database): Promise<void> {
  await migrateDatabase(db);
  await importWordBook(db, sample);
  await db.withTransactionAsync(async () => {
    const tx = db;
    await tx.runAsync(`INSERT OR IGNORE INTO word_books (id, name, description, built_in, created_at)
      VALUES ('my-vocabulary', '我的生词本', '保存你想记住的词', 0, ?)`, new Date().toISOString());
    await tx.runAsync("INSERT OR IGNORE INTO settings (key, value) VALUES ('current_book_id', 'a1-core')");
    await tx.runAsync("INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_new_words', '10')");
  });
  // Opening the app must not reschedule completed words from an older version.
  // New first-review rules apply when Study saves a score.
}

// Production bootstrap adds the bundled dataset; legacy tests use the sample fixture above.
export async function initializeDatabase(db: Database): Promise<void> {
  await initializeSampleDatabase(db);
  const { bundledDataset } = require('../../data/generated/seed');
  const { importOfflineDataset } = require('./importOfflineDataset');
  await importOfflineDataset(db, bundledDataset);
}
