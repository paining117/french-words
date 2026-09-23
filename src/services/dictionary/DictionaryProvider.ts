import type { DictionaryLookupResult, Direction } from '../../types/dictionary';
export interface DictionaryProvider<T = DictionaryLookupResult> {
  lookup(query: string, direction: Direction, signal?: AbortSignal): Promise<T>;
}
