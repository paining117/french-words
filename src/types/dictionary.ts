export type Direction = 'fr-zh' | 'zh-fr';
export interface DictionaryEntry {
  wordId?: string;
  lemma: string;
  displayForm?: string;
  partOfSpeech?: string;
  gender?: 'm' | 'f';
  ipa?: string;
  meaningsZh: string[];
  examples: { french: string; chinese: string; source?: string; source_ref?: string | null; attribution?: string | null }[];
  sourceLabel?: string;
  source?: 'local' | 'ai' | 'freedict';
}
export interface DictionaryLookupResult {
  query: string;
  direction: Direction;
  provider: 'local';
  entries: DictionaryEntry[];
}
