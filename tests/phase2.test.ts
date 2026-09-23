import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Rating } from 'ts-fsrs';
import { initializeSampleDatabase as initializeDatabase } from '../src/db/database';
import { SCHEMA_V1 } from '../src/db/schema';
import { migrateDatabase } from '../src/db/migrations';
import type { Database } from '../src/db/connection';
import { importWordBook } from '../scripts/import-wordbook';
import { getHomeData } from '../src/services/homeService';
import { startStudy, StudyConflictError, type StudySession, type StudySnapshot } from '../src/services/studyService';
import { createStudyQueue, advanceStudyQueue } from '../src/services/studyQueue';
import { getStudyQuota, remainingDailyQuota } from '../src/services/studyQuota';
import { createNewFsrsCard, reviewFsrsCard, userRatingToFsrsRating } from '../src/services/fsrs/fsrs';
import { serializeFsrsCard, deserializeFsrsCard } from '../src/services/fsrs/serializeCard';
import { getCardByWordId, countFirstLearned } from '../src/repositories/cardRepository';
import { getSession, getRecentSessions } from '../src/repositories/sessionRepository';
import { getUnlearnedWords } from '../src/repositories/wordBookRepository';
import { getReviewLog } from '../src/repositories/reviewRepository';
import { localDayBounds } from '../src/utils/date';
import { partOfSpeechLabel } from '../src/utils/wordLabel';
import type { StudyWord, UserRating } from '../src/types/study';
import { openTestDatabase } from './sqliteAdapter';
import { reviewDueLabel } from '../src/utils/reviewDue';
import { initialReviewDays, firstReviewDue, reconcileTodaysInitialReviews } from '../src/services/initialReviewSchedule';

