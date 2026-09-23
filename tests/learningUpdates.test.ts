import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestDatabase } from './sqliteAdapter';
import { initializeSampleDatabase } from '../src/db/database';
import { startStudy, resumeStudyCompletion, type StudySession } from '../src/services/studyService';
import { startReview } from '../src/services/reviewService';
import { firstReviewDue } from '../src/services/initialReviewSchedule';
import { getCardByWordId, getDueCards, countDueCards } from '../src/repositories/cardRepository';
import { getUnlearnedWords, addVocabularyWord, removeVocabularyWord, getWordsByBookId } from '../src/repositories/wordBookRepository';
import { FAMILIAR_BOOK_ID, undoFamiliar } from '../src/services/familiarService';
import { deserializeFsrsCard } from '../src/services/fsrs/serializeCard';
import { getSession } from '../src/repositories/sessionRepository';
import { createSpelling, checkSpelling, nextSpelling, spellingCharacters, saveCompletion, loadCompletion } from '../src/services/spellingService';
import type { Database } from '../src/db/connection';
import type { StudyReviewWord } from '../src/types/study';

const now = () => new Date(2026, 8, 23, 12);
async function study(db: Database): Promise<StudySession> {
  const result = await startStudy(db, { createId: randomUUID, now });
  if (result.kind !== 'session') throw Error('Missing study'); return result.session;
}
function prompt(session: StudySession) { const v = session.getSnapshot(); if (v.status === 'completed') throw Error('Unexpected completion'); return v; }
async function finish(session: StudySession) {
  for (let i = 0; i < 100; i++) {
    const v = session.getSnapshot(); if (v.status === 'completed') return v;
    if (v.status === 'prompt') {
      if (v.item.phase === 'choice') await session.submitChoice(v.token, v.item.word.wordId);
      else await session.submitRating(v.token, 'known');
    }
    await session.continue(v.token);
  }
  throw Error('Did not finish');
}
test('生 only adds a relation, familiar saves 30 days without rating, survives restart and can restore an unscored prompt', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); const s = await study(db), v = prompt(s), id = v.item.word.wordId;
    await addVocabularyWord(db, id); await addVocabularyWord(db, id);
    assert.equal(await getCardByWordId(db, id), null);
    assert.equal((await getWordsByBookId(db, 'my-vocabulary')).length, 1);
    await assert.rejects(s.markFamiliar(v.token));
    await removeVocabularyWord(db, id);
    await Promise.all([s.markFamiliar(v.token), s.markFamiliar(v.token)]);
    const c = (await getCardByWordId(db, id))!;
    assert.equal(c.due_at, firstReviewDue(now(), 30).toISOString());
    assert.equal(deserializeFsrsCard(c.fsrs_card_json).due.toISOString(), c.due_at);
    assert.equal((await db.getAllAsync('SELECT * FROM review_logs')).length, 0);
    assert.equal((await getWordsByBookId(db, FAMILIAR_BOOK_ID)).length, 1);
    assert.equal(prompt(s).familiar, true);
    const reopened = await study(db); assert.equal(prompt(reopened).familiar, true);
    await undoFamiliar(db, id);
    assert.equal(await getCardByWordId(db, id), null);
    const restored = await study(db);
    assert.equal(prompt(restored).masteredCount, 0);
    assert.equal((await getSession(db, s.id)).total_count, 0);
    assert.ok((await getUnlearnedWords(db, 'a1-core', 50)).some(w => w.id === id));
    // Marking the restored same word works again; the other nine words are retained.
    await finish(restored);
    const done = restored.getSnapshot(); assert.equal(done.status, 'completed');
    if (done.status === 'completed') assert.equal(done.words.length, 10);
    await removeVocabularyWord(db, id);
    assert.ok(await getCardByWordId(db, id));
  } finally { close(); }
});
test('marking a scored Study word can be undone without changing FSRS or historical logs', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); const s = await study(db), v = prompt(s), id = v.item.word.wordId;
    await s.submitChoice(v.token, id);
    const before = await getCardByWordId(db, id), logs = await db.getAllAsync('SELECT * FROM review_logs');
    await s.markFamiliar(v.token); await s.continue(v.token);
    await undoFamiliar(db, id);
    assert.deepEqual(await getCardByWordId(db, id), before);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM review_logs'), logs);
    const resumed = await study(db); const done = await finish(resumed);
    assert.equal(done.words.length, 10); assert.equal(done.masteredCount, 10);
    assert.equal((await getSession(db, resumed.id)).total_count, 10);
  } finally { close(); }
});
test('all words can be marked familiar, summary completes, undo returns an unlearned word to future Study', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); const s = await study(db); const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const v = prompt(s); ids.push(v.item.word.wordId);
      await s.markFamiliar(v.token); await s.continue(v.token);
    }
    const done = s.getSnapshot(); assert.equal(done.status, 'completed');
    if (done.status === 'completed') { assert.equal(done.words.length, 10); assert.equal(done.masteredCount, 10); }
    assert.equal((await db.getAllAsync('SELECT * FROM review_logs')).length, 0);
    await undoFamiliar(db, ids[0]); await undoFamiliar(db, ids[0]);
    const next = await study(db); assert.equal(prompt(next).item.word.wordId, ids[0]);
  } finally { close(); }
});
test('Review familiar action completes without a fake rating and restores the old due/Card exactly', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); const s = await study(db); const done = await finish(s);
    const later = () => firstReviewDue(now(), 10);
    const r = await startReview(db, { createId: randomUUID, now: later }); if (r.kind !== 'session') throw Error('Missing review');
    const before = await db.getAllAsync('SELECT * FROM cards ORDER BY word_id');
    const logs = await db.getAllAsync('SELECT * FROM review_logs');
    for (let i = 0; i < 10; i++) {
      const v = r.session.getSnapshot(); if (v.status !== 'prompt') throw Error('Missing prompt');
      await r.session.markFamiliar(v.token); await r.session.continue(v.token);
    }
    assert.equal(r.session.getSnapshot().status, 'completed');
    assert.deepEqual(await db.getAllAsync('SELECT * FROM review_logs'), logs);
    assert.equal((await getSession(db, r.session.id)).good_count, 0);
    for (const word of done.words) await undoFamiliar(db, word.wordId);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM cards ORDER BY word_id'), before);
  } finally { close(); }
});
test('Again due is tomorrow and a legacy same-day due is still excluded until the next local day', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); await finish(await study(db));
    const at = new Date(2026, 9, 4, 23, 50);
    const r = await startReview(db, { createId: randomUUID, now: () => at }); if (r.kind !== 'session') throw Error('Missing review');
    const v = r.session.getSnapshot(); if (v.status !== 'prompt') throw Error('Missing prompt');
    const wrong = v.item.word.meaningChoices!.find(c => c.id !== v.item.word.wordId)!;
    await r.session.submitChoice(v.token, wrong.id);
    const card = (await getCardByWordId(db, v.item.word.wordId))!;
    assert.equal(card.due_at, firstReviewDue(at, 1).toISOString());
    assert.equal(deserializeFsrsCard(card.fsrs_card_json).due.toISOString(), card.due_at);
    assert.equal(await countDueCards(db, at), 9);
    await db.runAsync('UPDATE cards SET due_at = ? WHERE word_id = ?', at.toISOString(), card.word_id);
    assert.equal((await getDueCards(db, at)).some(c => c.word_id === card.word_id), false);
    assert.equal(await countDueCards(db, at), 9);
    assert.equal((await getDueCards(db, firstReviewDue(at, 1))).some(c => c.word_id === card.word_id), true);
  } finally { close(); }
});
test('failed familiar writes roll back both queue and card; lost commit recovery does not duplicate accounting', async () => {
  const { db, close } = openTestDatabase(); let fail = false;
  const flaky: Database = { ...db, async withExclusiveTransactionAsync(task) { await db.withExclusiveTransactionAsync(task); if (fail) { fail = false; throw Error('lost response'); } } };
  try {
    await initializeSampleDatabase(db); const s = await study(flaky), v = prompt(s);
    await db.execAsync("CREATE TRIGGER reject_familiar BEFORE INSERT ON familiar_marks BEGIN SELECT RAISE(ABORT, 'disk full'); END");
    await assert.rejects(s.markFamiliar(v.token)); assert.deepEqual(s.getSnapshot(), v);
    assert.equal(await getCardByWordId(db, v.item.word.wordId), null);
    await db.execAsync('DROP TRIGGER reject_familiar'); fail = true;
    await assert.rejects(s.markFamiliar(v.token)); await s.markFamiliar(v.token);
    assert.equal(prompt(s).familiar, true); assert.equal((await getSession(db, s.id)).total_count, 1);
    assert.equal((await getWordsByBookId(db, FAMILIAR_BOOK_ID)).length, 1);
  } finally { close(); }
});
test('undo permits marking the same prompt again, and an already familiar due word can be marked for another 30 days', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); let s = await study(db); const first = prompt(s), id = first.item.word.wordId;
    await s.markFamiliar(first.token); await undoFamiliar(db, id);
    s = await study(db);
    // Undo keeps the other pending words; find the restored word after them.
    for (let i = 0; i < 30 && prompt(s).item.word.wordId !== id; i++) {
      const v = prompt(s); await s.markFamiliar(v.token); await s.continue(v.token);
    }
    const v = prompt(s); assert.equal(v.item.word.wordId, id);
    await s.markFamiliar(v.token); assert.ok(await getCardByWordId(db, id)); await s.continue(v.token);
    const at = firstReviewDue(now(), 31), before = (await getCardByWordId(db, id))!;
    const r = await startReview(db, { createId: randomUUID, now: () => at }); if (r.kind !== 'session') throw Error('Missing review');
    for (let i = 0; i < 10; i++) {
      const rv = r.session.getSnapshot(); if (rv.status !== 'prompt') throw Error('Missing prompt');
      await r.session.markFamiliar(rv.token); await r.session.continue(rv.token);
    }
    assert.equal((await getCardByWordId(db, id))!.due_at, firstReviewDue(at, 30).toISOString());
    await undoFamiliar(db, id); assert.deepEqual(await getCardByWordId(db, id), before);
  } finally { close(); }
});
test('undo an older familiar mark preserves any subsequent real review and its log', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); const s = await study(db); const v = prompt(s), id = v.item.word.wordId;
    await s.markFamiliar(v.token); await s.continue(v.token); await finish(s);
    const r = await startReview(db, { createId: randomUUID, now: () => firstReviewDue(now(), 31) }); if (r.kind !== 'session') throw Error('Missing review');
    for (let i = 0; i < 10; i++) {
      const rv = r.session.getSnapshot(); if (rv.status !== 'prompt') throw Error('Missing prompt');
      await r.session.submitChoice(rv.token, rv.item.word.wordId); await r.session.continue(rv.token);
    }
    const card = await getCardByWordId(db, id), logs = await db.getAllAsync('SELECT * FROM review_logs');
    await undoFamiliar(db, id);
    assert.deepEqual(await getCardByWordId(db, id), card);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM review_logs'), logs);
    assert.equal((await getWordsByBookId(db, FAMILIAR_BOOK_ID)).length, 0);
  } finally { close(); }
});

