import type { Connection } from '../../db/connection';
import { findWords, getDictionaryEntry } from '../../repositories/wordRepository';
import type { DictionaryEntry, DictionaryLookupResult, Direction } from '../../types/dictionary';
import type { DictionaryProvider } from './DictionaryProvider';
export class LocalDictionaryProvider implements DictionaryProvider {
  constructor(private readonly db: Connection) {}
  async suggest(query: string, direction: Direction): Promise<DictionaryLookupResult> {
    const words = await findWords(this.db, query, direction);
    return { query: query.trim(), direction, provider: 'local', entries: words.map(word => ({
      wordId: word.id, lemma: word.lemma, displayForm: word.display_form ?? undefined,
      partOfSpeech: word.part_of_speech ?? undefined, gender: word.gender ?? undefined,
      meaningsZh: [word.primary_meaning_zh], examples: [], source: word.source === 'ai' ? 'ai' : word.source === 'freedict' ? 'freedict' : 'local', sourceLabel: word.source === 'ai' ? 'AI 补充' : undefined,
    })) };
  }
  async lookup(query: string, direction: Direction): Promise<DictionaryLookupResult> {
    const words = await findWords(this.db, query, direction);
    const entries = await Promise.all(words.map(word => getDictionaryEntry(this.db, word.id)));
    return { query: query.trim(), direction, provider: 'local', entries: entries.filter((entry): entry is DictionaryEntry => entry !== null) };
  }
}
