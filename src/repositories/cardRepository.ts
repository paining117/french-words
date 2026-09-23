import type { Connection } from '../db/connection';
import type { StoredCard } from '../types/fsrs';
import { localDayBounds } from '../utils/date';
import { appNow } from '../utils/appClock';
export async function countDueCards(db: Connection, now = appNow()): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM cards WHERE ${dueFilter}`, ...dueParameters(now));
  return row?.count ?? 0;
}
export async function countFirstLearned(db: Connection, start: string, end: string): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM cards
    WHERE COALESCE(first_learned_at, created_at) >= ? AND COALESCE(first_learned_at, created_at) < ?`, start, end);
  return row?.count ?? 0;
}
export function getCardByWordId(db: Connection, wordId: string): Promise<StoredCard | null> {
  return db.getFirstAsync<StoredCard>('SELECT * FROM cards WHERE word_id = ?', wordId);
}
export function getDueCards(db: Connection, now: Date): Promise<StoredCard[]> {
  return db.getAllAsync<StoredCard>(`SELECT * FROM cards WHERE ${dueFilter} ORDER BY due_at, word_id`, ...dueParameters(now));
}
export async function insertCard(db: Connection, card: StoredCard): Promise<void> {
  await db.runAsync(`INSERT INTO cards (word_id, fsrs_card_json, due_at, last_review_at, first_learned_at, origin, suspended, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, card.word_id, card.fsrs_card_json, card.due_at, card.last_review_at, card.first_learned_at, card.origin, card.suspended, card.created_at);
}
export async function updateCard(db: Connection, card: StoredCard): Promise<void> {
  const result = await db.runAsync(`UPDATE cards SET fsrs_card_json = ?, due_at = ?, last_review_at = ? WHERE word_id = ?`, card.fsrs_card_json, card.due_at, card.last_review_at, card.word_id);
  if (result.changes !== 1) throw new Error('Card not found');
}

// Formal reviews are global, with at most one scheduled recall per local day.
const dueFilter = `due_at <= ? AND suspended = 0 AND NOT EXISTS (
  SELECT 1 FROM review_logs r WHERE r.word_id = cards.word_id
  AND r.context = 'review' AND r.reviewed_at >= ? AND r.reviewed_at < ?)`;
function dueParameters(now: Date): [string, string, string] {
  const { start, end } = localDayBounds(now);
  return [now.toISOString(), start, end];
}
