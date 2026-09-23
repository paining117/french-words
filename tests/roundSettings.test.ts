import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestDatabase } from './sqliteAdapter';
import { initializeSampleDatabase } from '../src/db/database';
import { getSettings, setStudyRoundSize } from '../src/repositories/settingsRepository';
import { getHomeData } from '../src/services/homeService';
import { startStudy, type StudySession } from '../src/services/studyService';
import { checkSpelling, createSpelling, spellingDraft } from '../src/services/spellingService';

async function finish(s: StudySession) {
  for (let i = 0; i < 1000; i++) {
    const v = s.getSnapshot(); if (v.status === 'completed') return v;
    if (v.status === 'prompt') {
      if (v.item.phase === 'choice') await s.submitChoice(v.token, v.item.word.wordId);
      else await s.submitRating(v.token, 'known');
    }
    await s.continue(v.token);
  }
  throw Error('Round did not finish');
}

test('round size accepts all positive safe multiples of five, including values beyond presets', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db);
    for (const size of [5, 10, 25, 35, 45, 60, 105]) {
      await setStudyRoundSize(db, size);
      assert.equal((await getSettings(db)).dailyNewWords, size);
      assert.equal((await getHomeData(db)).availableNewWords, Math.min(size, 66));
    }
    for (const size of [0, -5, 1, 6, 9, 12.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(setStudyRoundSize(db, size));
      assert.equal((await getSettings(db)).dailyNewWords, 105);
    }
    await initializeSampleDatabase(db);
    assert.equal((await getSettings(db)).dailyNewWords, 105);
  } finally { close(); }
});

test('settings change preserves an active round and applies to subsequent rounds and spelling', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); await setStudyRoundSize(db, 5);
    const first = await startStudy(db, { createId: randomUUID }); if (first.kind !== 'session') throw Error('Missing round');
    assert.equal(first.session.total, 5);
    const view = first.session.getSnapshot(); if (view.status !== 'prompt') throw Error('Missing word');
    await first.session.submitChoice(view.token, view.item.word.wordId);
    const saved = first.session.getSnapshot();
    await setStudyRoundSize(db, 25);
    const resumed = await startStudy(db, { createId: randomUUID }); if (resumed.kind !== 'session') throw Error('Missing resumed round');
    assert.equal(resumed.session.id, first.session.id); assert.equal(resumed.session.total, 5);
    assert.deepEqual(resumed.session.getSnapshot(), JSON.parse(JSON.stringify(saved)));
    const done = await finish(resumed.session); assert.equal(done.words.length, 5);
    assert.equal(createSpelling(done.words).queue.length, 5);
    const next = await startStudy(db, { createId: randomUUID }); if (next.kind !== 'session') throw Error('Missing next round');
    assert.equal(next.session.total, 25);
    const nextDone = await finish(next.session); assert.equal(nextDone.words.length, 25);
    assert.equal(nextDone.learnedToday, 30);
    await setStudyRoundSize(db, 60);
    const last = await startStudy(db, { createId: randomUUID }); if (last.kind !== 'session') throw Error('Missing last round');
    assert.equal(last.session.total, 36);
    assert.equal((await finish(last.session)).words.length, 36);
  } finally { close(); }
});

test('a wrong spelling keeps feedback but supplies an empty next draft, including after reload', () => {
  const words = [{ wordId: 'school', lemma: 'école', meaning: '学校', dueAt: new Date().toISOString(), suspended: false }];
  const wrong = checkSpelling(createSpelling(words), 'ecolz', 'école');
  assert.equal(wrong.answer, 'ecolz');
  assert.equal(spellingDraft(wrong), '');
  assert.equal(spellingDraft(JSON.parse(JSON.stringify(wrong))), '');
  // The first new letter now starts the next attempt rather than appending to ecolz.
  assert.equal(spellingDraft(wrong) + 'e', 'e');
  const corrected = checkSpelling(wrong, 'ecole', 'école');
  assert.equal(spellingDraft(corrected), 'école');
  assert.equal(corrected.mastered.length, 0);
});
