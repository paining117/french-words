import type { Connection } from '../db/connection';
import type { Session } from '../types/session';
import type { StudySummary } from '../types/study';
export function getRecentSessions(db: Connection): Promise<Session[]> {
  return db.getAllAsync<Session>('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 20');
}
export async function createStudySession(db: Connection, id: string, now: Date): Promise<void> {
  await db.runAsync("INSERT INTO sessions (id, type, started_at) VALUES (?, 'study', ?)", id, now.toISOString());
}
export async function createReviewSession(db: Connection, id: string, now: Date, total: number): Promise<void> {
  await db.runAsync("INSERT INTO sessions (id, type, started_at, total_count) VALUES (?, 'review', ?, ?)", id, now.toISOString(), total);
}
export async function lockReviewSession(db: Connection, id: string): Promise<void> {
  const result = await db.runAsync("UPDATE sessions SET total_count = total_count WHERE id = ? AND type = 'review'", id);
  if (result.changes !== 1) throw new Error('Review session missing');
}
export async function recordReviewRating(db: Connection, id: string, rating: number): Promise<void> {
  if (![1, 2, 3].includes(rating)) throw new Error('Invalid review rating');
  const result = await db.runAsync(`UPDATE sessions SET good_count = good_count + ?, hard_count = hard_count + ?, again_count = again_count + ?
    WHERE id = ? AND type = 'review' AND ended_at IS NULL AND good_count + hard_count + again_count + manual_count < total_count`, Number(rating === 3), Number(rating === 2), Number(rating === 1), id);
  if (result.changes !== 1) throw new Error('Review session is not active');
}
export async function completeReviewSession(db: Connection, id: string, now: Date): Promise<void> {
  const result = await db.runAsync(`UPDATE sessions SET ended_at = COALESCE(ended_at, ?) WHERE id = ? AND type = 'review'
    AND good_count + hard_count + again_count + manual_count = total_count`, now.toISOString(), id);
  if (result.changes !== 1) throw new Error('Review session is incomplete');
}
export async function getSession(db: Connection, id: string): Promise<Session> {
  const session = await db.getFirstAsync<Session>('SELECT * FROM sessions WHERE id = ?', id);
  if (!session) throw new Error('Session not found');
  return session;
}
export async function lockStudySession(db: Connection, id: string): Promise<void> {
  // First statement in the rating transaction is a write, before quota/card reads.
  const result = await db.runAsync("UPDATE sessions SET total_count = total_count WHERE id = ? AND type = 'study' AND ended_at IS NULL", id);
  if (result.changes !== 1) throw new Error('Study session is not active');
}
export async function recordFirstRating(db: Connection, id: string, rating: number): Promise<void> {
  if (![1, 2, 3].includes(rating)) throw new Error('Invalid study rating');
  const result = await db.runAsync(`UPDATE sessions SET total_count = total_count + 1,
    good_count = good_count + ?, hard_count = hard_count + ?, again_count = again_count + ?
    WHERE id = ? AND ended_at IS NULL`, Number(rating === 3), Number(rating === 2), Number(rating === 1), id);
  if (result.changes !== 1) throw new Error('Study session is not active');
}
export async function completeStudySession(db: Connection, id: string, summary: StudySummary, now: Date): Promise<void> {
  await db.runAsync(`UPDATE sessions SET ended_at = COALESCE(ended_at, ?), total_count = ?, good_count = ?, hard_count = ?, again_count = ? WHERE id = ? AND type = 'study'`, now.toISOString(), summary.total_count, summary.good_count, summary.hard_count, summary.again_count, id);
}
