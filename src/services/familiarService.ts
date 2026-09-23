import { createEmptyCard } from 'ts-fsrs';
import type { Connection, Database } from '../db/connection';
import { getCardByWordId, insertCard, updateCard } from '../repositories/cardRepository';
import { getStudyRoundById, saveStudyRound } from '../repositories/studyRoundRepository';
import type { StoredCard } from '../types/fsrs';
import type { StudyQueueItem } from '../types/study';
import { deserializeFsrsCard, serializeFsrsCard } from './fsrs/serializeCard';
import { firstReviewDue } from './initialReviewSchedule';
import { studyAttemptId } from './studyQueue';
import { assertWordClassification, FAMILIAR_BOOK_ID } from '../repositories/wordBookRepository';

export { FAMILIAR_BOOK_ID } from '../repositories/wordBookRepository';
interface Restore { queue: StudyQueueItem[]; wasMastered: boolean; counted: boolean }
interface Mark { previous_card_json: string | null; marked_card_json: string; round_id: string; restore_json: string; marked_at: string }

/** The session owns this transaction: marking, accounting and queue changes commit together. */
export async function markFamiliarInTransaction(tx: Connection, wordId: string, sessionId: string, token: string,
  type: 'study' | 'review', counted: boolean, now: Date, restore: Omit<Restore, 'counted'>): Promise<void> {
  const receipt = await tx.getFirstAsync('SELECT token FROM familiar_actions WHERE token = ?', token);
  if (receipt) return;
  await assertWordClassification(tx, wordId, 'familiar');
  const previous = await getCardByWordId(tx, wordId);
  const fsrs = previous ? deserializeFsrsCard(previous.fsrs_card_json) : createEmptyCard(now);
  fsrs.due = firstReviewDue(now, 30);
  fsrs.scheduled_days = 30;
  const card: StoredCard = previous ? { ...previous, due_at: fsrs.due.toISOString(), fsrs_card_json: serializeFsrsCard(fsrs) } : {
    word_id: wordId, due_at: fsrs.due.toISOString(), fsrs_card_json: serializeFsrsCard(fsrs), last_review_at: null,
    first_learned_at: now.toISOString(), created_at: now.toISOString(), origin: 'familiar', suspended: 0,
  };
  if (previous) await updateCard(tx, card); else await insertCard(tx, card);
  await tx.runAsync(`INSERT INTO familiar_marks VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(word_id) DO UPDATE SET previous_card_json = excluded.previous_card_json,
      marked_card_json = excluded.marked_card_json, round_id = excluded.round_id,
      restore_json = excluded.restore_json, marked_at = excluded.marked_at`, wordId, previous ? JSON.stringify(previous) : null,
    JSON.stringify(card), sessionId, JSON.stringify({ ...restore, counted }), now.toISOString());
  await tx.runAsync(`INSERT OR IGNORE INTO word_book_words (book_id, word_id, order_index)
    SELECT ?, ?, COALESCE(MAX(order_index), -1) + 1 FROM word_book_words WHERE book_id = ?`, FAMILIAR_BOOK_ID, wordId, FAMILIAR_BOOK_ID);
  if (!counted) await tx.runAsync(`UPDATE sessions SET manual_count = manual_count + 1,
    total_count = total_count + ? WHERE id = ? AND ended_at IS NULL`, type === 'study' ? 1 : 0, sessionId);
  await tx.runAsync('INSERT INTO familiar_actions VALUES (?, ?, ?)', token, sessionId, wordId);
}

export async function undoFamiliar(db: Database, wordId: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync('UPDATE familiar_marks SET marked_at = marked_at WHERE word_id = ?', wordId);
    const mark = await tx.getFirstAsync<Mark>('SELECT * FROM familiar_marks WHERE word_id = ?', wordId);
    if (!mark) return;
    const current = await getCardByWordId(tx, wordId);
    const marked = JSON.parse(mark.marked_card_json) as StoredCard;
    // Later real learning wins over an old snapshot: never erase subsequent reviews.
    const unchanged = current?.fsrs_card_json === marked.fsrs_card_json && current?.due_at === marked.due_at;
    if (unchanged) {
      if (mark.previous_card_json) {
        const before = JSON.parse(mark.previous_card_json) as StoredCard;
        await updateCard(tx, before);
      } else {
        await tx.runAsync("DELETE FROM cards WHERE word_id = ? AND origin = 'familiar' AND NOT EXISTS (SELECT 1 FROM review_logs WHERE word_id = ?)", wordId, wordId);
      }
      const round = await getStudyRoundById(tx, mark.round_id);
      const restore = JSON.parse(mark.restore_json) as Restore;
      if (round && round.state.snapshot.status !== 'completed' && !restore.wasMastered) {
        const state = round.state;
        state.masteredIds = state.masteredIds.filter(id => id !== wordId);
        state.queue = [...state.queue.filter(item => item.word.wordId !== wordId), ...restore.queue];
        if (!restore.counted) await tx.runAsync('UPDATE sessions SET total_count = total_count - 1, manual_count = manual_count - 1 WHERE id = ?', mark.round_id);
        const snapshot = state.snapshot;
        if (snapshot.status !== 'completed') {
          const summary = { ...snapshot.summary, total_count: snapshot.summary.total_count - Number(!restore.counted) };
          state.snapshot = { ...snapshot, summary, masteredCount: state.masteredIds.length };
          if (snapshot.familiar && snapshot.item.word.wordId === wordId) {
            const item = state.queue[0];
            state.snapshot = { status: 'prompt', item, token: studyAttemptId(state.sessionId, item), total: state.words.length,
              masteredCount: state.masteredIds.length, summary, roundDate: state.date };
          }
        }
        await saveStudyRound(tx, state, round.revision);
      }
    }
    await tx.runAsync('DELETE FROM word_book_words WHERE book_id = ? AND word_id = ?', FAMILIAR_BOOK_ID, wordId);
    await tx.runAsync('DELETE FROM familiar_marks WHERE word_id = ?', wordId);
    // Undo also permits deliberately marking this same unanswered prompt again.
    await tx.runAsync('DELETE FROM familiar_actions WHERE session_id = ? AND word_id = ?', mark.round_id, wordId);
  });
}
