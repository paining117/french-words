import type { Connection, Database } from '../db/connection';
import type { BookProgress, Word } from '../types/word';

export const VOCABULARY_BOOK_ID = 'my-vocabulary';
export const FAMILIAR_BOOK_ID = 'my-familiar';
export type WordClassification = 'vocabulary' | 'familiar' | null;
export class WordClassificationConflictError extends Error {}
export async function getWordClassification(db: Connection, wordId: string): Promise<WordClassification> {
  const row = await db.getFirstAsync<{ book_id: string }>(`SELECT book_id FROM word_book_words
    WHERE word_id = ? AND book_id IN (?, ?) LIMIT 1`, wordId, VOCABULARY_BOOK_ID, FAMILIAR_BOOK_ID);
  return row ? row.book_id === VOCABULARY_BOOK_ID ? 'vocabulary' : 'familiar' : null;
}
export async function assertWordClassification(db: Connection, wordId: string, target: Exclude<WordClassification, null>): Promise<void> {
  const current = await getWordClassification(db, wordId);
  if (current && current !== target) throw new WordClassificationConflictError(current === 'familiar'
    ? '请先在熟词本中撤回标熟' : '请先在生词本中撤回标生');
}
export type BookWord = Word & { order_index: number; learned: number };
export function getWordsByBookId(db: Connection, bookId: string): Promise<BookWord[]> {
  return db.getAllAsync<BookWord>(`SELECT w.*, bw.order_index, CASE WHEN c.word_id IS NULL THEN 0 ELSE 1 END AS learned
    FROM word_book_words bw JOIN words w ON w.id = bw.word_id LEFT JOIN cards c ON c.word_id = w.id
    WHERE bw.book_id = ? ORDER BY bw.order_index, w.id`, bookId);
}
export async function isWordInBook(db: Connection, bookId: string, wordId: string): Promise<boolean> {
  return !!await db.getFirstAsync('SELECT 1 FROM word_book_words WHERE book_id = ? AND word_id = ?', bookId, wordId);
}
export async function addVocabularyWord(db: Database, wordId: string): Promise<void> {
  await db.withExclusiveTransactionAsync(tx => addVocabularyWordInTransaction(tx, wordId));
}
/** Caller must already own a write transaction. */
export async function addVocabularyWordInTransaction(tx: Connection, wordId: string): Promise<void> {
    // Lock before MAX; Expo exclusive transactions use a separate connection.
    const book = await tx.runAsync('UPDATE word_books SET name = name WHERE id = ?', VOCABULARY_BOOK_ID);
    if (book.changes !== 1 || !await tx.getFirstAsync('SELECT id FROM words WHERE id = ?', wordId)) throw new Error('Vocabulary book or word missing');
    await assertWordClassification(tx, wordId, 'vocabulary');
    await tx.runAsync(`INSERT OR IGNORE INTO word_book_words (book_id, word_id, order_index)
      SELECT ?, ?, COALESCE(MAX(order_index), -1) + 1 FROM word_book_words WHERE book_id = ?`, VOCABULARY_BOOK_ID, wordId, VOCABULARY_BOOK_ID);
}
export async function removeVocabularyWord(db: Connection, wordId: string): Promise<void> {
  await db.runAsync('DELETE FROM word_book_words WHERE book_id = ? AND word_id = ?', VOCABULARY_BOOK_ID, wordId);
}

export async function getBookProgress(db: Connection, id: string): Promise<BookProgress | null> {
  return db.getFirstAsync<BookProgress>(`SELECT b.*, COUNT(bw.word_id) AS total, COUNT(c.word_id) AS learned
    FROM word_books b LEFT JOIN word_book_words bw ON bw.book_id = b.id
    LEFT JOIN cards c ON c.word_id = bw.word_id WHERE b.id = ? GROUP BY b.id`, id);
}
export async function getBooks(db: Connection): Promise<BookProgress[]> {
  return db.getAllAsync<BookProgress>(`SELECT b.*, COUNT(bw.word_id) AS total, COUNT(c.word_id) AS learned
    FROM word_books b LEFT JOIN word_book_words bw ON bw.book_id = b.id
    LEFT JOIN cards c ON c.word_id = bw.word_id GROUP BY b.id ORDER BY b.built_in DESC, b.name`);
}
export function getUnlearnedWords(db: Connection, bookId: string, limit: number): Promise<Word[]> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid study limit');
  return db.getAllAsync<Word>(`SELECT w.* FROM word_book_words bw JOIN words w ON w.id = bw.word_id
    WHERE bw.book_id = ? AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.word_id = w.id)
    ORDER BY bw.order_index, w.id LIMIT ?`, bookId, limit);
}
