import type { Connection } from '../db/connection';
import type { DictionaryEntry, Direction } from '../types/dictionary';
import { getSearchHistory } from '../repositories/searchRepository';
import { getDictionaryEntry } from '../repositories/wordRepository';
import { LocalDictionaryProvider } from './dictionary/LocalDictionaryProvider';
import { foldFrenchSearch } from '../utils/normalizeFrench';

/** Keep the original query/direction, including ambiguous prefixes, for replay. */
export async function getSearchHistoryItems(db: Connection) {
  const rows = await getSearchHistory(db);
  const provider = new LocalDictionaryProvider(db);
  return Promise.all(rows.map(async row => {
    if (row.id.startsWith('entry:')) return { ...row, entry: await getDictionaryEntry(db, row.id.slice(6)) };
    // Optional selected ID fits in the existing text key; no schema change.
    let identity: unknown;
    try { identity = JSON.parse(row.id); } catch { /* Legacy arbitrary IDs use exact matching below. */ }
    if (Array.isArray(identity) && typeof identity[2] === 'string') return { ...row, entry: await getDictionaryEntry(db, identity[2]) };
    const result = await provider.lookup(row.query, row.direction);
    const exact = exactDictionaryMatches(result.entries, row.query, row.direction);
    return { ...row, entry: exact.length === 1 ? exact[0] : null };
  }));
}

export function exactDictionaryMatches(entries: DictionaryEntry[], query: string, direction: Direction): DictionaryEntry[] {
  const value = query.trim();
  if (!value) return [];
  if (direction === 'zh-fr') return entries.filter(entry => entry.meaningsZh.some(meaning => meaning.trim() === value));
  const folded = foldFrenchSearch(value);
  return entries.filter(entry => [entry.lemma, entry.displayForm ?? ''].some(form => foldFrenchSearch(form) === folded));
}

export async function getDictionaryHistory(db: Connection): Promise<DictionaryEntry[]> {
  const history = await getSearchHistory(db);
  const provider = new LocalDictionaryProvider(db);
  const entries = await Promise.all(history.map(async row => {
    if (row.id.startsWith('entry:')) return getDictionaryEntry(db, row.id.slice('entry:'.length));
    // Old versions stored input text. Only resolve a unique exact match; never
    // invent a selected word for an ambiguous fragment or homograph.
    const result = await provider.lookup(row.query, row.direction);
    const exact = exactDictionaryMatches(result.entries, row.query, row.direction);
    return exact.length === 1 ? exact[0] : null;
  }));
  const seen = new Set<string>();
  return entries.filter((entry): entry is DictionaryEntry => {
    if (!entry?.wordId || seen.has(entry.wordId)) return false;
    seen.add(entry.wordId); return true;
  });
}
