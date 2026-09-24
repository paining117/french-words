import type { Connection } from '../db/connection';
import type { Word } from '../types/word';
import type { DictionaryEntry, Direction } from '../types/dictionary';
import { escapeLike, normalizeFrench, foldFrenchSearch } from '../utils/normalizeFrench';

/** Attribution stays accessible in About, away from learning and dictionary cards. */
export function getExampleCredits(db: Connection, page: number) {
  return db.getAllAsync<DictionaryEntry['examples'][number]>(`SELECT DISTINCT french, chinese, source, source_ref, attribution
    FROM examples WHERE source = 'tatoeba' ORDER BY french, chinese, source_ref, attribution LIMIT 50 OFFSET ?`, Math.max(0, page) * 50);
}

export async function findWords(db: Connection, query: string, direction: Direction): Promise<Word[]> {
  const term = normalizeFrench(query);
  if (!term) return [];
  if (direction === 'fr-zh') {
    const folded = foldFrenchSearch(query), prefix = `${escapeLike(folded)}%`, contains = `%${escapeLike(folded)}%`;
    if (!folded) return [];
    return db.getAllAsync<Word>(`SELECT * FROM words
      WHERE search_key LIKE ? ESCAPE '\\' OR display_search_key LIKE ? ESCAPE '\\'
      ORDER BY CASE WHEN normalized_lemma = ? THEN 0 WHEN search_key = ? THEN 1
        WHEN search_key LIKE ? ESCAPE '\\' THEN 2 WHEN display_search_key LIKE ? ESCAPE '\\' THEN 3 ELSE 4 END,
      normalized_lemma, id LIMIT 20`, contains, contains, term, folded, prefix, prefix);
  }
  return db.getAllAsync<Word>(`SELECT * FROM words WHERE primary_meaning_zh LIKE ? ESCAPE '\\'
    OR EXISTS (SELECT 1 FROM meanings m WHERE m.word_id = words.id AND m.meaning_zh LIKE ? ESCAPE '\\')
    ORDER BY CASE WHEN primary_meaning_zh = ? THEN 0 ELSE 1 END, normalized_lemma, id LIMIT 20`, `%${escapeLike(term)}%`, `%${escapeLike(term)}%`, term);
}
export async function getDictionaryEntry(db: Connection, id: string): Promise<DictionaryEntry | null> {
  const word = await db.getFirstAsync<Word>('SELECT * FROM words WHERE id = ?', id);
  if (!word) return null;
  const meanings = await db.getAllAsync<{ meaning_zh: string }>('SELECT meaning_zh FROM meanings WHERE word_id = ? ORDER BY order_index', id);
  const examples = await db.getAllAsync<DictionaryEntry['examples'][number]>('SELECT french, chinese, source, source_ref, attribution FROM examples WHERE word_id = ? ORDER BY order_index', id);
  return { wordId: id, lemma: word.lemma, displayForm: word.display_form ?? undefined, partOfSpeech: word.part_of_speech ?? undefined, gender: word.gender ?? undefined, meaningsZh: meanings.length ? meanings.map(row => row.meaning_zh) : [word.primary_meaning_zh], examples, source: word.source === 'ai' ? 'ai' : word.source === 'freedict' ? 'freedict' : 'local', sourceLabel: word.source === 'ai' ? '历史导入词条' : word.source === 'freedict' || !!(await db.getFirstAsync('SELECT 1 FROM dictionary_word_map WHERE word_id = ? LIMIT 1', id)) ? '本地词库 · 含 FreeDict / WikDict 释义（CC BY-SA 3.0）' : '本地词库' };
}
