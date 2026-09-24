import type { Connection, Database } from '../db/connection';
import { getSettings } from '../repositories/settingsRepository';
import { getBookProgress, getUnlearnedWords, getWordsByBookId } from '../repositories/wordBookRepository';
import { getDictionaryEntry } from '../repositories/wordRepository';
import { getCardByWordId, insertCard, updateCard } from '../repositories/cardRepository';
import { getReviewLog, insertReviewLog } from '../repositories/reviewRepository';
import { completeStudySession, createStudySession, getSession, lockStudySession, recordFirstRating } from '../repositories/sessionRepository';
import { getPendingStudyRound, getStudyRoundById, saveStudyRound } from '../repositories/studyRoundRepository';
import type { StoredCard } from '../types/fsrs';
import type { DailyStudyRound, StudyEmptyReason, StudyQueueItem, StudySnapshot, StudySummary, StudyWord, UserRating } from '../types/study';
import { checkIn } from './checkinService';
import { reviewFsrsCard, fsrsRatingToUserRating } from './fsrs/fsrs';
import { getStudyQuota } from './studyQuota';
import { advanceStudyQueue, completesMastery, createStudyQueue, starsAfterAnswer, studyAttemptId, studyPhase } from './studyQueue';
import { prepareMeaningChoices } from './meaningChoices';
import { localDate, localDayBounds } from '../utils/date';
import { applyInitialReviewSchedule } from './initialReviewSchedule';
import { markFamiliarInTransaction } from './familiarService';
import { appNow } from '../utils/appClock';

export type { StudySnapshot } from '../types/study';
export type StudyStartResult = { kind: 'empty'; reason: StudyEmptyReason } | { kind: 'session'; session: StudySession };
interface StudyDependencies { createId: () => string; now?: () => Date }
export class StudyConflictError extends Error {}
/** Only unscored items can leave a saved round. Scored practice/history survives removal. */
export async function filterUnavailableNewWords(db: Connection, state: DailyStudyRound, bookId: string): Promise<DailyStudyRound> {
  const eligible = new Set((await getWordsByBookId(db, bookId)).filter(word => !word.learned).map(word => word.id));
  const removed = new Set(state.queue.filter(item => item.attempt === 1 && !eligible.has(item.word.wordId)).map(item => item.word.wordId));
  if (!removed.size) return state;
  return { ...state, words: state.words.filter(word => !removed.has(word.wordId)), queue: state.queue.filter(item => !removed.has(item.word.wordId)) };
}
const emptySummary = (): StudySummary => ({ total_count: 0, good_count: 0, hard_count: 0, again_count: 0 });
function addSummary(base: StudySummary, row: StudySummary): StudySummary {
  return { total_count: base.total_count + row.total_count, good_count: base.good_count + row.good_count, hard_count: base.hard_count + row.hard_count, again_count: base.again_count + row.again_count };
}
function promptFor(state: Omit<DailyStudyRound, 'snapshot'>, summary: StudySummary): StudySnapshot {
  const item = state.queue[0];
  if (!item) throw new Error('Study queue is empty');
  return { status: 'prompt', item, token: studyAttemptId(state.sessionId, item), total: state.words.length, masteredCount: state.masteredIds.length, summary, roundDate: state.date };
}
async function completedFor(db: Connection, state: Omit<DailyStudyRound, 'snapshot'>, summary: StudySummary, now: Date): Promise<StudySnapshot> {
  const settings = await getSettings(db);
  const quota = await getStudyQuota(db, settings.dailyNewWords, now);
  const words = [];
  for (const word of state.words) {
    const card = await getCardByWordId(db, word.wordId);
    if (!card) throw new Error('Summary card missing');
    words.push({ wordId: word.wordId, lemma: word.lemma, ...(word.partOfSpeech ? { partOfSpeech: word.partOfSpeech } : {}), ...(word.gender ? { gender: word.gender } : {}), meaning: word.meaningsZh[0] ?? '', dueAt: card.due_at, suspended: !!card.suspended });
  }
  return { status: 'completed', summary, masteredCount: state.masteredIds.length, learnedToday: quota.learnedToday, roundDate: state.date, words };
}
async function hydrateWord(db: Connection, id: string): Promise<StudyWord> {
  const entry = await getDictionaryEntry(db, id);
  if (!entry) throw new Error('Study word missing');
  return { ...entry, wordId: id };
}

