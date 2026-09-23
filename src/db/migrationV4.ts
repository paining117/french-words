import type { Connection } from './connection';
import { foldFrenchSearch } from '../utils/normalizeFrench';

export async function migrateV4(db: Connection) {
  await db.execAsync(`
    ALTER TABLE words ADD COLUMN search_key TEXT NOT NULL DEFAULT '';
    ALTER TABLE words ADD COLUMN display_search_key TEXT NOT NULL DEFAULT '';
    ALTER TABLE words ADD COLUMN homograph_key TEXT NOT NULL DEFAULT '';
    ALTER TABLE examples ADD COLUMN source_ref TEXT;
    ALTER TABLE examples ADD COLUMN attribution TEXT;
    CREATE TABLE dictionary_word_map (
      source_id TEXT PRIMARY KEY NOT NULL,
      word_id TEXT NOT NULL REFERENCES words(id)
    );
    DROP INDEX idx_words_identity;
    CREATE UNIQUE INDEX idx_words_identity ON words(normalized_lemma, COALESCE(part_of_speech, ''), homograph_key);
    CREATE INDEX idx_words_search ON words(search_key COLLATE NOCASE);
    CREATE INDEX idx_words_display_search ON words(display_search_key COLLATE NOCASE);
  `);
  const words = await db.getAllAsync<{ id: string; lemma: string; display_form: string | null }>('SELECT id, lemma, display_form FROM words');
  for (const word of words) await db.runAsync('UPDATE words SET search_key = ?, display_search_key = ? WHERE id = ?', foldFrenchSearch(word.lemma), foldFrenchSearch(word.display_form ?? ''), word.id);
  await db.execAsync('PRAGMA user_version = 4');
}