function clock() {
  let time = new Date(2026, 8, 19, 12).getTime();
  return { now: () => new Date(time), tick: (ms = 1000) => { time += ms; }, set: (ms: number) => { time = ms; } };
}
type Clock = ReturnType<typeof clock>;
async function begin(db: Database, time: Clock): Promise<StudySession> {
  const result = await startStudy(db, { createId: randomUUID, now: time.now });
  assert.equal(result.kind, 'session');
  if (result.kind !== 'session') throw new Error('Expected a study session');
  return result.session;
}
function prompt(session: StudySession) {
  const view = session.getSnapshot();
  assert.equal(view.status, 'prompt');
  if (view.status !== 'prompt') throw new Error('Expected prompt');
  return view;
}
async function next(session: StudySession, time: Clock): Promise<StudySnapshot> {
  const before = session.getSnapshot();
  if (before.status === 'completed') return before;
  return session.continue(before.token);
}
// Drive the public action appropriate to the presented stage, including MCQs.
async function rate(session: StudySession, token: string, rating: UserRating) {
  const view = session.getSnapshot();
  if (view.status === 'prompt' && view.token === token && view.item.phase === 'choice' && rating === 'known') {
    const id = rating === 'known' ? view.item.word.wordId : view.item.word.meaningChoices!.find(option => option.id !== view.item.word.wordId)!.id;
    return session.submitChoice(token, id);
  }
  return session.submitRating(token, rating);
}
async function finish(session: StudySession, time: Clock, rating: (view: ReturnType<typeof prompt>) => UserRating = () => 'known') {
  for (let turns = 0; turns < 151; turns++) {
    const view = session.getSnapshot();
    if (view.status === 'completed') return view;
    if (view.status === 'prompt') {
      time.tick();
      await rate(session, view.token, rating(view));
    }
    await next(session, time);
  }
  throw new Error('Study queue did not terminate');
}
async function count(db: Database, table: 'cards' | 'review_logs' | 'sessions' | 'checkins') {
  // Closed, test-only identifier union. User input never enters this query.
  return (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;
}
const word = (id: string): StudyWord => ({ wordId: id, lemma: id, meaningsZh: ['测试'], examples: [] });

test('one authoritative mapping exposes only the three requested ratings', () => {
  assert.equal(userRatingToFsrsRating('known'), Rating.Good);
  assert.equal(userRatingToFsrsRating('uncertain'), Rating.Hard);
  assert.equal(userRatingToFsrsRating('unknown'), Rating.Again);
});

test('FSRS v5.4.2 serializes complete cards and restores both Date fields', () => {
  const now = new Date('2026-09-19T04:00:00.000Z');
  const fresh = createNewFsrsCard(now);
  const decoded = deserializeFsrsCard(serializeFsrsCard(fresh));
  assert.ok(decoded.due instanceof Date);
  assert.equal(decoded.last_review, undefined);
  assert.deepEqual(decoded, fresh);
  const first = reviewFsrsCard(null, 'unknown', now);
  const card = deserializeFsrsCard(first.serializedCard);
  assert.ok(card.last_review instanceof Date);
  assert.equal(card.last_review.toISOString(), now.toISOString());
  assert.equal(first.dueAt, card.due.toISOString());
  assert.ok(card.due.getTime() > now.getTime());
  const later = new Date(now.getTime() + 60_000);
  const second = reviewFsrsCard(first.serializedCard, 'known', later);
  assert.notEqual(second.dueAt, first.dueAt);
  assert.equal(deserializeFsrsCard(second.serializedCard).reps, 2);
  assert.equal(JSON.parse(second.serializedLog).rating, Rating.Good);
  assert.equal(serializeFsrsCard(deserializeFsrsCard(second.serializedCard)), second.serializedCard);
  assert.throws(() => deserializeFsrsCard('{"due":"invalid"}'));
  assert.throws(() => deserializeFsrsCard(JSON.stringify({ ...card, due: 'invalid' })));
});

test('daily quota clamps at zero', () => {
  assert.equal(remainingDailyQuota(10, 0), 10);
  assert.equal(remainingDailyQuota(10, 4), 6);
  assert.equal(remainingDailyQuota(10, 10), 0);
  assert.equal(remainingDailyQuota(10, 14), 0);
});

test('local day uses local midnight, not UTC midnight or a rolling 24 hours (including DST)', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Shanghai';
    assert.deepEqual(localDayBounds(new Date('2026-09-19T01:00:00Z')), { start: '2026-09-18T16:00:00.000Z', end: '2026-09-19T16:00:00.000Z' });
    process.env.TZ = 'America/New_York';
    const spring = localDayBounds(new Date(2026, 2, 8, 12));
    const autumn = localDayBounds(new Date(2026, 10, 1, 12));
    assert.equal(Date.parse(spring.end) - Date.parse(spring.start), 23 * 3600_000);
    assert.equal(Date.parse(autumn.end) - Date.parse(autumn.start), 25 * 3600_000);
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test('Again and Hard allow short tails and unlimited attempts until three stars complete', () => {
  const queue = createStudyQueue('ABCDEFG'.split('').map(word));
  const again = advanceStudyQueue(queue, 'unknown');
  assert.deepEqual(again.map(i => i.word.lemma), ['B', 'C', 'D', 'A', 'E', 'F', 'G']);
  assert.equal(again[3].attempt, 2);
  assert.deepEqual(advanceStudyQueue(queue, 'uncertain').map(i => i.word.lemma), ['B', 'C', 'D', 'E', 'F', 'A', 'G']);
  assert.deepEqual(advanceStudyQueue(queue.slice(0, 3), 'uncertain').map(i => i.word.lemma), ['B', 'C', 'A']);
  assert.deepEqual(advanceStudyQueue(queue.slice(0, 3), 'unknown').map(i => i.word.lemma), ['B', 'C', 'A']);
  assert.equal(advanceStudyQueue(queue.slice(0, 1), 'unknown')[0].minGap, 0);
  assert.equal(advanceStudyQueue(queue.slice(0, 1), 'uncertain')[0].phase, 'choice');
  assert.equal(again[3].minGap, 3);
  const othersAreReinforcements = queue.slice(0, 4).map(item => ({ ...item, attempt: 2 as const, phase: 'relearn' as const }));
  assert.deepEqual(advanceStudyQueue(othersAreReinforcements, 'unknown').map(i => i.word.lemma), ['B', 'C', 'D', 'A']);
  assert.equal(advanceStudyQueue(queue, 'known').length, 7);
  assert.equal(advanceStudyQueue([{ word: word('A'), attempt: 3 }], 'unknown')[0].attempt, 4);
  assert.equal(advanceStudyQueue([{ word: word('A'), attempt: 3 }], 'uncertain')[0].phase, 'choice');
  assert.equal(queue[0].attempt, 1); // Pure queue operation; no pre-commit mutation.
});

test('new words are restricted to the selected book and order_index; empty book creates no session', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    await db.runAsync("UPDATE settings SET value = 'my-vocabulary' WHERE key = 'current_book_id'");
    assert.deepEqual(await startStudy(db, { createId: randomUUID, now: time.now }), { kind: 'empty', reason: 'book-complete' });
    assert.equal(await count(db, 'sessions'), 0);
    await importWordBook(db, { id: 'small', name: 'Small', words: ['zèbre-test', 'abricot-test', 'nuage-test'].map(lemma => ({ lemma, partOfSpeech: 'noun', meaningsZh: ['测试'] })) }, time.now());
    await db.runAsync("UPDATE settings SET value = 'small' WHERE key = 'current_book_id'");
    const session = await begin(db, time);
    assert.equal(session.total, 3);
    assert.equal(prompt(session).item.word.lemma, 'zèbre-test');
    await rate(session, prompt(session).token, 'known');
    await next(session, time);
    assert.equal(prompt(session).item.word.lemma, 'abricot-test');
    assert.deepEqual((await getUnlearnedWords(db, 'small', 10)).map(w => w.lemma), ['abricot-test', 'nuage-test']);
    await finish(session, time);
    assert.equal((await getHomeData(db, time.now())).book.learned, 3);
    assert.deepEqual(await startStudy(db, { createId: randomUUID, now: time.now }), { kind: 'empty', reason: 'book-complete' });
    assert.equal(await count(db, 'sessions'), 1);
  } finally { close(); }
});

test('10 unique words plus three-stage reinforcement produce 10 cards, 34 logs and one checkin', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const session = await begin(db, time);
    let first = 0;
    let position = 0;
    const lastPositions = new Map<string, number>();
    const done = await finish(session, time, view => {
      const previousPosition = lastPositions.get(view.item.word.wordId);
      if (previousPosition !== undefined) assert.ok(position - previousPosition - 1 >= view.item.minGap!);
      lastPositions.set(view.item.word.wordId, position++);
      if (view.item.attempt > 1) return 'known';
      const index = first++;
      return index < 3 ? 'uncertain' : index === 3 ? 'unknown' : 'known';
    });
    assert.deepEqual(done.summary, { total_count: 10, good_count: 6, hard_count: 3, again_count: 1 });
    assert.equal(done.masteredCount, 10); // Includes four words recalled during reinforcement.
    assert.equal(done.learnedToday, 10);
    assert.equal(await count(db, 'cards'), 10);
    assert.equal(await count(db, 'review_logs'), 34); // Six words need three successes; four need an initial failure plus three successes.
    assert.equal(await count(db, 'checkins'), 1);
    const stored = await getSession(db, session.id);
    assert.ok(stored.ended_at);
    assert.equal(stored.total_count, stored.good_count + stored.hard_count + stored.again_count);
    const home = await getHomeData(db, time.now());
    assert.equal(home.book.learned, 10);
    assert.equal(home.remainingToday, 0);
    assert.equal(home.availableNewWords, 10);
    assert.equal(home.checkin.checkedIn, true);
    assert.equal((await begin(db, time)).getSnapshot().status, 'prompt');
    assert.equal(await count(db, 'sessions'), 2);
    const logs = await db.getAllAsync<{ rating: number; fsrs_log_json: string; context: string }>('SELECT * FROM review_logs');
    for (const log of logs) { assert.equal(log.rating, JSON.parse(log.fsrs_log_json).rating); assert.equal(log.context, 'study'); }
  } finally { close(); }
});