/** Recover today's pre-upgrade Cards/Logs without rewriting their FSRS data. */
async function legacyWords(db: Connection, now: Date) {
  const bounds = localDayBounds(now);
  const cards = await db.getAllAsync<StoredCard>('SELECT * FROM cards WHERE COALESCE(first_learned_at, created_at) >= ? AND COALESCE(first_learned_at, created_at) < ? ORDER BY COALESCE(first_learned_at, created_at), word_id', bounds.start, bounds.end);
  const words: StudyWord[] = [], queue: StudyQueueItem[] = [], masteredIds: string[] = [];
  const baseSummary = emptySummary();
  for (const card of cards) {
    const word = await hydrateWord(db, card.word_id);
    words.push(word);
    baseSummary.total_count++;
    const logs = await db.getAllAsync<{ rating: number }>("SELECT rating FROM review_logs WHERE word_id = ? AND context = 'study' AND reviewed_at >= ? ORDER BY reviewed_at, rowid", card.word_id, card.first_learned_at ?? card.created_at);
    const first = logs[0]?.rating;
    if (first === 3) baseSummary.good_count++;
    if (first === 2) baseSummary.hard_count++;
    if (first === 1) baseSummary.again_count++;
    const requiresConfirmation = logs.some(log => log.rating === 1);
    const lastGood = logs.at(-1)?.rating === 3;
    const mastered = lastGood && (!requiresConfirmation || logs.at(-2)?.rating === 3);
    if (mastered) masteredIds.push(card.word_id);
    else if (!card.suspended) queue.push({ word, attempt: logs.length + 1, phase: 'choice', stars: 0 });
  }
  return { words, queue, masteredIds, baseSummary };
}

async function upgradeRound(db: Connection, state: DailyStudyRound): Promise<DailyStudyRound> {
  if (state.snapshot.status === 'completed') return { ...state, reinforcementVersion: 3 };
  const words = await prepareMeaningChoices(db, state.words);
  const byId = new Map(words.map(word => [word.wordId, word]));
  const upgradeItem = (item: StudyQueueItem): StudyQueueItem => {
    const mastered = state.masteredIds.includes(item.word.wordId);
    const preserve = !!state.reinforcementVersion && ['choice', 'meaning', 'recall'].includes(studyPhase(item));
    return { word: byId.get(item.word.wordId) ?? item.word, attempt: item.attempt, minGap: item.minGap,
      phase: mastered ? 'recall' : preserve ? studyPhase(item) : 'choice', stars: mastered ? 3 : preserve ? item.stars ?? 0 : 0 };
  };
  const item = upgradeItem(state.snapshot.item);
  // An answer already committed to the log keeps the exact choices it scored.
  if (state.snapshot.status === 'answer') item.word = (await prepareMeaningChoices(db, [state.snapshot.item.word], true))[0];
  return { ...state, reinforcementVersion: 3, words, queue: state.queue.map(upgradeItem), snapshot: { ...state.snapshot, item } };
}

