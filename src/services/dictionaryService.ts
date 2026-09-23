import type { Connection } from '../db/connection';
import type { DictionaryEntry, Direction } from '../types/dictionary';
import { LocalDictionaryProvider } from './dictionary/LocalDictionaryProvider';

/** Live suggestions are read-only; typing fragments must not fill the history. */
export async function suggestLocal(db: Connection, query: string, direction: Direction): Promise<DictionaryEntry[]> {
  return (await new LocalDictionaryProvider(db).suggest(query, direction)).entries;
}
export async function lookupLocal(db: Connection, query: string, direction: Direction) {
  const result = await new LocalDictionaryProvider(db).lookup(query, direction);
  return result;
}