test('all Again ratings keep cycling without starving new words or changing first-learned metadata', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const session = await begin(db, time);
    const appearances = new Map<string, number>();
    const firstTimes = new Map<string, string>();
    const lastPositions = new Map<string, number>();
    for (let turn = 0; turn < 60; turn++) {
      const view = prompt(session);
      const previousPosition = lastPositions.get(view.item.word.wordId);
      if (previousPosition !== undefined) assert.ok(turn - previousPosition - 1 >= view.item.minGap!);
      lastPositions.set(view.item.word.wordId, turn);
      appearances.set(view.item.word.wordId, (appearances.get(view.item.word.wordId) ?? 0) + 1);
      time.tick();
      const answer = await rate(session, view.token, 'unknown');
      assert.equal(answer.status, 'answer');
      assert.equal(answer.masteredCount, 0); // Exposure alone never claims mastery.
      assert.equal(answer.summary.total_count, view.summary.total_count + Number(view.item.attempt === 1));
      const card = (await getCardByWordId(db, view.item.word.wordId))!;
      if (view.item.attempt === 1) firstTimes.set(card.word_id, card.first_learned_at!);
      else assert.equal(card.first_learned_at, firstTimes.get(card.word_id));
      assert.equal(card.origin, 'study');
      assert.equal(deserializeFsrsCard(card.fsrs_card_json).reps, view.item.attempt);
      await next(session, time);
    }
    assert.equal(session.getSnapshot().status, 'prompt');
    assert.equal(appearances.size, 10);
    assert.ok([...appearances.values()].every(value => value > 3));
    assert.equal(await count(db, 'checkins'), 0);
    assert.equal(await count(db, 'review_logs'), [...appearances.values()].reduce((sum, value) => sum + value, 0));
    assert.deepEqual(session.getSnapshot().summary, { total_count: 10, good_count: 0, hard_count: 0, again_count: 10 });
    const done = await finish(session, time);
    assert.equal(done.masteredCount, 10);
    assert.equal(done.learnedToday, 10);
    assert.equal(await count(db, 'review_logs'), 90); // Three consecutive successes per word after 60 Again ratings.
  } finally { close(); }
});

test('a single final Hard word must complete all three stages, even without intervening words', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    await importWordBook(db, { id: 'one', name: 'One', words: [{ lemma: 'single-test', partOfSpeech: 'adjective', meaningsZh: ['测试'] }] }, time.now());
    await db.runAsync("UPDATE settings SET value = 'one' WHERE key = 'current_book_id'");
    const session = await begin(db, time);
    const first = prompt(session);
    await rate(session, first.token, 'uncertain');
    const pending = await session.continue(first.token);
    assert.equal(pending.status, 'prompt');
    if (pending.status !== 'prompt') throw new Error('Expected choice');
    assert.equal(pending.item.phase, 'choice');
    assert.equal(pending.item.stars, 0);
    const done = await finish(session, time);
    assert.equal(done.summary.total_count, 1);
    assert.equal(done.summary.hard_count, 1);
    assert.equal(done.masteredCount, 1);
    assert.equal(await count(db, 'review_logs'), 4);
    const card = (await getCardByWordId(db, first.item.word.wordId))!;
    assert.ok(Date.parse(card.due_at) > time.now().getTime());
  } finally { close(); }
});

test('rapid duplicate rating, stale rating and stale continue events cannot add writes or skip words', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const session = await begin(db, time);
    const first = prompt(session);
    const [one, two] = await Promise.all([rate(session, first.token, 'known'), rate(session, first.token, 'unknown')]);
    assert.equal(one, two);
    await rate(session, first.token, 'unknown');
    assert.equal(await count(db, 'cards'), 1);
    assert.equal(await count(db, 'review_logs'), 1);
    assert.equal((await getReviewLog(db, first.token))?.rating, 3);
    assert.equal(session.getSnapshot().masteredCount, 0);
    await session.continue(first.token);
    const second = prompt(session);
    await rate(session, first.token, 'known');
    await session.continue(first.token);
    assert.equal(prompt(session).token, second.token);
    assert.equal(await count(db, 'review_logs'), 1);
  } finally { close(); }
});

test('a log failure rolls back Card and summary, preserves prompt, and allows a safe retry', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const session = await begin(db, time);
    const first = prompt(session);
    await db.execAsync("CREATE TRIGGER fail_log BEFORE INSERT ON review_logs BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    await assert.rejects(rate(session, first.token, 'unknown'));
    assert.equal(session.getSnapshot(), first);
    assert.equal(await count(db, 'cards'), 0);
    assert.equal(await count(db, 'review_logs'), 0);
    assert.equal((await getSession(db, session.id)).total_count, 0);
    await db.execAsync('DROP TRIGGER fail_log');
    await rate(session, first.token, 'unknown');
    assert.equal(await count(db, 'cards'), 1);
    assert.equal(await count(db, 'review_logs'), 1);
  } finally { close(); }
});

test('a summary write failure rolls back both Card and Log', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const session = await begin(db, clock());
    await db.execAsync("CREATE TRIGGER fail_summary BEFORE UPDATE ON sessions WHEN NEW.total_count > OLD.total_count BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    await assert.rejects(rate(session, prompt(session).token, 'known'));
    assert.equal(await count(db, 'cards'), 0);
    assert.equal(await count(db, 'review_logs'), 0);
    assert.equal(prompt(session).summary.total_count, 0);
    assert.equal(prompt(session).masteredCount, 0);
  } finally { close(); }
});

