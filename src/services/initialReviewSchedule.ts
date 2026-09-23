import type { Connection, Database } from '../db/connection';
import { getCardByWordId, updateCard } from '../repositories/cardRepository';
import { deserializeFsrsCard, serializeFsrsCard } from './fsrs/serializeCard';
import { localDayBounds } from '../utils/date';
import { appNow } from '../utils/appClock';

/** Product rule for the first review only; later formal reviews use FSRS. */
export function initialReviewDays(ratings: readonly number[]): 1 | 3 | 5 {
  if (!ratings.length || ratings.some(rating => ![1, 2, 3].includes(rating))) throw new Error('Invalid initial study ratings');
  if (ratings[0] === 1 || ratings.length >= 5) return 1;
  // Before mastery, keep a next-day fallback; only three consecutive successes
  // finish the new three-star flow. Reopening a prompt does not add an attempt.
  if (ratings.length < 3 || !ratings.slice(-3).every(rating => rating === 3)) return 1;
  return ratings.length === 3 ? 5 : 3;
}
export function firstReviewDue(lastStudyAt: Date, days: number): Date {
  if (!Number.isFinite(lastStudyAt.getTime()) || !Number.isInteger(days) || days < 1) throw new Error('Invalid initial review date');
  // Local midnight, not a fixed number of milliseconds: works across DST.
  return new Date(lastStudyAt.getFullYear(), lastStudyAt.getMonth(), lastStudyAt.getDate() + days);
}
export async function applyInitialReviewSchedule(db: Connection, wordId: string): Promise<void> {
  const stored = await getCardByWordId(db, wordId);
  if (!stored || stored.origin !== 'study') return;
  // Never overwrite a real long-term review schedule.
  if (await db.getFirstAsync("SELECT id FROM review_logs WHERE word_id = ? AND context = 'review' LIMIT 1", wordId)) return;
  const logs = await db.getAllAsync<{ rating: number; reviewed_at: string }>("SELECT rating, reviewed_at FROM review_logs WHERE word_id = ? AND context = 'study' AND reviewed_at >= ? ORDER BY reviewed_at, rowid", wordId, stored.first_learned_at ?? stored.created_at);
  if (!logs.length) return;
  const days = initialReviewDays(logs.map(log => log.rating));
  const due = firstReviewDue(new Date(logs[logs.length - 1].reviewed_at), days);
  const card = deserializeFsrsCard(stored.fsrs_card_json);
  if (stored.due_at === due.toISOString() && card.due.getTime() === due.getTime() && card.scheduled_days === days) return;
  card.due = due;
  card.scheduled_days = days;
  await updateCard(db, { ...stored, due_at: due.toISOString(), fsrs_card_json: serializeFsrsCard(card) });
}

/** Bring today's already-scored new words onto the new rule at app startup. */
export async function reconcileTodaysInitialReviews(db: Database, now = appNow()): Promise<void> {
  const { start, end } = localDayBounds(now);
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ word_id: string }>(`SELECT word_id FROM cards WHERE origin = 'study'
      AND COALESCE(first_learned_at, created_at) >= ? AND COALESCE(first_learned_at, created_at) < ?
      AND EXISTS (SELECT 1 FROM study_rounds r, json_each(r.state_json, '$.words') w
        WHERE json_extract(r.state_json, '$.reinforcementVersion') = 3 AND json_extract(w.value, '$.wordId') = cards.word_id)`, start, end);
    for (const row of rows) await applyInitialReviewSchedule(db, row.word_id);
  });
}
