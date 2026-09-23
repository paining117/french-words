import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeSampleDatabase as initializeDatabase } from '../src/db/database';
import type { Database } from '../src/db/connection';
import { openTestDatabase } from './sqliteAdapter';
import { insertCard, getCardByWordId, countDueCards } from '../src/repositories/cardRepository';
import { getSession } from '../src/repositories/sessionRepository';
import { createNewFsrsCard, getRetrievability } from '../src/services/fsrs/fsrs';
import { serializeFsrsCard, deserializeFsrsCard } from '../src/services/fsrs/serializeCard';
import { startReview, loadReviewQueue, sortReviewQueue, ReviewConflictError, type ReviewSession } from '../src/services/reviewService';
import { getReviewStats } from '../src/services/statsService';
import { getHomeData } from '../src/services/homeService';
import { reconcileTodaysInitialReviews } from '../src/services/initialReviewSchedule';
import type { UserRating } from '../src/types/study';
import type { ReviewQueueItem } from '../src/types/review';

function clock() { let ms = new Date(2026, 8, 25, 12).getTime(); return { now: () => new Date(ms), tick: (n = 1000) => { ms += n; } }; }
type Clock = ReturnType<typeof clock>;
async function seed(db: Database, count: number, time: Clock) {
  await initializeDatabase(db);
  const words = await db.getAllAsync<{ id: string }>('SELECT id FROM words ORDER BY id LIMIT ?', count);
  const old = new Date(time.now().getTime() - 10 * 86400000);
  for (const [index, word] of words.entries()) {
    const card = { ...createNewFsrsCard(old), state: 2, reps: 3, stability: index + 1, difficulty: 5, last_review: old, due: new Date(time.now().getTime() - 60000), scheduled_days: 3 };
    await insertCard(db, { word_id: word.id, fsrs_card_json: serializeFsrsCard(card), due_at: card.due.toISOString(), last_review_at: old.toISOString(), first_learned_at: old.toISOString(), origin: 'study', suspended: 0, created_at: old.toISOString() });
  }
  return words.map(word => word.id);
}
async function begin(db: Database, time: Clock) {
  const result = await startReview(db, { createId: randomUUID, now: time.now });
  assert.equal(result.kind, 'session');
  if (result.kind !== 'session') throw Error('Expected review');
  return result.session;
}
function prompt(session: ReviewSession) { const v = session.getSnapshot(); if (v.status !== 'prompt') throw Error('Expected prompt'); return v; }
async function rate(session: ReviewSession, token: string, rating: UserRating) {
  const v = session.getSnapshot();
  if (v.status === 'prompt' && v.token === token && v.item.phase === 'choice' && rating !== 'uncertain') {
    const id = rating === 'known' ? v.item.word.wordId : v.item.word.meaningChoices!.find(choice => choice.id !== v.item.word.wordId)!.id;
    return session.submitChoice(token, id);
  }
  return session.submitRating(token, rating);
}
async function answer(session: ReviewSession, rating: UserRating = 'known') { const v = prompt(session); await rate(session, v.token, rating); return session.continue(v.token); }
async function finish(session: ReviewSession) { for (let i = 0; i < 100; i++) { if (session.getSnapshot().status === 'completed') return; await answer(session); } throw Error('Review did not finish'); }
async function n(db: Database, table: 'sessions' | 'review_logs' | 'checkins') { return (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) n FROM ${table}`))!.n; }

test('global due cards form risk-sorted rounds of 20, 20 and 5 with exact summaries and cumulative statistics', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    const ids = await seed(db, 45, time);
    assert.equal(ids.length, 45);
    // The last row must win risk selection even though it falls beyond the first 20 database rows.
    const last = (await getCardByWordId(db, ids[44]))!;
    const risky = { ...deserializeFsrsCard(last.fsrs_card_json), stability: 0.1 };
    await db.runAsync('UPDATE cards SET fsrs_card_json = ? WHERE word_id = ?', serializeFsrsCard(risky), ids[44]);
    assert.equal((await loadReviewQueue(db, time.now())).queue[0].word.wordId, ids[44]);
    const seen = new Set<string>();
    for (const size of [20, 20, 5]) {
      assert.equal((await getHomeData(db, time.now())).due, 45 - seen.size);
      const session = await begin(db, time);
      assert.equal(prompt(session).total, size);
      const expected = (await loadReviewQueue(db, time.now())).queue.map(item => item.word);
      await finish(session);
      const done = session.getSnapshot();
      if (done.status !== 'completed') throw Error('Expected completed');
      assert.equal(done.words.length, size);
      assert.equal(done.reviewedCount, size);
      assert.deepEqual(done.words.map(word => word.wordId), expected.map(word => word.wordId));
      for (const [index, word] of done.words.entries()) {
        assert.equal(seen.has(word.wordId), false); seen.add(word.wordId);
        assert.equal(word.dueAt, (await getCardByWordId(db, word.wordId))!.due_at);
        assert.equal(word.partOfSpeech, expected[index].partOfSpeech);
        assert.equal(word.gender, expected[index].gender);
        assert.equal(word.meaning, expected[index].meaningsZh[0]);
      }
      assert.equal(done.reviewedToday, seen.size);
    }
    assert.equal(seen.size, 45);
    assert.equal(await n(db, 'review_logs'), 45);
    assert.equal(await n(db, 'sessions'), 3);
    assert.equal((await getHomeData(db, time.now())).due, 0);
    assert.deepEqual(await startReview(db, { createId: randomUUID, now: time.now }), { kind: 'empty', skipped: 0 });
  } finally { close(); }
});

test('review due boundary is global across books and excludes future and suspended cards', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    const ids = await seed(db, 4, time);
    await db.runAsync('UPDATE cards SET due_at = ? WHERE word_id = ?', time.now().toISOString(), ids[1]);
    await db.runAsync('UPDATE cards SET due_at = ? WHERE word_id = ?', new Date(time.now().getTime() + 1).toISOString(), ids[2]);
    await db.runAsync('UPDATE cards SET suspended = 1 WHERE word_id = ?', ids[3]);
    await db.runAsync("UPDATE settings SET value = 'my-vocabulary' WHERE key = 'current_book_id'");
    const { queue } = await loadReviewQueue(db, time.now());
    assert.deepEqual(new Set(queue.map(x => x.word.wordId)), new Set(ids.slice(0, 2)));
    assert.equal((await getHomeData(db, time.now())).due, 2);
  } finally { close(); }
});
test('no due cards creates no review session', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try { await initializeDatabase(db); assert.deepEqual(await startReview(db, { createId: randomUUID, now: time.now }), { kind: 'empty', skipped: 0 }); assert.equal(await n(db, 'sessions'), 0); }
  finally { close(); }
});
test('risk order uses ts-fsrs retrievability then due time; fallback is deterministic due order', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    const ids = await seed(db, 3, time);
    const { queue } = await loadReviewQueue(db, time.now());
    for (let i = 0; i < queue.length; i++) {
      assert.equal(queue[i].retrievability, getRetrievability(deserializeFsrsCard(queue[i].card.fsrs_card_json), time.now()));
      if (i) assert.ok(queue[i - 1].retrievability! <= queue[i].retrievability!);
    }
    const same: ReviewQueueItem[] = queue.map((item, i) => ({ ...item, retrievability: 0.5 + i * 1e-12, card: { ...item.card, due_at: new Date(time.now().getTime() - i * 1000).toISOString() } }));
    assert.deepEqual(sortReviewQueue(same).map(x => x.word.wordId), [...ids].reverse());
    same[0].retrievability = null;
    assert.deepEqual(sortReviewQueue(same).map(x => x.word.wordId), [...ids].reverse());
  } finally { close(); }
});
test('corrupt cards are skipped and preserved, all corrupt cards do not create an empty session', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    const ids = await seed(db, 2, time);
    await db.runAsync("UPDATE cards SET fsrs_card_json = 'broken' WHERE word_id = ?", ids[0]);
    const result = await startReview(db, { createId: randomUUID, now: time.now });
    assert.equal(result.kind, 'session'); assert.equal(result.skipped, 1);
    assert.equal((await getCardByWordId(db, ids[0]))!.fsrs_card_json, 'broken');
    await db.runAsync("UPDATE cards SET fsrs_card_json = 'broken'");
    assert.deepEqual(await startReview(db, { createId: randomUUID, now: time.now }), { kind: 'empty', skipped: 2 });
    assert.equal(await n(db, 'sessions'), 1); assert.equal(await countDueCards(db, time.now()), 2);
  } finally { close(); }
});
test('each rating updates FSRS and one review log at rating time, preserving card identity metadata', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    await seed(db, 3, time); const session = await begin(db, time);
    for (const [rating, grade] of [['known', 3], ['uncertain', 2], ['unknown', 1]] as const) {
      const v = prompt(session); const before = (await getCardByWordId(db, v.item.word.wordId))!;
      time.tick(60000); const at = time.now().toISOString();
      const afterView = await rate(session, v.token, rating);
      assert.equal(afterView.status, 'answer');
      const after = (await getCardByWordId(db, before.word_id))!;
      assert.equal(after.last_review_at, at);
      for (const key of ['origin', 'created_at', 'first_learned_at'] as const) assert.equal(after[key], before[key]);
      assert.notEqual(after.fsrs_card_json, before.fsrs_card_json);
      const fsrs = deserializeFsrsCard(after.fsrs_card_json);
      assert.equal(after.due_at, fsrs.due.toISOString()); assert.equal(fsrs.reps, 4);
      const log = await db.getFirstAsync<{ context: string; rating: number; reviewed_at: string; fsrs_log_json: string }>('SELECT * FROM review_logs WHERE id = ?', v.token);
      assert.equal(log!.context, 'review'); assert.equal(log!.rating, grade); assert.equal(log!.reviewed_at, at); assert.equal(JSON.parse(log!.fsrs_log_json).rating, grade);
      if (rating === 'unknown') { assert.ok(Date.parse(after.due_at) > Date.parse(at)); assert.ok(Date.parse(after.due_at) - Date.parse(at) < 86400000); }
      await session.continue(v.token);
    }
    await finish(session);
    const summary = await getSession(db, session.id);
    assert.equal(summary.type, 'review'); assert.ok(summary.ended_at);
    assert.deepEqual([summary.total_count, summary.good_count, summary.hard_count, summary.again_count], [3, 1, 1, 1]);
    assert.equal(session.getSnapshot().status, 'completed'); assert.equal(await n(db, 'checkins'), 1);
  } finally { close(); }
});
test('snapshot excludes newly due cards; failed words complete three-step practice without rescheduling their first Again', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    const ids = await seed(db, 3, time);
    await db.runAsync('UPDATE cards SET due_at = ? WHERE word_id = ?', new Date(time.now().getTime() + 60000).toISOString(), ids[2]);
    const session = await begin(db, time); const first = prompt(session);
    assert.equal(first.total, 2); await answer(session, 'unknown');
    const second = prompt(session); assert.notEqual(second.item.word.wordId, first.item.word.wordId);
    time.tick(20 * 60000); await answer(session);
    assert.equal(prompt(session).item.word.wordId, first.item.word.wordId);
    await finish(session);
    assert.equal(session.getSnapshot().status, 'completed');
    assert.equal((await getHomeData(db, time.now())).due, 1);
    const next = await begin(db, time); assert.equal(prompt(next).total, 1);
    const nextIds = (await loadReviewQueue(db, time.now())).queue.map(x => x.word.wordId);
    assert.ok(!nextIds.includes(first.item.word.wordId)); assert.ok(nextIds.includes(ids[2]));
  } finally { close(); }
});
test('duplicate taps and stale continue/rating events write once and cannot skip another card', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    await seed(db, 2, time); const session = await begin(db, time); const v = prompt(session);
    const [a, b] = await Promise.all([rate(session, v.token, 'known'), rate(session, v.token, 'unknown')]);
    assert.equal(a, b); assert.equal(a.reviewedCount, 1); assert.equal(await n(db, 'review_logs'), 1);
    await session.continue(v.token); const next = prompt(session);
    await session.continue(v.token); await rate(session, v.token, 'unknown');
    assert.equal(prompt(session), next); assert.equal(await n(db, 'review_logs'), 1);
  } finally { close(); }
});
for (const table of ['review_logs', 'sessions'] as const) test(`${table} write failure rolls back Card, Log and review counters`, async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    await seed(db, 1, time); const session = await begin(db, time); const v = prompt(session);
    const before = await getCardByWordId(db, v.item.word.wordId);
    await db.execAsync(`CREATE TRIGGER fail_review BEFORE ${table === 'sessions' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT, 'failure'); END;`);
    await assert.rejects(rate(session, v.token, 'known'));
    assert.deepEqual(await getCardByWordId(db, v.item.word.wordId), before); assert.equal(await n(db, 'review_logs'), 0); assert.equal(session.getSnapshot(), v);
    assert.equal((await getSession(db, session.id)).good_count, 0);
    await db.execAsync('DROP TRIGGER fail_review'); await answer(session); assert.equal(await n(db, 'review_logs'), 1);
  } finally { close(); }
});
test('a lost review commit response is recovered using the same receipt without a second FSRS update', async () => {
  const { db, close } = openTestDatabase(); const time = clock(); let lose = false;
  const flaky: Database = { ...db, async withExclusiveTransactionAsync(task) { await db.withExclusiveTransactionAsync(task); if (lose) { lose = false; throw Error('response lost'); } } };
  try {
    await seed(db, 1, time); const session = await begin(flaky, time); const v = prompt(session); lose = true;
    await assert.rejects(rate(session, v.token, 'unknown'));
    const saved = await getCardByWordId(db, v.item.word.wordId);
    const answer = await rate(session, v.token, 'known');
    assert.equal(answer.summary.again_count, 1); assert.equal(answer.summary.good_count, 0);
    assert.deepEqual(await getCardByWordId(db, v.item.word.wordId), saved); assert.equal(await n(db, 'review_logs'), 1);
  } finally { close(); }
});
test('two simultaneous review snapshots cannot rate the same changed card twice', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    await seed(db, 1, time); const one = await begin(db, time); const two = await begin(db, time);
    await rate(one, prompt(one).token, 'known');
    await assert.rejects(rate(two, prompt(two).token, 'unknown'), ReviewConflictError);
    assert.equal(await n(db, 'review_logs'), 1);
  } finally { close(); }
});
test('review completion and checkin are atomic and safe to retry', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    await seed(db, 1, time); const session = await begin(db, time); const v = prompt(session);
    await rate(session, v.token, 'known');
    await db.execAsync("CREATE TRIGGER fail_checkin BEFORE INSERT ON checkins BEGIN SELECT RAISE(ABORT, 'failure'); END;");
    await assert.rejects(session.continue(v.token)); assert.equal((await getSession(db, session.id)).ended_at, null); assert.equal(session.getSnapshot().status, 'answer');
    await db.execAsync('DROP TRIGGER fail_checkin'); await session.continue(v.token); await session.continue(v.token);
    assert.ok((await getSession(db, session.id)).ended_at); assert.equal(await n(db, 'checkins'), 1);
  } finally { close(); }
});
test('kill/reopen keeps rated cards and counters; next snapshot only contains remaining due cards', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'review-reopen-')); const path = join(folder, 'app.db'); let store = openTestDatabase(path); const time = clock();
  try {
    await seed(store.db, 10, time); const first = await begin(store.db, time); const completed: string[] = [];
    for (let i = 0; i < 3; i++) { completed.push(prompt(first).item.word.wordId); await answer(first); }
    const before = await store.db.getAllAsync('SELECT * FROM cards ORDER BY word_id');
    store.close(); store = openTestDatabase(path); await initializeDatabase(store.db);
    assert.deepEqual(await store.db.getAllAsync('SELECT * FROM cards ORDER BY word_id'), before);
    assert.equal((await getHomeData(store.db, time.now())).due, 7);
    const next = await begin(store.db, time); assert.notEqual(next.id, first.id); assert.equal(prompt(next).total, 7);
    assert.ok((await loadReviewQueue(store.db, time.now())).queue.every(item => !completed.includes(item.word.wordId)));
    const saved = await getSession(store.db, first.id); assert.equal(saved.good_count, 3); assert.equal(saved.ended_at, null);
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
});
test('formal stats exclude all study reinforcement and respect local-day boundaries', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    const ids = await seed(db, 2, time);
    for (let i = 0; i < 10; i++) await db.runAsync("INSERT INTO review_logs VALUES (?, ?, 3, 'study', ?, '{}')", randomUUID(), ids[0], time.now().toISOString());
    const session = await begin(db, time); await answer(session); await answer(session);
    assert.deepEqual(await getReviewStats(db, time.now()), { total: 2, today: 2 });
    time.tick(86400000); assert.deepEqual(await getReviewStats(db, time.now()), { total: 2, today: 0 });
    const before = await getCardByWordId(db, ids[0]); await reconcileTodaysInitialReviews(db, time.now()); assert.deepEqual(await getCardByWordId(db, ids[0]), before);
  } finally { close(); }
});

test('first review choice correct masters immediately and preserves the selected choice for green feedback', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    await seed(db, 1, time); const session = await begin(db, time); const first = prompt(session);
    assert.equal(first.item.phase, 'choice'); assert.equal(first.item.stars, 0);
    await assert.rejects(session.submitChoice(first.token, 'not-an-option'), /valid meaning/);
    await assert.rejects(session.submitRating(first.token, 'known'), /valid meaning/);
    assert.equal(await n(db, 'review_logs'), 0);
    const response = await session.submitChoice(first.token, first.item.word.wordId);
    if (response.status !== 'answer') throw Error('Expected answer');
    assert.equal(response.item.stars, 3); assert.equal(response.reviewedCount, 1);
    assert.equal(response.answerRating, 'known'); assert.equal(response.selectedChoiceId, first.item.word.wordId);
    assert.equal((await session.continue(first.token)).status, 'completed');
    assert.equal(await n(db, 'review_logs'), 1);
  } finally { close(); }
});

test('wrong review choice requires all three stages, later failures reset stars, and practice never inflates formal FSRS or counts', async () => {
  const { db, close } = openTestDatabase(); const time = clock();
  try {
    await seed(db, 1, time); const session = await begin(db, time); const first = prompt(session);
    const wrong = first.item.word.meaningChoices!.find(choice => choice.id !== first.item.word.wordId)!;
    assert.ok(wrong.lemma);
    const response = await session.submitChoice(first.token, wrong.id);
    if (response.status !== 'answer') throw Error('Expected answer');
    assert.equal(response.selectedChoiceId, wrong.id); assert.equal(response.answerRating, 'unknown');
    assert.equal(response.item.word.lemma, first.item.word.lemma); // Details remain the target, not the selected distractor.
    assert.equal(response.reviewedCount, 0); assert.equal(response.item.stars, 0);
    const scoredCard = await getCardByWordId(db, first.item.word.wordId);
    await session.continue(first.token);
    assert.equal(prompt(session).item.phase, 'choice');
    await answer(session); assert.equal(prompt(session).item.phase, 'meaning'); assert.equal(prompt(session).item.stars, 1);
    await answer(session); assert.equal(prompt(session).item.phase, 'recall'); assert.equal(prompt(session).item.stars, 2);
    await answer(session, 'unknown'); assert.equal(prompt(session).item.phase, 'choice'); assert.equal(prompt(session).item.stars, 0);
    for (let i = 0; i < 4; i++) { await answer(session, 'unknown'); assert.equal(prompt(session).reviewedCount, 0); }
    await finish(session);
    const done = session.getSnapshot(); assert.equal(done.status, 'completed'); assert.equal(done.reviewedCount, 1);
    if (done.status !== 'completed') throw Error('Expected completed');
    assert.equal(done.words.length, 1); assert.equal(done.words[0].wordId, first.item.word.wordId);
    assert.equal(done.words[0].dueAt, scoredCard!.due_at); assert.equal(done.reviewedToday, 1);
    assert.deepEqual([done.summary.total_count, done.summary.again_count, done.summary.good_count], [1, 1, 0]);
    assert.deepEqual(await getCardByWordId(db, first.item.word.wordId), scoredCard);
    assert.equal(await n(db, 'review_logs'), 1); assert.deepEqual(await getReviewStats(db, time.now()), { today: 1, total: 1 });
    assert.equal(await n(db, 'checkins'), 1);
  } finally { close(); }
});

test('a lost choice commit response recovers the original red selection even if retry chooses the correct option', async () => {
  const { db, close } = openTestDatabase(); const time = clock(); let lose = false;
  const flaky: Database = { ...db, async withExclusiveTransactionAsync(task) { await db.withExclusiveTransactionAsync(task); if (lose) { lose = false; throw Error('response lost'); } } };
  try {
    await seed(db, 1, time); const session = await begin(flaky, time); const first = prompt(session);
    const wrong = first.item.word.meaningChoices!.find(choice => choice.id !== first.item.word.wordId)!;
    lose = true; await assert.rejects(session.submitChoice(first.token, wrong.id));
    const restored = await session.submitChoice(first.token, first.item.word.wordId);
    if (restored.status !== 'answer') throw Error('Expected answer');
    assert.equal(restored.selectedChoiceId, wrong.id); assert.equal(restored.answerRating, 'unknown');
    assert.equal(restored.reviewedCount, 0); assert.equal(await n(db, 'review_logs'), 1);
  } finally { close(); }
});