test('a commit response failure is recovered with the same durable receipt, not a second rating', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    let loseResponse = false;
    const flaky: Database = { ...db, async withExclusiveTransactionAsync(task) {
      await db.withExclusiveTransactionAsync(task);
      if (loseResponse) { loseResponse = false; throw new Error('Commit succeeded but response lost'); }
    } };
    const session = await begin(flaky, clock());
    loseResponse = true;
    const first = prompt(session);
    await assert.rejects(rate(session, first.token, 'unknown'));
    assert.equal(await count(db, 'review_logs'), 1);
    assert.equal(prompt(session).token, first.token);
    const answer = await rate(session, first.token, 'known');
    assert.equal(answer.summary.again_count, 1);
    assert.equal(answer.summary.good_count, 0);
    assert.equal(answer.masteredCount, 0); // Retry restores the original Again receipt.
    assert.equal(await count(db, 'review_logs'), 1);
    assert.equal((await getReviewLog(db, first.token))?.rating, 1);
  } finally { close(); }
});

test('two screens reuse one daily session and a stale score adopts the committed result', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const one = await begin(db, time);
    const two = await begin(db, time);
    await rate(one, prompt(one).token, 'known');
    assert.equal(one.id, two.id);
    assert.equal((await rate(two, prompt(two).token, 'unknown')).masteredCount, 0);
    assert.equal(await count(db, 'cards'), 1);
    assert.equal(await count(db, 'review_logs'), 1);
  } finally { close(); }
});

test('interrupted study and database reopen preserve ratings, exclude learned words and leave exactly 6 new words', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'french-study-'));
  const path = join(directory, 'study.db');
  let handle = openTestDatabase(path);
  try {
    await initializeDatabase(handle.db);
    const time = clock();
    const session = await begin(handle.db, time);
    assert.equal(await count(handle.db, 'cards'), 0);
    assert.equal(await count(handle.db, 'review_logs'), 0);
    const studied = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const view = prompt(session);
      studied.add(view.item.word.wordId);
      await rate(session, view.token, 'known');
      await next(session, time);
      time.tick();
    }
    const unscored = prompt(session).item.word.wordId;
    const saved = await handle.db.getAllAsync<{ fsrs_card_json: string }>('SELECT fsrs_card_json FROM cards ORDER BY word_id');
    assert.equal(await getCardByWordId(handle.db, unscored), null);
    handle.close();
    handle = openTestDatabase(path);
    await initializeDatabase(handle.db);
    assert.deepEqual(await handle.db.getAllAsync('SELECT fsrs_card_json FROM cards ORDER BY word_id'), saved);
    assert.equal((await getSession(handle.db, session.id)).total_count, 4);
    assert.equal((await getSession(handle.db, session.id)).ended_at, null);
    const home = await getHomeData(handle.db, time.now());
    assert.equal(home.book.total, 66);
    assert.equal(home.book.learned, 4);
    assert.equal(home.remainingToday, 6);
    const resumed = await begin(handle.db, time);
    assert.equal(resumed.total, 10);
    assert.equal(resumed.id, session.id);
    assert.equal(prompt(resumed).masteredCount, 0);
    assert.equal(prompt(resumed).item.word.wordId, unscored);
    const completed = await finish(resumed, time, view => { if (view.item.attempt === 1) assert.ok(!studied.has(view.item.word.wordId)); return 'known'; });
    assert.equal(completed.summary.total_count, 10);
    assert.equal(completed.masteredCount, 10);
    assert.equal(completed.words.length, 10);
    assert.ok([...studied].every(id => completed.words.some(word => word.wordId === id)));
    assert.equal(completed.learnedToday, 10); // Completion screen must include the interrupted four.
    assert.equal(await count(handle.db, 'cards'), 10);
    assert.equal((await getHomeData(handle.db, time.now())).remainingToday, 0);
    assert.equal((await getRecentSessions(handle.db)).length, 1);
    handle.close();
    handle = openTestDatabase(path);
    await initializeDatabase(handle.db);
    assert.equal(await count(handle.db, 'cards'), 10);
    assert.equal(await count(handle.db, 'review_logs'), 30);
    assert.ok((await getSession(handle.db, resumed.id)).ended_at);
    assert.equal((await getHomeData(handle.db, time.now())).checkin.checkedIn, true);
    assert.equal((await getHomeData(handle.db, time.now())).remainingToday, 0);
  } finally { handle.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('first-learned count includes the start boundary and excludes the next local midnight', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const session = await begin(db, time);
    for (let i = 0; i < 3; i++) { await rate(session, prompt(session).token, 'known'); await next(session, time); }
    const cards = await db.getAllAsync<{ word_id: string }>('SELECT word_id FROM cards ORDER BY word_id');
    const { start, end } = localDayBounds(time.now());
    await db.runAsync('UPDATE cards SET first_learned_at = ? WHERE word_id = ?', new Date(Date.parse(start) - 1).toISOString(), cards[0].word_id);
    await db.runAsync('UPDATE cards SET first_learned_at = ? WHERE word_id = ?', start, cards[1].word_id);
    await db.runAsync('UPDATE cards SET first_learned_at = ? WHERE word_id = ?', end, cards[2].word_id);
    assert.equal(await countFirstLearned(db, start, end), 1);
    assert.deepEqual(await getStudyQuota(db, 10, time.now()), { learnedToday: 1, remainingToday: 9 });
  } finally { close(); }
});

