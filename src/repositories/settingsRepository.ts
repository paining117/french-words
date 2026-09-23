import type { Connection, Database } from '../db/connection';
import { isValidRoundSize, type Settings } from '../types/settings';

export async function setStudyRoundSize(db: Connection, size: number): Promise<void> {
  if (!isValidRoundSize(size)) throw new Error('Round size must be a positive multiple of 5');
  await db.runAsync("INSERT INTO settings (key, value) VALUES ('daily_new_words', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(size));
}

export async function setCurrentBook(db: Database, bookId: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync("UPDATE settings SET value = value WHERE key = 'current_book_id'");
    if (!await tx.getFirstAsync('SELECT id FROM word_books WHERE id = ?', bookId)) throw new Error('Book not found');
    const old = await getSettings(tx);
    await tx.runAsync(`UPDATE study_rounds SET state_json = json_set(state_json, '$.bookId', ?), revision = revision + 1
      WHERE json_extract(state_json, '$.snapshot.status') <> 'completed' AND json_extract(state_json, '$.bookId') IS NULL`, old.currentBookId);
    await tx.runAsync("UPDATE settings SET value = ? WHERE key = 'current_book_id'", bookId);
  });
}

export async function getSettings(db: Connection): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  const daily = Number(values.daily_new_words);
  if (!values.current_book_id || !isValidRoundSize(daily)) throw new Error('Invalid settings');
  return { currentBookId: values.current_book_id, dailyNewWords: daily };
}
