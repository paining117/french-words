import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeSampleDatabase as initializeDatabase } from '../src/db/database';
import { migrateDatabase } from '../src/db/migrations';
import { startStudy, type StudySession } from '../src/services/studyService';
import { getStudyRoundById } from '../src/repositories/studyRoundRepository';
import { getHomeData } from '../src/services/homeService';
import { getCardByWordId } from '../src/repositories/cardRepository';
import { openTestDatabase } from './sqliteAdapter';
import type { Database } from '../src/db/connection';
import type { UserRating, DailyStudyRound } from '../src/types/study';

const now = () => new Date(2026, 8, 20, 12);
async function begin(db: Database, clock = now) { const r = await startStudy(db, { createId: randomUUID, now: clock }); if (r.kind !== 'session') throw Error('Expected session'); return r.session; }
async function step(session: StudySession, rating: UserRating = 'known') {
  const v = session.getSnapshot(); if (v.status !== 'prompt') throw Error('Expected prompt');
  const answer = v.item.phase === 'choice' && rating === 'known' ? await session.submitChoice(v.token, v.item.word.wordId) : await session.submitRating(v.token, rating);
  await session.continue(v.token); return answer;
}
async function finish(session: StudySession) {
  for (let i = 0; i < 100; i++) { const v = session.getSnapshot(); if (v.status === 'completed') return v; await step(session); }
  throw Error('Did not complete');
}
test('same day can finish all 66 words in six ten-word rounds and one six-word round without duplication', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db); const seen = new Set<string>(); const sessions = new Set<string>();
    for (let round = 0; round < 7; round++) {
      const home = await getHomeData(db, now()); assert.equal(home.availableNewWords, round === 6 ? 6 : 10);
      const session = await begin(db); sessions.add(session.id);
      assert.equal(session.total, round === 6 ? 6 : 10);
      const done = await finish(session);
      for (const word of done.words) { assert.ok(!seen.has(word.wordId)); seen.add(word.wordId); assert.equal(word.dueAt, new Date(2026, 8, 25).toISOString()); }
      assert.equal(done.learnedToday, seen.size); assert.equal(done.masteredCount, session.total);
      assert.deepEqual((await getStudyRoundById(db, session.id))?.state.snapshot, done);
    }
    assert.equal(seen.size, 66); assert.equal(sessions.size, 7);
    assert.deepEqual(await startStudy(db, { createId: randomUUID, now }), { kind: 'empty', reason: 'book-complete' });
    assert.equal((await getHomeData(db, now())).availableNewWords, 0);
    assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM review_logs'))!.n, 198);
    assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM checkins'))!.n, 1);
  } finally { close(); }
});
test('completed summary stays saved, next round resumes exact stars across midnight and older controllers cannot touch it', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db); const one = await begin(db); const done = await finish(one);
    const two = await begin(db); assert.notEqual(two.id, one.id);
    for (let i = 0; i < 11; i++) await step(two);
    const before = two.getSnapshot();
    const tomorrow = await begin(db, () => new Date(2026, 8, 21, 1));
    assert.equal(tomorrow.id, two.id); assert.deepEqual(tomorrow.getSnapshot(), JSON.parse(JSON.stringify(before)));
    assert.deepEqual((await getStudyRoundById(db, one.id))!.state.snapshot, done);
    assert.equal((await one.submitRating('stale', 'unknown')).status, 'completed');
    assert.deepEqual((await getStudyRoundById(db, two.id))!.state.snapshot, JSON.parse(JSON.stringify(before)));
    const home = await getHomeData(db, new Date(2026, 8, 21, 1)); assert.equal(home.roundPending, true); assert.equal(home.remainingToMaster, 10);
  } finally { close(); }
});
test('initial review intervals use scored appearances; opening an unanswered word does not increase its count', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db); let session = await begin(db); const policies = new Map<string, UserRating[]>(); const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const v = session.getSnapshot(); if (v.status === 'completed') break;
      const id = v.item.word.wordId;
      if (!policies.has(id)) policies.set(id, policies.size === 0 ? ['unknown'] : policies.size === 1 ? ['uncertain'] : policies.size === 2 ? ['known', 'unknown'] : []);
      const again = await begin(db); assert.equal(again.getSnapshot().status, 'prompt'); assert.deepEqual(again.getSnapshot(), JSON.parse(JSON.stringify(v))); session = again;
      await step(session, policies.get(id)![v.item.attempt - 1] ?? 'known'); counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const done = session.getSnapshot(); if (done.status !== 'completed') throw Error('Expected completed');
    for (const [index, word] of done.words.entries()) {
      const expected = index === 0 || index === 2 ? 1 : index === 1 ? 3 : 5;
      assert.equal(word.dueAt, new Date(2026, 8, 20 + expected).toISOString());
      assert.equal(counts.get(word.wordId), index === 0 || index === 1 ? 4 : index === 2 ? 5 : 3);
    }
  } finally { close(); }
});
test('v2 migration retains saved words, cards, logs, first-star progress and mastered words without a data reset', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db); const session = await begin(db);
    await step(session); const saved = (await getStudyRoundById(db, session.id))!;
    const old: DailyStudyRound = { ...saved.state, reinforcementVersion: 2 };
    const firstId = old.words[0].wordId;
    const card = await getCardByWordId(db, firstId); const logs = await db.getAllAsync('SELECT * FROM review_logs');
    // Remove Phase 5 additions so this fixture actually represents a v2 installation.
    await db.execAsync(`DROP TABLE study_completion; DROP TABLE familiar_actions; DROP TABLE familiar_marks; ALTER TABLE sessions DROP COLUMN manual_count; DROP INDEX idx_review_word_day; DROP INDEX idx_words_search; DROP INDEX idx_words_display_search; DROP INDEX idx_words_identity;
      DROP TABLE dictionary_word_map; ALTER TABLE words DROP COLUMN search_key; ALTER TABLE words DROP COLUMN display_search_key;
      ALTER TABLE words DROP COLUMN homograph_key; ALTER TABLE examples DROP COLUMN source_ref; ALTER TABLE examples DROP COLUMN attribution;
      CREATE UNIQUE INDEX idx_words_identity ON words(normalized_lemma, COALESCE(part_of_speech, ''));`);
    // Recreate the previously shipped v2 table shape around real saved data.
    await db.execAsync('DROP TABLE study_rounds; CREATE TABLE study_rounds (local_date TEXT PRIMARY KEY NOT NULL, state_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0); PRAGMA user_version = 2;');
    await db.runAsync('INSERT INTO study_rounds VALUES (?, ?, ?)', old.date, JSON.stringify(old), saved.revision);
    await migrateDatabase(db); await initializeDatabase(db);
    const migrated = (await getStudyRoundById(db, session.id))!;
    assert.deepEqual(migrated.state, old); assert.equal(migrated.revision, saved.revision);
    const resumed = await begin(db); assert.equal(resumed.id, session.id);
    const state = (await getStudyRoundById(db, session.id))!.state;
    assert.equal(state.reinforcementVersion, 3); assert.equal(state.queue.find(i => i.word.wordId === firstId)!.stars, 1);
    assert.deepEqual(await getCardByWordId(db, firstId), card); assert.deepEqual(await db.getAllAsync('SELECT * FROM review_logs'), logs);
    await initializeDatabase(db); assert.deepEqual(await getCardByWordId(db, firstId), card);
  } finally { close(); }
});
test('lost round creation response reuses pending round and creates neither extra session nor extra words', async () => {
  const { db, close } = openTestDatabase(); let lose = true;
  const flaky: Database = { ...db, async withExclusiveTransactionAsync(task) { await db.withExclusiveTransactionAsync(task); if (lose) { lose = false; throw Error('response lost'); } } };
  try {
    await initializeDatabase(db); await assert.rejects(begin(flaky)); const resumed = await begin(flaky);
    assert.equal(resumed.total, 10); assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM sessions'))!.n, 1);
    assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM study_rounds'))!.n, 1);
  } finally { close(); }
});
