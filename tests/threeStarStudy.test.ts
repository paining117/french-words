import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeSampleDatabase as initializeDatabase } from '../src/db/database';
import type { Database } from '../src/db/connection';
import { importWordBook } from '../scripts/import-wordbook';
import { startStudy, type StudySession } from '../src/services/studyService';
import { createStudyQueue, advanceStudyQueue, completesMastery, isReinforcement, starsAfterAnswer } from '../src/services/studyQueue';
import { prepareMeaningChoices } from '../src/services/meaningChoices';
import { getCardByWordId } from '../src/repositories/cardRepository';
import { getStudyRound } from '../src/repositories/studyRoundRepository';
import { getReviewLog } from '../src/repositories/reviewRepository';
import { openTestDatabase } from './sqliteAdapter';
import type { DailyStudyRound, StudyWord } from '../src/types/study';

const now = () => new Date(2026, 8, 20, 12);
const word: StudyWord = { wordId: 'test', lemma: 'essai', meaningsZh: ['尝试'], examples: [] };
const prompt = (session: StudySession) => {
  const view = session.getSnapshot();
  assert.equal(view.status, 'prompt');
  if (view.status !== 'prompt') throw new Error('Expected prompt');
  return view;
};
async function begin(db: Database) {
  const result = await startStudy(db, { createId: randomUUID, now });
  if (result.kind !== 'session') throw new Error('Expected session');
  return result.session;
}
async function singleWord(db: Database) {
  await initializeDatabase(db);
  await importWordBook(db, { id: 'three-star', name: 'Three star', words: [{ lemma: 'essai-test', partOfSpeech: 'noun', meaningsZh: ['尝试', '试验'] }] });
  await db.runAsync("UPDATE settings SET value = 'three-star' WHERE key = 'current_book_id'");
  return begin(db);
}
async function answerKnown(session: StudySession) {
  const view = prompt(session);
  return view.item.phase === 'choice' ? session.submitChoice(view.token, view.item.word.wordId) : session.submitRating(view.token, 'known');
}

test('all new words start with three stars and failures reset to choice until three consecutive successes', () => {
  const fresh = createStudyQueue([word]);
  assert.equal(isReinforcement(fresh[0]), true);
  assert.equal(advanceStudyQueue(fresh, 'known')[0].stars, 1);
  let queue = advanceStudyQueue(fresh, 'unknown');
  for (let i = 0; i < 8; i++) { assert.equal(queue[0].phase, 'choice'); assert.equal(isReinforcement(queue[0]), true); queue = advanceStudyQueue(queue, 'unknown'); }
  assert.equal(queue[0].phase, 'choice'); assert.equal(queue[0].stars, 0);
  assert.equal(advanceStudyQueue(fresh, 'uncertain')[0].phase, 'choice');
  for (const [phase, stars] of [['choice', 0], ['meaning', 1], ['recall', 2]] as const) {
    assert.equal(queue[0].phase, phase); assert.equal(queue[0].stars, stars);
    assert.equal(completesMastery(queue[0], 'known'), phase === 'recall');
    const reset = advanceStudyQueue(queue, 'unknown');
    assert.equal(reset[0].phase, 'choice'); assert.equal(reset[0].stars, 0);
    assert.equal(starsAfterAnswer(queue[0], 'unknown'), 0);
    assert.equal(starsAfterAnswer(queue[0], 'known'), stars + 1);
    queue = advanceStudyQueue(queue, 'known');
  }
  assert.equal(queue.length, 0);
});

test('meaning options use four distinct real meanings and exclude target synonyms and duplicate labels', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    await importWordBook(db, { id: 'synonyms', name: 'Synonyms', words: [
      { lemma: 'duplicate-a', partOfSpeech: 'noun', meaningsZh: ['尝试'] },
      { lemma: 'duplicate-b', partOfSpeech: 'noun', meaningsZh: ['试验；尝试'] },
    ] });
    const [prepared] = await prepareMeaningChoices(db, [{ ...word, meaningsZh: ['尝试', '试验'] }]);
    assert.equal(prepared.meaningChoices?.length, 4);
    assert.equal(prepared.meaningChoices!.filter(choice => choice.id === word.wordId).length, 1);
    assert.equal(new Set(prepared.meaningChoices!.map(choice => choice.meaning)).size, 4);
    for (const choice of prepared.meaningChoices!.filter(choice => choice.id !== word.wordId)) {
      assert.doesNotMatch(choice.meaning, /尝试|试验/);
      assert.ok(await db.getFirstAsync('SELECT id FROM words WHERE id = ?', choice.id));
    }
    assert.deepEqual((await prepareMeaningChoices(db, [prepared]))[0], prepared);
  } finally { close(); }
});