function spellingWords(): StudyReviewWord[] { return ['école', 'cœur', 'être', 'voiture'].map(lemma => ({ wordId: lemma, lemma, meaning: lemma, dueAt: now().toISOString(), suspended: false })); }
test('spelling accepts English/French keyboards and never masters a word merely corrected after an error', () => {
  for (const input of ['ecole', 'ÉCOLE', ' e\u0301cole ']) assert.equal(checkSpelling(createSpelling(spellingWords()), input, 'école').status, 'correct');
  assert.equal(checkSpelling(createSpelling(spellingWords()), 'coeur', 'cœur').status, 'correct');
  assert.equal(checkSpelling(createSpelling(spellingWords()), 'ecoles', 'école').status, 'wrong');
  let state = createSpelling(spellingWords());
  state = checkSpelling(state, 'ecol', 'école'); assert.equal(state.mastered.length, 0);
  assert.deepEqual(nextSpelling(state), state);
  state = checkSpelling(state, 'ecole', 'école'); assert.equal(state.mastered.length, 0);
  state = nextSpelling(state); assert.deepEqual(state.queue, ['cœur', 'être', 'voiture', 'école']);
  for (const word of ['cœur', 'être', 'voiture', 'école']) { state = checkSpelling(state, word, word); state = nextSpelling(state); }
  assert.equal(state.status, 'done'); assert.equal(state.mastered.length, 4);
});
test('last spelling word repeats after correction until directly right; typo alignment isolates insertions', () => {
  let state = createSpelling(spellingWords().slice(0, 1));
  for (let i = 0; i < 3; i++) {
    state = checkSpelling(state, 'no', 'école'); state = checkSpelling(state, 'ecole', 'école'); state = nextSpelling(state);
    assert.equal(state.mastered.length, 0); assert.equal(state.queue.length, 1);
  }
  state = nextSpelling(checkSpelling(state, 'école', 'école')); assert.equal(state.status, 'done');
  assert.deepEqual(spellingCharacters('voitture', 'voiture').filter(c => c.wrong).map(c => c.text), ['t']);
  assert.equal(spellingCharacters('coeur', 'cœur').some(c => c.wrong), false);
  assert.equal(spellingCharacters('ecole', 'école').some(c => c.wrong), false);
});
test('completion gate and spelling mistakes resume after reopening and do not modify Cards/logs', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); const s = await study(db), done = await finish(s);
    assert.equal((await loadCompletion(db, s.id)).stage, 'choice');
    const resumed = await resumeStudyCompletion(db); assert.equal(resumed?.kind, 'session');
    const cards = await db.getAllAsync('SELECT * FROM cards'), logs = await db.getAllAsync('SELECT * FROM review_logs');
    let spelling = createSpelling(done.words); spelling = checkSpelling(spelling, 'incorrect', done.words[0].lemma);
    await saveCompletion(db, s.id, { stage: 'spelling', spelling });
    assert.deepEqual((await loadCompletion(db, s.id)).spelling, spelling);
    assert.equal((await resumeStudyCompletion(db))?.kind, 'session');
    await saveCompletion(db, s.id, { stage: 'summary', spelling });
    assert.equal(await resumeStudyCompletion(db), null);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM cards'), cards); assert.deepEqual(await db.getAllAsync('SELECT * FROM review_logs'), logs);
  } finally { close(); }
});
