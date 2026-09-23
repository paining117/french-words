import type { Connection, Database } from '../db/connection';
import { getDueCards, getCardByWordId, updateCard } from '../repositories/cardRepository';
import { getDictionaryEntry } from '../repositories/wordRepository';
import { getReviewLog, insertReviewLog } from '../repositories/reviewRepository';
import { createReviewSession, getSession, lockReviewSession, recordReviewRating, completeReviewSession } from '../repositories/sessionRepository';
import { firstReviewDue } from './initialReviewSchedule';
import { deserializeFsrsCard, serializeFsrsCard } from './fsrs/serializeCard';
import { getRetrievability, reviewFsrsCard, fsrsRatingToUserRating } from './fsrs/fsrs';
import { prepareMeaningChoices } from './meaningChoices';
import { advanceStudyQueue, completesMastery, starsAfterAnswer, studyPhase } from './studyQueue';
import { checkIn } from './checkinService';
import { getReviewStats } from './statsService';
import { markFamiliarInTransaction } from './familiarService';
import { appNow } from '../utils/appClock';
import { logError } from '../utils/logger';
import type { ReviewQueueItem, ReviewSnapshot } from '../types/review';
import type { StudyReviewWord, StudySummary, StudyWord, UserRating } from '../types/study';

export class ReviewConflictError extends Error {}
export const REVIEW_ROUND_SIZE = 20;
export function sortReviewQueue(items: ReviewQueueItem[]): ReviewQueueItem[] {
  // If any prediction is unavailable, due order for the entire snapshot avoids
  // a non-transitive mixed comparator and still prioritizes overdue cards.
  const fallback = items.some(item => item.retrievability === null);
  return [...items].sort((a, b) => {
    if (!fallback) {
      const difference = a.retrievability! - b.retrievability!;
      if (Math.abs(difference) > 1e-9) return difference;
    }
    return a.card.due_at.localeCompare(b.card.due_at) || a.word.wordId.localeCompare(b.word.wordId);
  });
}
export async function loadReviewQueue(db: Connection, now: Date): Promise<{ queue: ReviewQueueItem[]; skipped: number }> {
  const items: ReviewQueueItem[] = [];
  let skipped = 0;
  for (const stored of await getDueCards(db, now)) {
    try {
      const card = deserializeFsrsCard(stored.fsrs_card_json);
      const word = await getDictionaryEntry(db, stored.word_id);
      if (!word) throw new Error('Word missing');
      let retrievability: number | null = null;
      try { retrievability = getRetrievability(card, now); }
      catch (error) { logError({ wordId: stored.word_id, error }); }
      items.push({ word: { ...word, wordId: stored.word_id }, card: stored, retrievability, attempt: 1, phase: 'choice', stars: 0 });
    } catch (error) { skipped++; logError({ wordId: stored.word_id, error }); }
  }
  const selected = sortReviewQueue(items).slice(0, REVIEW_ROUND_SIZE);
  const prepared = await prepareMeaningChoices(db, selected.map(item => item.word));
  return { queue: selected.map((item, index) => ({ ...item, word: prepared[index] })), skipped };
}
export type ReviewStartResult = { kind: 'empty'; skipped: number } | { kind: 'session'; session: ReviewSession; skipped: number };
export async function startReview(db: Database, dependencies: { createId: () => string; now?: () => Date }): Promise<ReviewStartResult> {
  const now = dependencies.now ?? appNow;
  const startedAt = now();
  let result: ReviewStartResult = { kind: 'empty', skipped: 0 };
  await db.withExclusiveTransactionAsync(async tx => {
    const { queue, skipped } = await loadReviewQueue(tx, startedAt);
    if (!queue.length) { result = { kind: 'empty', skipped }; return; }
    const id = dependencies.createId();
    await createReviewSession(tx, id, startedAt, queue.length);
    result = { kind: 'session', skipped, session: new ReviewSession(db, id, queue, now) };
  });
  return result;
}