test('completion and automatic checkin roll back together, retry is idempotent', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const session = await begin(db, time);
    for (let i = 0; i < 30; i++) { await rate(session, prompt(session).token, 'known'); if (i < 29) await next(session, time); }
    await db.execAsync("CREATE TRIGGER fail_checkin BEFORE INSERT ON checkins BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    const answer = session.getSnapshot();
    if (answer.status !== 'answer') throw new Error('Expected answer');
    await assert.rejects(session.continue(answer.token));
    assert.equal((await getSession(db, session.id)).ended_at, null);
    assert.equal(await count(db, 'checkins'), 0);
    assert.equal(await count(db, 'cards'), 10);
    await db.execAsync('DROP TRIGGER fail_checkin');
    await session.continue(answer.token);
    await session.continue(answer.token);
    assert.equal(await count(db, 'checkins'), 1);
    assert.ok((await getSession(db, session.id)).ended_at);
  } finally { close(); }
});

test('word labels handle genders only for nouns and missing optional fields', () => {
  assert.equal(partOfSpeechLabel('noun', 'f'), 'n.f.');
  assert.equal(partOfSpeechLabel('noun', 'm'), 'n.m.');
  assert.equal(partOfSpeechLabel('verb', 'f'), 'v.');
  assert.equal(partOfSpeechLabel('noun'), 'n.');
  assert.equal(partOfSpeechLabel(undefined, 'm'), undefined);
});

test('a failed reinforcement log leaves the previous FSRS card and summary intact', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const session = await begin(db, time);
    const first = prompt(session);
    await rate(session, first.token, 'unknown');
    await next(session, time);
    for (let i = 0; i < 3; i++) { await rate(session, prompt(session).token, 'known'); await next(session, time); }
    const repeat = prompt(session);
    assert.equal(repeat.item.word.wordId, first.item.word.wordId);
    const beforeCard = await getCardByWordId(db, repeat.item.word.wordId);
    const beforeSession = await getSession(db, session.id);
    const beforeLogs = await count(db, 'review_logs');
    await db.execAsync("CREATE TRIGGER fail_reinforcement BEFORE INSERT ON review_logs BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    await assert.rejects(rate(session, repeat.token, 'known'));
    assert.deepEqual(await getCardByWordId(db, repeat.item.word.wordId), beforeCard);
    assert.deepEqual(await getSession(db, session.id), beforeSession);
    assert.equal(await count(db, 'review_logs'), beforeLogs);
    assert.equal(prompt(session).token, repeat.token);
    assert.equal(prompt(session).masteredCount, 0);
    await db.execAsync('DROP TRIGGER fail_reinforcement');
    const recovered = await rate(session, repeat.token, 'known');
    assert.equal(recovered.masteredCount, 0); // First Good still needs its confirmation.
  } finally { close(); }
});

test('legacy daily quota no longer prevents completing a ten-word round', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const session = await begin(db, time);
    for (let i = 0; i < 5; i++) { await rate(session, prompt(session).token, 'known'); await next(session, time); }
    await db.runAsync("UPDATE settings SET value = '5' WHERE key = 'daily_new_words'");
    await rate(session, prompt(session).token, 'known');
    assert.equal(await count(db, 'cards'), 6);
    assert.equal(await count(db, 'review_logs'), 6);
  } finally { close(); }
});

test('mastery advances only on a committed Good, including after repeated reinforcement', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const session = await begin(db, time);
    const target = prompt(session).item.word.wordId;
    assert.equal(prompt(session).masteredCount, 0);
    let mastered = 0;
    let targetAttempts = 0;
    while (session.getSnapshot().status !== 'completed') {
      const view = prompt(session);
      const isTarget = view.item.word.wordId === target;
      const rating: UserRating = isTarget && view.item.attempt < 3 ? (view.item.attempt === 1 ? 'uncertain' : 'unknown') : 'known';
      if (isTarget) targetAttempts++;
      const answer = await rate(session, view.token, rating);
      if (rating === 'known' && view.item.phase === 'recall') mastered++;
      assert.equal(answer.masteredCount, mastered);
      // Repeated taps with a changed answer cannot increment progress twice.
      assert.equal((await rate(session, view.token, 'known')).masteredCount, mastered);
      await next(session, time);
    }
    assert.equal(targetAttempts, 5);
    assert.equal(session.getSnapshot().masteredCount, 10);
  } finally { close(); }
});

test('completion daily total uses the completion date rather than session start or historical cards', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    time.set(new Date(2026, 8, 19, 23, 55).getTime());
    const session = await begin(db, time);
    for (let i = 0; i < 4; i++) {
      await rate(session, prompt(session).token, 'known');
      await next(session, time);
    }
    time.set(new Date(2026, 8, 20, 0, 5).getTime());
    const completed = await finish(session, time);
    assert.equal(completed.summary.total_count, 10);
    assert.equal(completed.masteredCount, 10);
    assert.equal(completed.learnedToday, 6);
    assert.equal((await getHomeData(db, time.now())).learnedToday, completed.learnedToday);
  } finally { close(); }
});

test('a lost Good commit response fills one star without completing mastery when recovered', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    let loseResponse = false;
    const flaky: Database = { ...db, async withExclusiveTransactionAsync(task) {
      await db.withExclusiveTransactionAsync(task);
      if (loseResponse) { loseResponse = false; throw new Error('Commit response lost'); }
    } };
    const session = await begin(flaky, clock());
    loseResponse = true;
    const initial = prompt(session);
    await assert.rejects(rate(session, initial.token, 'known'));
    assert.equal(prompt(session).masteredCount, 0);
    assert.equal((await rate(session, initial.token, 'unknown')).masteredCount, 0);
    assert.equal((await rate(session, initial.token, 'known')).masteredCount, 0);
    assert.equal(await count(db, 'review_logs'), 1);
  } finally { close(); }
});