test('four-choice scoring is validated by the service, wrong choices reset progress and keep next-day review', async () => {
  const { db, close } = openTestDatabase();
  try {
    const session = await singleWord(db);
    let view = prompt(session);
    await session.submitRating(view.token, 'uncertain'); await session.continue(view.token);
    view = prompt(session);
    await assert.rejects(session.submitRating(view.token, 'known'), /valid meaning/);
    await assert.rejects(session.submitChoice(view.token, 'forged-id'), /valid meaning/);
    assert.equal(session.getSnapshot(), view);
    const wrong = view.item.word.meaningChoices!.find(choice => choice.id !== view.item.word.wordId)!;
    const failed = await session.submitChoice(view.token, wrong.id);
    if (failed.status !== 'answer') throw new Error('Expected answer');
    assert.equal(failed.answerRating, 'unknown'); assert.equal(failed.selectedChoiceId, wrong.id);
    assert.equal(failed.item.stars, 0); assert.equal(failed.masteredCount, 0);
    assert.equal((await getReviewLog(db, view.token))?.rating, 1);
    await session.continue(view.token);
    for (const stars of [1, 2, 3]) {
      const current = prompt(session);
      const answer = await answerKnown(session);
      if (answer.status !== 'answer') throw new Error('Expected answer');
      assert.equal(answer.item.stars, stars); assert.equal(answer.masteredCount, Number(stars === 3));
      await session.continue(current.token);
    }
    assert.equal(session.getSnapshot().status, 'completed');
    assert.equal((await getCardByWordId(db, view.item.word.wordId))?.due_at, new Date(2026, 8, 21).toISOString());
  } finally { close(); }
});

