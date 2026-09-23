import type { Database, Connection } from '../db/connection';
import type { Direction } from '../types/dictionary';
import { normalizeFrench } from '../utils/normalizeFrench';
import { appNow } from '../utils/appClock';
export interface SearchHistory { id: string; query: string; direction: Direction; searched_at: string }
export function getSearchHistory(db: Connection): Promise<SearchHistory[]> {
  return db.getAllAsync<SearchHistory>('SELECT * FROM search_history ORDER BY searched_at DESC, rowid DESC LIMIT 20');
}
export async function clearSearchHistory(db: Connection): Promise<void> {
  await db.runAsync('DELETE FROM search_history');
}
export async function saveSearch(db: Database, query: string, direction: Direction, now = appNow(), selectedWordId?: string): Promise<void> {
  const normalized = normalizeFrench(query);
  if (!normalized) return;
  const id = JSON.stringify(selectedWordId ? [direction, normalized, selectedWordId] : [direction, normalized]);
  await db.withExclusiveTransactionAsync(async tx => {
    if (selectedWordId && !await tx.getFirstAsync('SELECT id FROM words WHERE id = ?', selectedWordId)) throw new Error('Selected word missing');
    await tx.runAsync('INSERT OR REPLACE INTO search_history (id, query, direction, searched_at) VALUES (?, ?, ?, ?)', id, query.trim(), direction, now.toISOString());
    // Consolidate legacy entry:<wordId> records with the newly saved query.
    const rows = await tx.getAllAsync<SearchHistory>('SELECT * FROM search_history WHERE direction = ?', direction);
    for (const row of rows) if (row.id !== id && normalizeFrench(row.query) === normalized) await tx.runAsync('DELETE FROM search_history WHERE id = ?', row.id);
    await tx.runAsync('DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history ORDER BY searched_at DESC, rowid DESC LIMIT 20)');
  });
}

/** The existing text primary key can identify either a query or a selected word.
 * Word identity preserves homographs with different parts of speech. */
export async function saveWordSearch(db: Database, wordId: string, now = appNow()): Promise<void> {
  await db.withExclusiveTransactionAsync(async tx => {
    const word = await tx.getFirstAsync<{ lemma: string }>('SELECT lemma FROM words WHERE id = ?', wordId);
    if (!word) return;
    await tx.runAsync("INSERT OR REPLACE INTO search_history (id, query, direction, searched_at) VALUES (?, ?, 'fr-zh', ?)", `entry:${wordId}`, word.lemma, now.toISOString());
    await tx.runAsync('DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history ORDER BY searched_at DESC, rowid DESC LIMIT 20)');
  });
}