test('a singleton repeats indefinitely; each failed reinforcement resets the three-star sequence', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    await importWordBook(db, { id: 'repeat-one', name: 'One', words: [{ lemma: 'repeat-one', partOfSpeech: 'verb', meaningsZh: ['测试'] }] }, time.now());
    await db.runAsync("UPDATE settings SET value = 'repeat-one' WHERE key = 'current_book_id'");
    const session = await begin(db, time);
    const ratings: UserRating[] = [...Array<UserRating>(30).fill('unknown'), 'known', 'unknown', 'known', 'unknown', 'known', 'known', 'known'];
    const tokens = new Set<string>();
    for (let i = 0; i < ratings.length; i++) {
      const view = prompt(session);
      tokens.add(view.token);
      assert.equal(view.item.attempt, i + 1);
      time.tick();
      const answer = await rate(session, view.token, ratings[i]);
      assert.equal(answer.masteredCount, Number(i === ratings.length - 1));
      await next(session, time);
      if (i < ratings.length - 1) {
        const following = prompt(session);
        assert.equal(following.item.minGap, 0);
        assert.equal(following.item.stars, answer.status === 'answer' ? answer.item.stars : -1);
        assert.equal((await getSession(db, session.id)).ended_at, null);
      }
    }
    assert.equal(tokens.size, ratings.length);
    assert.equal(session.getSnapshot().status, 'completed');
    assert.deepEqual(session.getSnapshot().summary, { total_count: 1, good_count: 0, hard_count: 0, again_count: 1 });
    assert.equal(await count(db, 'cards'), 1);
    assert.equal(await count(db, 'review_logs'), ratings.length);
    assert.equal(await count(db, 'checkins'), 1);
    assert.equal((await getHomeData(db, time.now())).learnedToday, 1);
  } finally { close(); }
});

test('failed final confirmation does not finish or count mastery, and duplicate retry counts once', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    await importWordBook(db, { id: 'confirm-one', name: 'One', words: [{ lemma: 'confirm-one', partOfSpeech: 'verb', meaningsZh: ['测试'] }] }, time.now());
    await db.runAsync("UPDATE settings SET value = 'confirm-one' WHERE key = 'current_book_id'");
    const session = await begin(db, time);
    await rate(session, prompt(session).token, 'unknown');
    await next(session, time);
    const confirmation = prompt(session);
    assert.equal(confirmation.item.phase, 'choice');
    await rate(session, confirmation.token, 'known');
    await next(session, time);
    await rate(session, prompt(session).token, 'known');
    await next(session, time);
    const final = prompt(session);
    assert.equal(final.item.phase, 'recall');
    assert.equal(confirmation.masteredCount, 0);
    await db.execAsync("CREATE TRIGGER fail_confirmation BEFORE INSERT ON review_logs BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    await assert.rejects(rate(session, final.token, 'known'));
    assert.equal(session.getSnapshot(), final);
    assert.equal(await count(db, 'review_logs'), 3);
    await db.execAsync('DROP TRIGGER fail_confirmation');
    const [one, two] = await Promise.all([rate(session, final.token, 'known'), rate(session, final.token, 'known')]);
    assert.equal(one, two);
    assert.equal(one.masteredCount, 1);
    await next(session, time);
    assert.equal(session.getSnapshot().status, 'completed');
    assert.equal(await count(db, 'review_logs'), 4);
  } finally { close(); }
});

