import type { Database, Connection } from './connection';
import type { DatasetBundle, DatasetWord } from '../types/dataset';
import { foldFrenchSearch, normalizeFrench } from '../utils/normalizeFrench';

type Value = string | number | null;
async function insertRows(db: Connection, table: string, columns: string[], rows: Value[][]) {
  const size = Math.floor(900 / columns.length);
  for (let start = 0; start < rows.length; start += size) {
    const batch = rows.slice(start, start + size);
    await db.runAsync(`INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES ${batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',')}`, ...batch.flat());
  }
}
interface Existing { id: string; normalized_lemma: string; part_of_speech: string | null; gender: string | null; homograph_key: string; source: string }
const identity = (lemma: string, pos: string) => JSON.stringify([lemma, pos]);

/** Startup only, before consumers mount. No cards, logs, sessions or FSRS calls. */
export async function importOfflineDataset(db: Database, dataset: DatasetBundle): Promise<boolean> {
  const completed = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'dictionary_dataset_version'");
  if (completed?.value === dataset.version) return false;
  const cursor = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'dictionary_import_progress'");
  const progress = cursor ? JSON.parse(cursor.value) as { version: string; nextChunk: number } : null;
  const start = progress?.version === dataset.version ? progress.nextChunk : 0;
  const existing = await db.getAllAsync<Existing>('SELECT id, normalized_lemma, part_of_speech, gender, homograph_key, source FROM words');
  const byIdentity = new Map<string, Existing[]>();
  for (const row of existing) {
    const key = identity(row.normalized_lemma, row.part_of_speech ?? '');
    const list = byIdentity.get(key) ?? []; list.push(row); byIdentity.set(key, list);
  }
  const mappings = await db.getAllAsync<{ source_id: string; word_id: string }>('SELECT * FROM dictionary_word_map');
  const ids = new Map(mappings.map(row => [row.source_id, row.word_id]));
  const now = new Date().toISOString();
  for (let i = start; i < dataset.chunks.length; i++) {
    const chunk = dataset.chunks[i]();
    await db.withTransactionAsync(async () => {
      const wordRows: Value[][] = [], mapRows: Value[][] = [];
      const resolved: { word: DatasetWord; id: string }[] = [];
      for (const word of chunk) {
        let id = ids.get(word.id);
        if (!id) {
          const candidates = byIdentity.get(identity(word.normalizedLemma, word.partOfSpeech)) ?? [];
          const same = candidates.find(row => row.homograph_key === word.homograph && (!word.homograph || !word.gender || !row.gender || row.gender === word.gender))
            ?? (word.homograph ? candidates.find(row => !row.homograph_key && row.gender === word.gender) : undefined);
          id = same?.id ?? word.id;
          if (same) {
            // Only fill absent curated metadata; never replace an existing primary meaning.
            await db.runAsync(`UPDATE words SET gender = COALESCE(NULLIF(gender,''), ?),
              display_form = COALESCE(NULLIF(display_form,''), ?),
              homograph_key = ?, cefr_level = COALESCE(NULLIF(cefr_level,''), ?)
              WHERE id = ?`, word.gender ?? null, word.displayForm ?? null, word.homograph, word.cefrLevel ?? null, id);
            if (word.displayForm) await db.runAsync(`UPDATE words SET normalized_display_form = ?, display_search_key = ? WHERE id = ? AND display_form = ?`, normalizeFrench(word.displayForm), foldFrenchSearch(word.displayForm), id, word.displayForm);
          } else {
            wordRows.push([id, word.lemma, word.normalizedLemma, word.displayForm ?? null, normalizeFrench(word.displayForm ?? ''), word.partOfSpeech, word.gender ?? null, word.meaningsZh[0], word.cefrLevel ?? null, 'freedict', word.sourceRef, now, word.searchKey, foldFrenchSearch(word.displayForm ?? ''), word.homograph]);
          }
          mapRows.push([word.id, id]); ids.set(word.id, id);
        }
        resolved.push({ word, id });
      }
      await insertRows(db, 'words', ['id','lemma','normalized_lemma','display_form','normalized_display_form','part_of_speech','gender','primary_meaning_zh','cefr_level','source','source_ref','created_at','search_key','display_search_key','homograph_key'], wordRows);
      await insertRows(db, 'dictionary_word_map', ['source_id','word_id'], mapRows);
      // A later official CEFR download can enrich already imported source IDs.
      for (const { word, id } of resolved) if (word.cefrLevel) await db.runAsync("UPDATE words SET cefr_level = ? WHERE id = ? AND (cefr_level IS NULL OR cefr_level = '')", word.cefrLevel, id);
      const placeholders = resolved.map(() => '?').join(',');
      if (resolved.length) {
        const meanings = await db.getAllAsync<{ word_id: string; meaning_zh: string; order_index: number }>(`SELECT word_id, meaning_zh, order_index FROM meanings WHERE word_id IN (${placeholders})`, ...resolved.map(r => r.id));
        const examples = await db.getAllAsync<{ word_id: string }>(`SELECT DISTINCT word_id FROM examples WHERE word_id IN (${placeholders})`, ...resolved.map(r => r.id));
        const hasExample = new Set(examples.map(e => e.word_id));
        const meaningRows: Value[][] = [], exampleRows: Value[][] = [];
        for (const { word, id } of resolved) {
          const old = meanings.filter(m => m.word_id === id), seen = new Set(old.map(m => m.meaning_zh));
          let order = Math.max(-1, ...old.map(m => m.order_index)) + 1;
          word.meaningsZh.forEach(meaning => {
            // Meaning text, not its source position: reordering a later release must not hide new senses.
            if (!seen.has(meaning)) { meaningRows.push([`${word.id}:freedict:${meaning}`, id, meaning, order++]); seen.add(meaning); }
          });
          if (!hasExample.has(id)) for (const example of word.examples.slice(0, 1)) exampleRows.push([`${word.id}:tatoeba`, id, example.french, example.chinese, example.source, example.sourceRef, example.attribution ?? null, 0]);
        }
        await insertRows(db, 'meanings', ['id','word_id','meaning_zh','order_index'], meaningRows);
        await insertRows(db, 'examples', ['id','word_id','french','chinese','source','source_ref','attribution','order_index'], exampleRows);
      }
      await db.runAsync("INSERT OR REPLACE INTO settings (key,value) VALUES ('dictionary_import_progress', ?)", JSON.stringify({ version: dataset.version, nextChunk: i + 1 }));
    });
    // Yield between bounded transactions to keep the preparation screen responsive.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  await db.withTransactionAsync(async () => {
    for (const book of dataset.books) {
      await db.runAsync(`INSERT INTO word_books (id,name,level,description,built_in,created_at) VALUES (?,?,?,?,1,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, level=excluded.level, description=excluded.description`, book.id, book.name, book.level, 'FreeDict 释义 · FLELex / Beacco 分级；保留已有词书关系', now);
      const prior = await db.getAllAsync<{ word_id: string; order_index: number }>('SELECT word_id, order_index FROM word_book_words WHERE book_id = ?', book.id);
      const seen = new Set(prior.map(row => row.word_id)); let order = Math.max(-1, ...prior.map(row => row.order_index)) + 1;
      const rows: Value[][] = [];
      for (const sourceId of book.wordIds) {
        const id = ids.get(sourceId); if (!id) throw Error(`Missing dictionary identity: ${sourceId}`);
        if (!seen.has(id)) { rows.push([book.id, id, order++]); seen.add(id); }
      }
      await insertRows(db, 'word_book_words', ['book_id','word_id','order_index'], rows);
    }
    await db.runAsync("INSERT OR REPLACE INTO settings (key,value) VALUES ('dictionary_dataset_version', ?)", dataset.version);
    await db.runAsync("DELETE FROM settings WHERE key = 'dictionary_import_progress'");
  });
  return true;
}