export async function startStudy(db: Database, dependencies: StudyDependencies): Promise<StudyStartResult> {
  const now = dependencies.now ?? appNow;
  const startedAt = now(), date = localDate(startedAt);
  let loaded: { state: DailyStudyRound; revision: number } | null = null;
  let emptyReason: StudyEmptyReason = 'book-complete';
  await db.withExclusiveTransactionAsync(async tx => {
    // Serialize opens before checking the active round, including a lost create
    // response. A round can span midnight and only completion opens another.
    await tx.runAsync("UPDATE settings SET value = value WHERE key = 'current_book_id'");
    const settings = await getSettings(tx);
    let existing = await getPendingStudyRound(tx);
    if (existing) {
      const filtered = await filterUnavailableNewWords(tx, existing.state, settings.currentBookId);
      if (filtered !== existing.state) {
        const summary = existing.state.snapshot.summary;
        if (filtered.snapshot.status === 'prompt') {
          filtered.snapshot = filtered.queue.length ? promptFor(filtered, summary) : await completedFor(tx, filtered, summary, startedAt);
          if (!filtered.queue.length) await completeStudySession(tx, filtered.sessionId, await getSession(tx, filtered.sessionId), startedAt);
        } else if (filtered.snapshot.status === 'answer') filtered.snapshot = { ...filtered.snapshot, total: filtered.words.length };
        existing.state = filtered;
        await saveStudyRound(tx, filtered, existing.revision++);
      }
      if (!existing.state.words.length) existing = null;
    }
    if (existing) {
      if (existing.state.reinforcementVersion !== 3 || existing.state.words.some(word => word.meaningChoicesVersion !== 1 || word.meaningChoices?.some(choice => !choice.lemma || !choice.frenchLabel))) {
        existing.state = await upgradeRound(tx, existing.state);
        await saveStudyRound(tx, existing.state, existing.revision);
        existing.revision++;
      }
      loaded = existing;
      return;
    }
    if (!await getBookProgress(tx, settings.currentBookId)) throw new Error('Current book missing');
    const hasRounds = await tx.getFirstAsync('SELECT round_id FROM study_rounds LIMIT 1');
    const legacy = hasRounds ? { words: [], queue: [], masteredIds: [], baseSummary: emptySummary() } : await legacyWords(tx, startedAt);
    const rows = await getUnlearnedWords(tx, settings.currentBookId, Math.max(0, settings.dailyNewWords - legacy.words.length));
    const newWords = [];
    for (const row of rows) newWords.push(await hydrateWord(tx, row.id));
    const words = await prepareMeaningChoices(tx, [...legacy.words, ...newWords]);
    if (!words.length) {
      emptyReason = 'book-complete';
      return;
    }
    const sessionId = dependencies.createId();
    await createStudySession(tx, sessionId, startedAt);
    const byId = new Map(words.map(word => [word.wordId, word]));
    const core = { ...legacy, words, queue: [...legacy.queue.map(item => ({ ...item, word: byId.get(item.word.wordId)! })), ...createStudyQueue(newWords.map(word => byId.get(word.wordId)!))], sessionId, date, bookId: settings.currentBookId };
    const snapshot = core.queue.length ? promptFor(core, core.baseSummary) : await completedFor(tx, core, core.baseSummary, startedAt);
    const state: DailyStudyRound = { ...core, snapshot, reinforcementVersion: 3 };
    if (snapshot.status === 'completed') await completeStudySession(tx, sessionId, emptySummary(), startedAt);
    await tx.runAsync('INSERT INTO study_rounds (round_id, local_date, state_json) VALUES (?, ?, ?)', sessionId, date, JSON.stringify(state));
    await saveStudyRound(tx, state, 0);
    loaded = { state, revision: 1 };
  });
  if (!loaded) return { kind: 'empty', reason: emptyReason };
  const { state, revision } = loaded as { state: DailyStudyRound; revision: number };
  return { kind: 'session', session: new StudySession(db, state, revision, now) };
}

export async function resumeStudyCompletion(db: Database): Promise<StudyStartResult | null> {
  const saved = await db.getFirstAsync<{ state_json: string; revision: number }>(`SELECT r.state_json, r.revision
    FROM study_completion c JOIN study_rounds r ON r.round_id = c.round_id
    WHERE c.stage <> 'summary' AND json_extract(r.state_json, '$.bookId') =
      (SELECT value FROM settings WHERE key = 'current_book_id') ORDER BY r.rowid DESC LIMIT 1`);
  if (!saved) return null;
  return { kind: 'session', session: new StudySession(db, JSON.parse(saved.state_json) as DailyStudyRound, saved.revision, appNow) };
}