test('daily summary lists all ten unique words with the latest stored FSRS due and survives reopening', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'french-summary-'));
  const path = join(directory, 'study.db');
  let handle = openTestDatabase(path);
  try {
    await initializeDatabase(handle.db);
    const time = clock();
    const session = await begin(handle.db, time);
    const done = await finish(session, time, view => view.item.attempt === 1 ? 'unknown' : 'known');
    assert.equal(done.words.length, 10);
    assert.equal(new Set(done.words.map(w => w.wordId)).size, 10);
    for (const word of done.words) {
      const card = (await getCardByWordId(handle.db, word.wordId))!;
      assert.equal(word.dueAt, card.due_at);
      assert.equal(word.dueAt, deserializeFsrsCard(card.fsrs_card_json).due.toISOString());
      assert.ok(word.lemma && word.meaning);
    }
    handle.close(); handle = openTestDatabase(path);
    await initializeDatabase(handle.db);
    const updatedDue = new Date(time.now().getTime() + 3 * 86400000).toISOString();
    await handle.db.runAsync('UPDATE cards SET due_at = ? WHERE word_id = ?', updatedDue, done.words[0].wordId);
    const reopened = await begin(handle.db, time);
    assert.equal(reopened.getSnapshot().status, 'prompt');
    assert.notEqual(reopened.id, session.id);
    const storedRound = await handle.db.getFirstAsync<{ state_json: string }>('SELECT state_json FROM study_rounds WHERE round_id = ?', session.id);
    assert.deepEqual(JSON.parse(storedRound!.state_json).snapshot.words, done.words);
    assert.ok(!done.words.some(word => word.wordId === prompt(reopened).item.word.wordId));
    assert.equal(await count(handle.db, 'sessions'), 2);
  } finally { handle.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('reopening after the quota is used restores the pending confirmation and answer screen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'french-confirm-resume-'));
  const path = join(directory, 'study.db');
  let handle = openTestDatabase(path);
  try {
    await initializeDatabase(handle.db);
    const time = clock();
    const session = await begin(handle.db, time);
    for (let i = 0; i < 9; i++) { await rate(session, prompt(session).token, 'known'); await next(session, time); }
    const last = prompt(session);
    await rate(session, last.token, 'unknown');
    assert.equal((await getHomeData(handle.db, time.now())).remainingToday, 0);
    assert.equal((await getHomeData(handle.db, time.now())).roundPending, true);
    handle.close(); handle = openTestDatabase(path);
    await initializeDatabase(handle.db);
    const resumed = await begin(handle.db, time);
    assert.equal(resumed.id, session.id);
    assert.equal(resumed.getSnapshot().status, 'answer');
    await next(resumed, time);
    assert.equal(prompt(resumed).item.attempt, 2);
    await rate(resumed, prompt(resumed).token, 'known');
    await next(resumed, time);
    const confirmation = prompt(resumed);
    handle.close(); handle = openTestDatabase(path);
    await initializeDatabase(handle.db);
    const again = await begin(handle.db, time);
    assert.equal(prompt(again).token, confirmation.token);
    assert.equal(prompt(again).item.phase, 'meaning');
    assert.equal(prompt(again).item.stars, 1);
    assert.equal(prompt(again).masteredCount, 0);
    const done = await finish(again, time);
    assert.equal(done.masteredCount, 10);
    assert.equal(done.words.length, 10);
    assert.equal(await count(handle.db, 'review_logs'), 31);
    assert.equal((await getHomeData(handle.db, time.now())).roundComplete, true);
  } finally { handle.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('v1 upgrade preserves existing Cards and includes earlier learning in the daily group', async () => {
  const { db, close } = openTestDatabase();
  try {
    await db.execAsync(SCHEMA_V1);
    await db.execAsync('PRAGMA user_version = 1');
    const time = clock();
    await importWordBook(db, { id: 'legacy-book', name: 'Legacy', words: Array.from({ length: 10 }, (_, i) => ({ lemma: 'legacy-' + i, partOfSpeech: 'noun', meaningsZh: ['测试' + i] })) }, time.now());
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('current_book_id', 'legacy-book'), ('daily_new_words', '10')");
    const rows = await getUnlearnedWords(db, 'legacy-book', 10);
    for (const row of rows.slice(0, 4)) {
      const result = reviewFsrsCard(null, 'known', time.now());
      await db.runAsync("INSERT INTO cards (word_id, fsrs_card_json, due_at, first_learned_at, origin, created_at) VALUES (?, ?, ?, ?, 'study', ?)", row.id, result.serializedCard, result.dueAt, time.now().toISOString(), time.now().toISOString());
      await db.runAsync("INSERT INTO review_logs (id, word_id, rating, context, reviewed_at, fsrs_log_json) VALUES (?, ?, 3, 'study', ?, ?)", randomUUID(), row.id, time.now().toISOString(), result.serializedLog);
    }
    const before = await db.getAllAsync('SELECT * FROM cards ORDER BY word_id');
    await migrateDatabase(db); // Schema migration itself must preserve every existing Card field.
    assert.equal((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version, 6);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM cards ORDER BY word_id'), before);
    const session = await begin(db, time);
    assert.equal(session.total, 10);
    assert.equal(prompt(session).masteredCount, 4);
    const done = await finish(session, time);
    assert.equal(done.words.length, 10);
    assert.equal(done.summary.good_count, 10);
    assert.equal(done.masteredCount, 10);
    assert.equal(await count(db, 'review_logs'), 22);
  } finally { close(); }
});

test('daily group resumes after switching back and a new date starts a distinct group', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const first = await begin(db, time);
    await rate(first, prompt(first).token, 'known');
    await next(first, time);
    await db.runAsync("UPDATE settings SET value = 'my-vocabulary' WHERE key = 'current_book_id'");
    assert.equal((await startStudy(db, { createId: randomUUID, now: time.now })).kind, 'empty');
    await db.runAsync("UPDATE settings SET value = 'a1-core' WHERE key = 'current_book_id'");
    const same = await begin(db, time);
    assert.equal(same.id, first.id);
    assert.equal(prompt(same).token, prompt(first).token);
    const done = await finish(same, time);
    time.set(new Date(2026, 8, 20, 12).getTime());
    await db.runAsync("UPDATE settings SET value = 'a1-core' WHERE key = 'current_book_id'");
    const tomorrow = await begin(db, time);
    assert.notEqual(tomorrow.id, first.id);
    assert.equal(prompt(tomorrow).roundDate, '2026-09-20');
    assert.equal(prompt(tomorrow).masteredCount, 0);
    assert.ok(!done.words.some(word => word.wordId === prompt(tomorrow).item.word.wordId));
  } finally { close(); }
});

test('failed round persistence rolls back the score, card and mastery together', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const session = await begin(db, clock());
    const initial = prompt(session);
    await db.execAsync("CREATE TRIGGER fail_round BEFORE UPDATE ON study_rounds WHEN NEW.revision > OLD.revision BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    await assert.rejects(rate(session, initial.token, 'known'));
    assert.equal(session.getSnapshot(), initial);
    assert.equal(await count(db, 'cards'), 0);
    assert.equal(await count(db, 'review_logs'), 0);
    assert.equal((await getSession(db, session.id)).total_count, 0);
    await db.execAsync('DROP TRIGGER fail_round');
    await rate(session, initial.token, 'known');
    assert.equal(session.getSnapshot().masteredCount, 0);
  } finally { close(); }
});

test('review due labels distinguish minutes, calendar days, due now and paused cards', () => {
  const now = new Date(2026, 8, 20, 12);
  assert.equal(reviewDueLabel(new Date(2026, 8, 20, 12, 10).toISOString(), now), '今天复习 · 约 10 分钟后');
  assert.equal(reviewDueLabel(new Date(2026, 8, 20, 15).toISOString(), now), '今天复习 · 约 3 小时后');
  assert.equal(reviewDueLabel(new Date(2026, 8, 21, 1).toISOString(), now), '1 天后复习');
  assert.equal(reviewDueLabel(new Date(2026, 8, 27, 12).toISOString(), now), '7 天后复习');
  assert.equal(reviewDueLabel(now.toISOString(), now), '已到复习时间');
  assert.equal(reviewDueLabel(now.toISOString(), now, true), '已暂停复习');
  assert.equal(reviewDueLabel('invalid', now), '复习时间暂不可用');
});

test('first review uses 1/3/5 days from scored appearances, with first Again always next day', () => {
  assert.equal(initialReviewDays([3, 3, 3]), 5);
  assert.equal(initialReviewDays([2, 3, 3, 3]), 3);
  assert.equal(initialReviewDays([2, 2, 3, 3, 3]), 1);
  assert.equal(initialReviewDays([1, 3, 3]), 1);
  assert.equal(initialReviewDays([2, 1, 3, 3]), 1);
  assert.equal(initialReviewDays([1, 1, 1, 2, 3, 3]), 1);
  assert.equal(initialReviewDays([2]), 1); // Not yet recalled: conservative next-day review.
  assert.equal(initialReviewDays([2, 2, 2]), 1);
  assert.throws(() => initialReviewDays([]));
  assert.throws(() => initialReviewDays([4]));
  const late = new Date(2026, 8, 20, 23, 59);
  assert.equal(firstReviewDue(late, 1).getTime(), new Date(2026, 8, 21).getTime());
  assert.equal(firstReviewDue(late, 3).getTime(), new Date(2026, 8, 23).getTime());
  assert.equal(firstReviewDue(late, 5).getTime(), new Date(2026, 8, 25).getTime());
});

test('initial schedule is calendar-based across DST and month/year boundaries', () => {
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    assert.equal(firstReviewDue(new Date(2026, 2, 8, 23, 55), 1).getTime(), new Date(2026, 2, 9).getTime());
    assert.equal(firstReviewDue(new Date(2026, 10, 1, 0, 5), 1).getTime(), new Date(2026, 10, 2).getTime());
    assert.equal(firstReviewDue(new Date(2026, 11, 31, 23, 55), 3).getTime(), new Date(2027, 0, 3).getTime());
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});

test('study, summary and home due counts agree on the 1/3/5 first-review schedule', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const startedAt = time.now();
    const session = await begin(db, time);
    const histories = new Map<string, number[]>();
    let firstIndex = 0;
    const policies = new Map<string, UserRating[]>();
    const done = await finish(session, time, view => {
      const id = view.item.word.wordId;
      if (!policies.has(id)) {
        const index = firstIndex++;
        policies.set(id, index === 0 ? ['uncertain', 'unknown', 'known', 'known'] : index === 1 ? ['uncertain', 'known'] : index === 2 ? ['unknown', 'known', 'known'] : ['known']);
      }
      const rating = policies.get(id)![view.item.attempt - 1] ?? 'known';
      histories.set(id, [...(histories.get(id) ?? []), userRatingToFsrsRating(rating)]);
      return rating;
    });
    assert.equal(done.words.length, 10);
    assert.equal((await getHomeData(db, time.now())).due, 0);
    for (const word of done.words) {
      const days = initialReviewDays(histories.get(word.wordId)!);
      const card = (await getCardByWordId(db, word.wordId))!;
      const fsrs = deserializeFsrsCard(card.fsrs_card_json);
      assert.equal(word.dueAt, firstReviewDue(startedAt, days).toISOString());
      assert.equal(card.due_at, word.dueAt);
      assert.equal(fsrs.due.toISOString(), word.dueAt);
      assert.equal(fsrs.scheduled_days, days);
      assert.equal(fsrs.reps, histories.get(word.wordId)!.length);
      assert.equal(reviewDueLabel(word.dueAt, time.now()), days + ' 天后复习');
    }
    assert.equal((await getHomeData(db, firstReviewDue(startedAt, 1))).due, 2);
    assert.equal((await getHomeData(db, firstReviewDue(startedAt, 3))).due, 3);
    assert.equal((await getHomeData(db, firstReviewDue(startedAt, 5))).due, 10);
  } finally { close(); }
});

