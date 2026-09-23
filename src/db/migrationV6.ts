import type { Connection } from './connection';

export async function migrateV6(db: Connection): Promise<void> {
  // Older versions allowed both. Keep familiar (and its existing schedule/undo
  // snapshot), removing only the contradictory vocabulary relation.
  await db.execAsync(`
    DELETE FROM word_book_words WHERE book_id = 'my-vocabulary'
      AND word_id IN (SELECT word_id FROM word_book_words WHERE book_id = 'my-familiar');
    CREATE UNIQUE INDEX IF NOT EXISTS idx_word_classification ON word_book_words(word_id)
      WHERE book_id IN ('my-vocabulary', 'my-familiar');
    PRAGMA user_version = 6;
  `);
}