test('each prompt and answer survives process restart with exactly the same choices and star count', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'three-star-resume-'));
  const path = join(folder, 'study.db');
  let store = openTestDatabase(path);
  try {
    let session = await singleWord(store.db);
    const first = prompt(session);
    await session.submitRating(first.token, 'unknown'); await session.continue(first.token);
    const choices = prompt(session).item.word.meaningChoices;
    for (const [phase, stars] of [['choice', 0], ['meaning', 1], ['recall', 2]] as const) {
      const before = prompt(session);
      assert.equal(before.item.phase, phase); assert.equal(before.item.stars, stars);
      store.close(); store = openTestDatabase(path); await initializeDatabase(store.db); session = await begin(store.db);
      assert.deepEqual(prompt(session), JSON.parse(JSON.stringify(before)));
      assert.deepEqual(prompt(session).item.word.meaningChoices, choices);
      const answer = await answerKnown(session);
      if (answer.status !== 'answer') throw new Error('Expected answer');
      assert.equal(answer.item.stars, stars + 1);
      store.close(); store = openTestDatabase(path); await initializeDatabase(store.db); session = await begin(store.db);
      assert.deepEqual(session.getSnapshot(), JSON.parse(JSON.stringify(answer)));
      await session.continue(before.token);
    }
    assert.equal(session.getSnapshot().status, 'completed');
    assert.equal(session.getSnapshot().masteredCount, 1);
    assert.equal((await store.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM review_logs'))?.n, 4);
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('a failed option commit cannot fill a star, and concurrent taps record one option only', async () => {
  const { db, close } = openTestDatabase();
  try {
    const session = await singleWord(db);
    const fresh = prompt(session);
    await session.submitRating(fresh.token, 'uncertain'); await session.continue(fresh.token);
    const view = prompt(session);
    const card = await getCardByWordId(db, view.item.word.wordId);
    await db.execAsync("CREATE TRIGGER fail_star BEFORE UPDATE ON study_rounds BEGIN SELECT RAISE(ABORT, 'fail'); END;");
    await assert.rejects(session.submitChoice(view.token, view.item.word.wordId));
    assert.equal(session.getSnapshot(), view);
    assert.equal(await getReviewLog(db, view.token), null);
    assert.deepEqual(await getCardByWordId(db, view.item.word.wordId), card);
    await db.execAsync('DROP TRIGGER fail_star');
    const wrong = view.item.word.meaningChoices!.find(choice => choice.id !== view.item.word.wordId)!;
    const [correct, duplicate] = await Promise.all([session.submitChoice(view.token, view.item.word.wordId), session.submitChoice(view.token, wrong.id)]);
    assert.equal(correct, duplicate);
    if (correct.status !== 'answer') throw new Error('Expected answer');
    assert.equal(correct.item.stars, 1); assert.equal(correct.selectedChoiceId, view.item.word.wordId);
    assert.equal((await getReviewLog(db, view.token))?.rating, 3);
    assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM review_logs'))?.n, 2);
  } finally { close(); }
});

test('failing the final recall clears two stars and requires all three stages again', async () => {
  const { db, close } = openTestDatabase();
  try {
    const session = await singleWord(db);
    const fresh = prompt(session);
    await session.submitRating(fresh.token, 'uncertain'); await session.continue(fresh.token);
    for (let i = 0; i < 2; i++) { const view = prompt(session); await answerKnown(session); await session.continue(view.token); }
    const recall = prompt(session);
    assert.equal(recall.item.phase, 'recall'); assert.equal(recall.item.stars, 2);
    const failed = await session.submitRating(recall.token, 'unknown');
    if (failed.status !== 'answer') throw new Error('Expected answer');
    assert.equal(failed.item.stars, 0); assert.equal(failed.masteredCount, 0);
    const resumed = await begin(db);
    await resumed.continue(recall.token);
    assert.equal(prompt(resumed).item.phase, 'choice'); assert.equal(prompt(resumed).item.stars, 0);
    for (let i = 0; i < 3; i++) { const view = prompt(resumed); const answer = await answerKnown(resumed); assert.equal(answer.masteredCount, Number(i === 2)); await resumed.continue(view.token); }
    assert.equal(resumed.getSnapshot().status, 'completed');
  } finally { close(); }
});

test('saved legacy confirmation upgrades once without rewriting logs or treating old confirmation as three stars', async () => {
  const { db, close } = openTestDatabase();
  try {
    const session = await singleWord(db);
    const fresh = prompt(session);
    await session.submitRating(fresh.token, 'unknown'); await session.continue(fresh.token);
    const relearn = prompt(session);
    await answerKnown(session); await session.continue(relearn.token);
    const saved = (await getStudyRound(db, '2026-09-20'))!;
    const legacy = JSON.parse(JSON.stringify(saved.state)) as DailyStudyRound;
    delete legacy.reinforcementVersion;
    for (const item of legacy.queue) { delete item.phase; delete item.stars; item.requiresConfirmation = true; item.confirmationPending = true; delete item.word.meaningChoices; }
    for (const item of legacy.words) delete item.meaningChoices;
    if (legacy.snapshot.status !== 'prompt') throw new Error('Expected prompt');
    delete legacy.snapshot.item.phase; delete legacy.snapshot.item.stars; delete legacy.snapshot.item.word.meaningChoices;
    legacy.snapshot.item.requiresConfirmation = true; legacy.snapshot.item.confirmationPending = true;
    await db.runAsync('UPDATE study_rounds SET state_json = ? WHERE local_date = ?', JSON.stringify(legacy), legacy.date);
    const logsBefore = await db.getAllAsync('SELECT * FROM review_logs ORDER BY rowid');
    const upgraded = await begin(db);
    assert.equal(upgraded.id, session.id); assert.equal(prompt(upgraded).item.phase, 'choice');
    assert.equal(prompt(upgraded).item.stars, 0); assert.equal(prompt(upgraded).masteredCount, 0);
    assert.equal(prompt(upgraded).item.word.meaningChoices?.length, 4);
    const revision = (await getStudyRound(db, legacy.date))!.revision;
    await begin(db);
    assert.equal((await getStudyRound(db, legacy.date))!.revision, revision);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM review_logs ORDER BY rowid'), logsBefore);
  } finally { close(); }
});

test('existing choice answers gain French labels without changing option order, chosen answer, stars or logs', async () => {
  const { db, close } = openTestDatabase();
  try {
    const session = await singleWord(db); const first = prompt(session);
    const wrong = first.item.word.meaningChoices!.find(choice => choice.id !== first.item.word.wordId)!;
    await session.submitChoice(first.token, wrong.id);
    const saved = (await getStudyRound(db, '2026-09-20'))!;
    const old = JSON.parse(JSON.stringify(saved.state)) as DailyStudyRound;
    for (const word of old.words) for (const choice of word.meaningChoices ?? []) delete choice.lemma;
    for (const item of old.queue) for (const choice of item.word.meaningChoices ?? []) delete choice.lemma;
    if (old.snapshot.status === 'completed') throw Error('Expected answer');
    for (const choice of old.snapshot.item.word.meaningChoices ?? []) delete choice.lemma;
    const before = await db.getAllAsync('SELECT * FROM review_logs');
    const card = await getCardByWordId(db, first.item.word.wordId);
    await db.runAsync('UPDATE study_rounds SET state_json = ? WHERE round_id = ?', JSON.stringify(old), old.sessionId);
    const resumed = await begin(db); const response = resumed.getSnapshot();
    if (response.status !== 'answer') throw Error('Expected saved answer');
    assert.equal(response.selectedChoiceId, wrong.id); assert.equal(response.item.stars, 0);
    assert.deepEqual(response.item.word.meaningChoices!.map(choice => choice.id), first.item.word.meaningChoices!.map(choice => choice.id));
    for (const choice of response.item.word.meaningChoices!) {
      assert.equal(choice.lemma, (await db.getFirstAsync<{ lemma: string }>('SELECT lemma FROM words WHERE id = ?', choice.id))!.lemma);
    }
    assert.deepEqual(await db.getAllAsync('SELECT * FROM review_logs'), before); assert.deepEqual(await getCardByWordId(db, first.item.word.wordId), card);
    const revision = (await getStudyRound(db, old.date))!.revision; await begin(db);
    assert.equal((await getStudyRound(db, old.date))!.revision, revision);
  } finally { close(); }
});
