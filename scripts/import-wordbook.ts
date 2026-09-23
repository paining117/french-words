import type { Database } from '../src/db/connection';
import type { SeedBook } from '../src/types/word';
import { normalizeFrench, foldFrenchSearch } from '../src/utils/normalizeFrench';

export function validateWordBook(input: unknown): asserts input is SeedBook {
  if (!input || typeof input !== 'object') throw new Error('Invalid wordbook');
  const book = input as Record<string, unknown>;
  if (typeof book.id !== 'string' || !book.id.trim() || typeof book.name !== 'string' || !book.name.trim() || !Array.isArray(book.words) || !book.words.length) throw new Error('Invalid wordbook metadata');
  for (const field of ['level', 'description']) if (book[field] !== undefined && typeof book[field] !== 'string') throw new Error('Invalid metadata field');
  const identities = new Set<string>();
  for (const value of book.words) {
    if (!value || typeof value !== 'object') throw new Error('Invalid word');
    const word = value as Record<string, unknown>;
    if (typeof word.lemma !== 'string' || !word.lemma.trim() || typeof word.partOfSpeech !== 'string' || !word.partOfSpeech.trim()) throw new Error('Missing word identity');
    if (!Array.isArray(word.meaningsZh) || !word.meaningsZh.length || word.meaningsZh.some(m => typeof m !== 'string' || !m.trim())) throw new Error('Missing meaning');
    if (word.gender !== undefined && word.gender !== 'm' && word.gender !== 'f') throw new Error('Invalid gender');
    if (word.displayForm !== undefined && typeof word.displayForm !== 'string') throw new Error('Invalid display form');
    if (word.examples !== undefined && (!Array.isArray(word.examples) || word.examples.some(e => !e || typeof e.french !== 'string' || !e.french.trim() || typeof e.chinese !== 'string' || !e.chinese.trim()))) throw new Error('Invalid example');
    const identity = JSON.stringify([normalizeFrench(word.lemma), normalizeFrench(word.partOfSpeech)]);
    if (identities.has(identity)) throw new Error('Duplicate lemma and part of speech');
    identities.add(identity);
  }
}

// Accepts a parsed JSON file. Run during initialization before UI consumers mount.
// Entire book import is atomic: a failed import leaves no partial book marker.
export async function importWordBook(db: Database, input: unknown, now = new Date()): Promise<boolean> {
  validateWordBook(input);
  let imported = false;
  await db.withTransactionAsync(async () => {
    const tx = db;
    if (await tx.getFirstAsync('SELECT id FROM word_books WHERE id = ?', input.id)) return;
    await tx.runAsync('INSERT INTO word_books (id, name, level, description, built_in, created_at) VALUES (?, ?, ?, ?, 1, ?)', input.id, input.name, input.level ?? null, input.description ?? null, now.toISOString());
    const indexed = (await tx.getAllAsync<{ name: string }>('PRAGMA table_info(words)')).some(column => column.name === 'search_key');
    for (const [order, word] of input.words.entries()) {
      const normalized = normalizeFrench(word.lemma);
      const pos = normalizeFrench(word.partOfSpeech);
      const existing = await tx.getFirstAsync<{ id: string }>('SELECT id FROM words WHERE normalized_lemma = ? AND COALESCE(part_of_speech, \'\') = ?', normalized, pos);
      const id = existing?.id ?? `word:${encodeURIComponent(normalized)}:${encodeURIComponent(pos)}`;
      if (!existing) {
        await tx.runAsync(`INSERT INTO words (id, lemma, normalized_lemma, display_form, normalized_display_form, part_of_speech, gender, primary_meaning_zh, cefr_level, source, created_at${indexed ? ', search_key, display_search_key' : ''})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?${indexed ? ', ?, ?' : ''})`, id, word.lemma.trim().normalize('NFC'), normalized, word.displayForm ?? null, normalizeFrench(word.displayForm ?? ''), pos, word.gender ?? null, word.meaningsZh[0], input.level ?? null, now.toISOString(), ...(indexed ? [foldFrenchSearch(word.lemma), foldFrenchSearch(word.displayForm ?? '')] : []));
        for (const [i, meaning] of word.meaningsZh.entries()) await tx.runAsync('INSERT INTO meanings (id, word_id, meaning_zh, order_index) VALUES (?, ?, ?, ?)', `${id}:m:${i}`, id, meaning, i);
        for (const [i, example] of (word.examples ?? []).entries()) await tx.runAsync('INSERT INTO examples (id, word_id, french, chinese, order_index) VALUES (?, ?, ?, ?, ?)', `${id}:e:${i}`, id, example.french, example.chinese, i);
      }
      await tx.runAsync('INSERT INTO word_book_words (book_id, word_id, order_index) VALUES (?, ?, ?)', input.id, id, order);
    }
    imported = true;
  });
  return imported;
}
