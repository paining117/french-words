import type { Connection } from '../db/connection';
import type { DictionaryEntry } from '../types/dictionary';

export type MeaningCandidate = Pick<DictionaryEntry, 'lemma' | 'partOfSpeech' | 'gender' | 'meaningsZh'> & { wordId: string };
/** Keep all senses together: a synonym cannot become a distractor via another sense. */
export async function getLearningMeanings(db: Connection): Promise<MeaningCandidate[]> {
  const rows = await db.getAllAsync<{ id: string; lemma: string; part_of_speech: string | null; gender: 'm' | 'f' | null; meaning: string }>(`
    SELECT w.id, w.lemma, w.part_of_speech, w.gender, COALESCE(m.meaning_zh, w.primary_meaning_zh) meaning
    FROM words w LEFT JOIN meanings m ON m.word_id = w.id ORDER BY w.id, m.order_index`);
  const words = new Map<string, MeaningCandidate>();
  for (const row of rows) {
    let word = words.get(row.id);
    if (!word) {
      word = { wordId: row.id, lemma: row.lemma, partOfSpeech: row.part_of_speech ?? undefined, gender: row.gender ?? undefined, meaningsZh: [] };
      words.set(row.id, word);
    }
    word.meaningsZh.push(row.meaning);
  }
  return [...words.values()];
}