export class StudySession {
  private pending: Promise<StudySnapshot> | null = null;
  constructor(private readonly db: Database, private state: DailyStudyRound, private revision: number, private readonly now: () => Date) {}
  get id(): string { return this.state.sessionId; }
  get total(): number { return this.state.words.length; }
  getSnapshot(): StudySnapshot { return this.state.snapshot; }
  private singleFlight(operation: () => Promise<StudySnapshot>): Promise<StudySnapshot> {
    if (this.pending) return this.pending;
    this.pending = operation().finally(() => { this.pending = null; });
    return this.pending;
  }
  private async transact(operation: (tx: Connection) => Promise<DailyStudyRound>): Promise<StudySnapshot> {
    let next = this.state, revision = this.revision;
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('UPDATE study_rounds SET revision = revision WHERE round_id = ?', this.id);
      const latest = await getStudyRoundById(tx, this.id);
      if (!latest) throw new StudyConflictError('Daily round missing');
      if (latest.revision !== this.revision) {
        // Includes a lost commit response and a stale second screen: adopt the
        // committed queue without applying its action to the following word.
        next = latest.state; revision = latest.revision; return;
      }
      if (this.state.bookId && this.state.bookId !== (await getSettings(tx)).currentBookId) throw new StudyConflictError('Current book changed');
      await lockStudySession(tx, this.id);
      next = await operation(tx);
      await saveStudyRound(tx, next, this.revision);
      revision++;
    });
    this.state = next; this.revision = revision;
    return this.state.snapshot;
  }
  submitRating(token: string, rating: UserRating): Promise<StudySnapshot> {
    return this.submitAnswer(token, rating);
  }
  submitChoice(token: string, choiceId: string): Promise<StudySnapshot> {
    return this.submitAnswer(token, { choiceId });
  }
  private submitAnswer(token: string, answer: UserRating | { choiceId: string }): Promise<StudySnapshot> {
    return this.singleFlight(async () => {
      const current = this.state.snapshot;
      if (current.status !== 'prompt' || current.token !== token) return current;
      const now = this.now(), item = current.item;
      const choiceId = typeof answer === 'object' ? answer.choiceId : undefined;
      if (studyPhase(item) === 'choice') {
        const skip = answer === 'unknown' || answer === 'uncertain';
        if (!skip && (!choiceId || !item.word.meaningChoices?.some(choice => choice.id === choiceId))) throw new Error('Select a valid meaning option');
      } else if (choiceId !== undefined) throw new Error('This stage is not a meaning choice');
      const rating: UserRating = typeof answer === 'string' ? answer : choiceId === item.word.wordId ? 'known' : 'unknown';
      return this.transact(async tx => {
        const receipt = await getReviewLog(tx, token);
        const savedRating = receipt ? fsrsRatingToUserRating(receipt.rating) : rating;
        if (!receipt) {
          const stored = await getCardByWordId(tx, item.word.wordId);
          if (item.attempt === 1) {
            if (stored) throw new StudyConflictError('Word already learned elsewhere');
          } else if (!stored || stored.suspended) throw new StudyConflictError('Reinforcement card unavailable');
          if (!await getDictionaryEntry(tx, item.word.wordId)) throw new StudyConflictError('Word no longer exists');
          const result = reviewFsrsCard(stored?.fsrs_card_json ?? null, savedRating, now);
          const card: StoredCard = stored ? { ...stored, fsrs_card_json: result.serializedCard, due_at: result.dueAt, last_review_at: result.lastReviewAt } : {
            word_id: item.word.wordId, fsrs_card_json: result.serializedCard, due_at: result.dueAt, last_review_at: result.lastReviewAt,
            first_learned_at: now.toISOString(), created_at: now.toISOString(), origin: 'study', suspended: 0,
          };
          if (stored) await updateCard(tx, card); else await insertCard(tx, card);
          await insertReviewLog(tx, { id: token, word_id: card.word_id, rating: result.rating, context: 'study', reviewed_at: now.toISOString(), fsrs_log_json: result.serializedLog });
          await applyInitialReviewSchedule(tx, card.word_id);
          if (item.attempt === 1) await recordFirstRating(tx, this.id, result.rating);
        }
        const summary = addSummary(this.state.baseSummary, await getSession(tx, this.id));
        const masteredIds = completesMastery(item, savedRating) ? [...new Set([...this.state.masteredIds, item.word.wordId])] : this.state.masteredIds;
        return { ...this.state, masteredIds, queue: advanceStudyQueue(this.state.queue, savedRating),
          snapshot: { ...current, item: { ...item, stars: starsAfterAnswer(item, savedRating) }, status: 'answer', summary, masteredCount: masteredIds.length, answerRating: savedRating, selectedChoiceId: choiceId } };
      });
    });
  }
  markFamiliar(token: string): Promise<StudySnapshot> {
    return this.singleFlight(async () => {
      const current = this.state.snapshot;
      if (current.status === 'completed' || current.token !== token || current.familiar) return current;
      return this.transact(async tx => {
        const wordId = current.item.word.wordId;
        const counted = current.status === 'answer' || current.item.attempt > 1;
        await markFamiliarInTransaction(tx, wordId, this.id, token, 'study', counted, this.now(), {
          queue: this.state.queue.filter(item => item.word.wordId === wordId),
          wasMastered: this.state.masteredIds.includes(wordId),
        });
        const masteredIds = [...new Set([...this.state.masteredIds, wordId])];
        const summary = addSummary(this.state.baseSummary, await getSession(tx, this.id));
        return { ...this.state, masteredIds, queue: this.state.queue.filter(item => item.word.wordId !== wordId),
          snapshot: { ...current, status: 'answer', familiar: true, selectedChoiceId: undefined,
            masteredCount: masteredIds.length, summary } };
      });
    });
  }
  continue(token: string): Promise<StudySnapshot> {
    return this.singleFlight(async () => {
      const current = this.state.snapshot;
      if (current.status !== 'answer' || current.token !== token) return current;
      return this.transact(async tx => {
        if (this.state.queue.length) return { ...this.state, snapshot: promptFor(this.state, current.summary) };
        if (current.summary.total_count !== this.total) throw new Error('Incomplete daily round');
        const completedAt = this.now();
        await completeStudySession(tx, this.id, await getSession(tx, this.id), completedAt);
        await checkIn(tx, completedAt);
        await tx.runAsync("INSERT OR IGNORE INTO study_completion (round_id, stage) VALUES (?, 'choice')", this.id);
        return { ...this.state, snapshot: await completedFor(tx, this.state, current.summary, completedAt) };
      });
    });
  }
}