test('today reconciliation preserves FSRS memory and logs and never moves schedules on repeated starts or real reviews', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const time = clock();
    const session = await begin(db, time);
    const done = await finish(session, time);
    const word = done.words[0];
    const original = (await getCardByWordId(db, word.wordId))!;
    const fsrs = deserializeFsrsCard(original.fsrs_card_json);
    const oldDue = new Date(time.now().getTime() + 600000);
    await db.runAsync('UPDATE cards SET due_at = ?, fsrs_card_json = ? WHERE word_id = ?', oldDue.toISOString(), serializeFsrsCard({ ...fsrs, due: oldDue, scheduled_days: 0 }), word.wordId);
    const logCount = await count(db, 'review_logs');
    await reconcileTodaysInitialReviews(db, time.now());
    assert.deepEqual(await getCardByWordId(db, word.wordId), original);
    time.tick(3600000);
    await reconcileTodaysInitialReviews(db, time.now());
    assert.deepEqual(await getCardByWordId(db, word.wordId), original);
    assert.equal(await count(db, 'review_logs'), logCount);
    const formalDue = firstReviewDue(time.now(), 9).toISOString();
    await db.runAsync('UPDATE cards SET due_at = ? WHERE word_id = ?', formalDue, word.wordId);
    await db.runAsync("INSERT INTO review_logs (id, word_id, rating, context, reviewed_at, fsrs_log_json) VALUES (?, ?, 3, 'review', ?, '{}')", randomUUID(), word.wordId, time.now().toISOString());
    await reconcileTodaysInitialReviews(db, time.now());
    assert.equal((await getCardByWordId(db, word.wordId))?.due_at, formalDue);
    // Prior-day new words are not rescheduled just because the app opens today.
    await db.runAsync("UPDATE cards SET due_at = ?, first_learned_at = ? WHERE word_id = ?", formalDue, new Date(2026, 8, 18, 12).toISOString(), done.words[1].wordId);
    await reconcileTodaysInitialReviews(db, time.now());
    assert.equal((await getCardByWordId(db, done.words[1].wordId))?.due_at, formalDue);
  } finally { close(); }
});