export class ReviewSession {
  private snapshot: ReviewSnapshot;
  private pending: Promise<ReviewSnapshot> | null = null;
  private readonly total: number;
  private readonly roundWords: StudyWord[];
  private readonly mastered = new Set<string>();
  private readonly submittedChoices = new Map<string, string>();
  constructor(private readonly db: Database, readonly id: string, private queue: ReviewQueueItem[], private readonly now: () => Date) {
    this.total = queue.length;
    this.roundWords = queue.map(item => item.word);
    this.snapshot = this.prompt({ total_count: queue.length, good_count: 0, hard_count: 0, again_count: 0 });
  }
  private prompt(summary: StudySummary): ReviewSnapshot {
    const item = this.queue[0];
    return { status: 'prompt', item, token: JSON.stringify(['review', this.id, item.word.wordId, item.attempt]), total: this.total, reviewedCount: this.mastered.size, summary };
  }
  getSnapshot(): ReviewSnapshot { return this.snapshot; }
  private singleFlight(operation: () => Promise<ReviewSnapshot>): Promise<ReviewSnapshot> {
    if (this.pending) return this.pending;
    this.pending = operation().finally(() => { this.pending = null; });
    return this.pending;
  }
  submitRating(token: string, rating: UserRating): Promise<ReviewSnapshot> {
    return this.submitAnswer(token, rating);
  }
  submitChoice(token: string, choiceId: string): Promise<ReviewSnapshot> {
    return this.submitAnswer(token, { choiceId });
  }
  private submitAnswer(token: string, answer: UserRating | { choiceId: string }): Promise<ReviewSnapshot> {
    return this.singleFlight(async () => {
      const current = this.snapshot;
      if (current.status !== 'prompt' || current.token !== token) return current;
      let choiceId = typeof answer === 'object' ? answer.choiceId : undefined;
      if (studyPhase(current.item) === 'choice') {
        if (answer !== 'unknown' && answer !== 'uncertain' && (!choiceId || !current.item.word.meaningChoices?.some(choice => choice.id === choiceId))) throw new Error('Select a valid meaning option');
      } else if (choiceId !== undefined) throw new Error('This stage is not a meaning choice');
      let rating: UserRating = typeof answer === 'string' ? answer : choiceId === current.item.word.wordId ? 'known' : 'unknown';
      let summary = current.summary;
      // Only the first recall measures long-term retention. Later three-star
      // practice changes this in-memory round, not FSRS or formal statistics.
      if (current.item.attempt === 1) await this.db.withExclusiveTransactionAsync(async tx => {
          await lockReviewSession(tx, this.id);
          const receipt = await getReviewLog(tx, token);
          if (receipt) {
            rating = fsrsRatingToUserRating(receipt.rating);
            choiceId = this.submittedChoices.get(token);
          } else {
            const stored = await getCardByWordId(tx, current.item.word.wordId);
            if (!stored || stored.suspended || stored.fsrs_card_json !== current.item.card.fsrs_card_json || stored.due_at !== current.item.card.due_at) throw new ReviewConflictError('Card changed since snapshot');
            const now = this.now();
            const result = reviewFsrsCard(stored.fsrs_card_json, rating, now);
            const scheduled = deserializeFsrsCard(result.serializedCard);
            const earliest = firstReviewDue(now, 1);
            if (scheduled.due < earliest) {
              scheduled.due = earliest;
              scheduled.scheduled_days = Math.max(1, scheduled.scheduled_days);
            }
            await updateCard(tx, { ...stored, fsrs_card_json: serializeFsrsCard(scheduled), due_at: scheduled.due.toISOString(), last_review_at: result.lastReviewAt });
            await insertReviewLog(tx, { id: token, word_id: stored.word_id, rating: result.rating, context: 'review', reviewed_at: now.toISOString(), fsrs_log_json: result.serializedLog });
            await recordReviewRating(tx, this.id, result.rating);
            if (choiceId) this.submittedChoices.set(token, choiceId); else this.submittedChoices.delete(token);
          }
          summary = await getSession(tx, this.id);
        });
      const directMastery = current.item.attempt === 1 && rating === 'known';
      const mastered = directMastery || completesMastery(current.item, rating);
      if (mastered) this.mastered.add(current.item.word.wordId);
      const byId = new Map(this.queue.map(item => [item.word.wordId, item]));
      this.queue = directMastery ? this.queue.slice(1) : advanceStudyQueue(this.queue, rating).map(item => ({ ...byId.get(item.word.wordId)!, ...item }));
      this.snapshot = { ...current, status: 'answer', item: { ...current.item, stars: directMastery ? 3 : starsAfterAnswer(current.item, rating) }, summary, reviewedCount: this.mastered.size, answerRating: rating, selectedChoiceId: choiceId };
      return this.snapshot;
    });
  }
  markFamiliar(token: string): Promise<ReviewSnapshot> {
    return this.singleFlight(async () => {
      const current = this.snapshot;
      if (current.status === 'completed' || current.token !== token || current.familiar) return current;
      let summary = current.summary;
      await this.db.withExclusiveTransactionAsync(async tx => {
        await lockReviewSession(tx, this.id);
        if (current.status === 'prompt' && current.item.attempt === 1 && !await tx.getFirstAsync('SELECT token FROM familiar_actions WHERE token = ?', token)) {
          const stored = await getCardByWordId(tx, current.item.word.wordId);
          if (!stored || stored.suspended || stored.fsrs_card_json !== current.item.card.fsrs_card_json || stored.due_at !== current.item.card.due_at) throw new ReviewConflictError('Card changed since snapshot');
        }
        await markFamiliarInTransaction(tx, current.item.word.wordId, this.id, token, 'review',
          current.status === 'answer' || current.item.attempt > 1, this.now(), { queue: [], wasMastered: false });
        summary = await getSession(tx, this.id);
      });
      this.mastered.add(current.item.word.wordId);
      this.queue = this.queue.filter(item => item.word.wordId !== current.item.word.wordId);
      this.snapshot = { ...current, status: 'answer', familiar: true, selectedChoiceId: undefined, summary, reviewedCount: this.mastered.size };
      return this.snapshot;
    });
  }
  continue(token: string): Promise<ReviewSnapshot> {
    return this.singleFlight(async () => {
      const current = this.snapshot;
      if (current.status !== 'answer' || current.token !== token) return current;
      if (this.queue.length) {
        this.snapshot = this.prompt(current.summary);
      } else {
        const words: StudyReviewWord[] = [];
        let reviewedToday = 0;
        await this.db.withExclusiveTransactionAsync(async tx => {
          await lockReviewSession(tx, this.id);
          const now = this.now();
          for (const word of this.roundWords) {
            const card = await getCardByWordId(tx, word.wordId);
            if (!card) throw new ReviewConflictError('Summary card missing');
            words.push({ wordId: word.wordId, lemma: word.lemma, ...(word.partOfSpeech ? { partOfSpeech: word.partOfSpeech } : {}), ...(word.gender ? { gender: word.gender } : {}), meaning: word.meaningsZh[0] ?? '', dueAt: card.due_at, suspended: !!card.suspended });
          }
          reviewedToday = (await getReviewStats(tx, now)).today;
          await completeReviewSession(tx, this.id, now);
          await checkIn(tx, now);
        });
        this.snapshot = { status: 'completed', total: this.total, reviewedCount: this.mastered.size, summary: current.summary, words, reviewedToday };
      }
      return this.snapshot;
    });
  }
}
