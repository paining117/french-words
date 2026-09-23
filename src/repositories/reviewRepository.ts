import type { Connection } from '../db/connection';
export interface StoredReviewLog {
  id: string;
  word_id: string;
  rating: number;
  context: 'study' | 'review';
  reviewed_at: string;
  fsrs_log_json: string;
}
export async function countReviewLogs(db: Connection): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM review_logs');
  return row?.count ?? 0;
}
export function getReviewLog(db: Connection, id: string): Promise<StoredReviewLog | null> {
  return db.getFirstAsync<StoredReviewLog>('SELECT * FROM review_logs WHERE id = ?', id);
}
export async function insertReviewLog(db: Connection, log: StoredReviewLog): Promise<void> {
  await db.runAsync(`INSERT INTO review_logs (id, word_id, rating, context, reviewed_at, fsrs_log_json)
    VALUES (?, ?, ?, ?, ?, ?)`, log.id, log.word_id, log.rating, log.context, log.reviewed_at, log.fsrs_log_json);
}
