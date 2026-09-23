import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeSampleDatabase as initializeDatabase } from '../src/db/database';
import type { Database } from '../src/db/connection';
import { openTestDatabase } from './sqliteAdapter';
import { importWordBook } from '../scripts/import-wordbook';
import { lookupLocal, suggestLocal } from '../src/services/dictionaryService';
import { getSearchHistoryItems } from '../src/services/dictionaryHistory';
import { clearSearchHistory, getSearchHistory, saveSearch, saveWordSearch } from '../src/repositories/searchRepository';
import { addVocabularyWord, removeVocabularyWord, isWordInBook, getWordsByBookId, getBookProgress, getUnlearnedWords, VOCABULARY_BOOK_ID as MY } from '../src/repositories/wordBookRepository';
import { getSettings, setCurrentBook } from '../src/repositories/settingsRepository';
import { getCardByWordId } from '../src/repositories/cardRepository';
import { getStudyRoundById } from '../src/repositories/studyRoundRepository';
import { startStudy, type StudySession } from '../src/services/studyService';
import { loadReviewQueue } from '../src/services/reviewService';
import { getHomeData } from '../src/services/homeService';
import { partOfSpeechLabel } from '../src/utils/wordLabel';
const now = () => new Date(2026, 8, 21, 12);
async function counts(db: Database) {
  return Promise.all(['cards', 'review_logs', 'words', 'meanings', 'examples', 'sessions', 'checkins'].map(async table => (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) n FROM ${table}`))!.n));
}
async function wordId(db: Database, query: string) { return (await suggestLocal(db, query, 'fr-zh'))[0].wordId!; }
async function begin(db: Database) {
  const result = await startStudy(db, { createId: randomUUID, now });
  if (result.kind !== 'session') throw Error('Expected session'); return result.session;
}
function prompt(session: StudySession) { const v = session.getSnapshot(); if (v.status !== 'prompt') throw Error('Expected prompt'); return v; }
async function step(session: StudySession) {
  const v = prompt(session);
  if (v.item.phase === 'choice') await session.submitChoice(v.token, v.item.word.wordId); else await session.submitRating(v.token, 'known');
  await session.continue(v.token);
}
async function finish(session: StudySession) { for (let i = 0; i < 100 && session.getSnapshot().status !== 'completed'; i++) await step(session); assert.equal(session.getSnapshot().status, 'completed'); }

test('Phase 4 local provider preserves Unicode, multiple POS, deterministic rank, display forms and read-only queries', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    await importWordBook(db, { id: 'phase4-search', name: 'Search cases', words: [
      { lemma: 'livre', partOfSpeech: 'adjective', meaningsZh: ['测试同形词'] },
      { lemma: 'voisin', displayForm: 'un voisin', partOfSpeech: 'noun', meaningsZh: ['邻居'] },
      { lemma: 'autotest', displayForm: 'voi test', partOfSpeech: 'noun', meaningsZh: ['车测试'] },
      ...Array.from({ length: 25 }, (_, i) => ({ lemma: `ztest${i}`, partOfSpeech: 'noun', meaningsZh: ['车测试'] })),
    ] });
    for (const q of ['voiture', ' VOITURE ', 'une voiture']) {
      const result = await lookupLocal(db, q, 'fr-zh');
      assert.equal(result.entries[0].lemma, 'voiture'); assert.equal(result.provider, 'local');
      assert.equal(result.direction, 'fr-zh'); assert.equal(result.entries[0].source, 'local');
    }
    assert.equal((await lookupLocal(db, 'ecole', 'fr-zh')).entries[0].lemma, 'école');
    assert.equal((await lookupLocal(db, 'etre', 'fr-zh')).entries[0].lemma, 'être');
    assert.equal((await lookupLocal(db, '汽车', 'zh-fr')).entries[0].lemma, 'voiture');
    assert.equal((await lookupLocal(db, '妻子', 'zh-fr')).entries[0].lemma, 'femme');
    assert.equal((await suggestLocal(db, '车', 'zh-fr')).length, 20);
    const rank = (await suggestLocal(db, 'voi', 'fr-zh')).map(word => word.lemma);
    assert.ok(rank.indexOf('voiture') < rank.indexOf('autotest')); assert.ok(rank.indexOf('voisin') < rank.indexOf('autotest'));
    const same = (await lookupLocal(db, 'livre', 'fr-zh')).entries;
    assert.equal(same.length, 2); assert.equal(new Set(same.map(word => word.wordId)).size, 2);
    assert.deepEqual(await getSearchHistory(db), []);
    assert.equal(partOfSpeechLabel('noun', 'f'), 'n.f.'); assert.equal(partOfSpeechLabel('verb'), 'v.'); assert.equal(partOfSpeechLabel('unknown-long-enum'), undefined);
  } finally { close(); }
});

test('add and duplicate add only affect vocabulary relations, append stable order, and preserve homographs', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    await importWordBook(db, { id: 'homograph-vocab', name: 'Test', words: [{ lemma: 'livre', partOfSpeech: 'adjective', meaningsZh: ['同形测试'] }] });
    const before = await counts(db); const car = await wordId(db, 'voiture');
    await addVocabularyWord(db, car); await addVocabularyWord(db, car);
    for (const word of await suggestLocal(db, 'livre', 'fr-zh')) await addVocabularyWord(db, word.wordId!);
    const words = await getWordsByBookId(db, MY);
    assert.equal(words.length, 3); assert.deepEqual(words.map(word => word.order_index), [0, 1, 2]);
    assert.equal(words[0].id, car); assert.equal(words.every(word => word.learned === 0), true);
    assert.deepEqual(await counts(db), before);
    assert.equal((await getBookProgress(db, MY))!.learned, 0);
    await assert.rejects(addVocabularyWord(db, 'missing')); assert.equal((await getWordsByBookId(db, MY)).length, 3);
  } finally { close(); }
});

test('vocabulary -> current book -> Study creates the first Card only at scoring; removal keeps Card, logs, content and global Review', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db); const car = await wordId(db, 'voiture');
    await addVocabularyWord(db, car); await setCurrentBook(db, MY);
    assert.equal((await getSettings(db)).currentBookId, MY); assert.equal((await getHomeData(db, now())).book.total, 1);
    assert.deepEqual((await getUnlearnedWords(db, MY, 10)).map(word => word.id), [car]);
    const session = await begin(db); const first = prompt(session);
    assert.equal(first.item.word.wordId, car); assert.equal(await getCardByWordId(db, car), null);
    await session.submitChoice(first.token, car);
    assert.ok(await getCardByWordId(db, car)); assert.equal((await getBookProgress(db, MY))!.learned, 1);
    await session.continue(first.token); await finish(session);
    const before = await counts(db); const card = await getCardByWordId(db, car);
    const history = await db.getAllAsync('SELECT * FROM review_logs'); const rounds = await db.getAllAsync('SELECT * FROM study_rounds');
    await removeVocabularyWord(db, car);
    assert.equal(await isWordInBook(db, MY, car), false); assert.equal(await isWordInBook(db, 'a1-core', car), true);
    assert.deepEqual(await counts(db), before); assert.deepEqual(await getCardByWordId(db, car), card);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM review_logs'), history); assert.deepEqual(await db.getAllAsync('SELECT * FROM study_rounds'), rounds);
    assert.equal((await loadReviewQueue(db, new Date(2026, 8, 30, 12))).queue[0].word.wordId, car);
    await addVocabularyWord(db, car); assert.equal((await getUnlearnedWords(db, MY, 10)).length, 0);
    assert.equal((await startStudy(db, { createId: randomUUID, now })).kind, 'empty');
  } finally { close(); }
});

test('removing unscored items from a pending vocabulary round skips them, including an entirely removed round', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db); const car = await wordId(db, 'voiture'), school = await wordId(db, 'école');
    await addVocabularyWord(db, car); await addVocabularyWord(db, school); await setCurrentBook(db, MY);
    const original = await begin(db); await removeVocabularyWord(db, car);
    const resumed = await begin(db); assert.equal(resumed.id, original.id); assert.equal(prompt(resumed).item.word.wordId, school); assert.equal(resumed.total, 1);
    assert.equal((await getHomeData(db, now())).availableNewWords, 1);
    await removeVocabularyWord(db, school);
    assert.equal((await startStudy(db, { createId: randomUUID, now })).kind, 'empty');
    assert.equal((await getHomeData(db, now())).roundPending, false);
    assert.equal((await counts(db))[0], 0); assert.equal((await counts(db))[1], 0);
  } finally { close(); }
});

test('switching books preserves paused stars; shared words learned elsewhere cannot become new again', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db); const a1 = await begin(db); await step(a1);
    const saved = (await getStudyRoundById(db, a1.id))!;
    const shared = saved.state.queue.find(item => item.attempt === 1)!.word.wordId;
    await addVocabularyWord(db, shared); await setCurrentBook(db, MY);
    assert.equal((await getHomeData(db, now())).book.id, MY);
    const vocab = await begin(db); assert.notEqual(vocab.id, a1.id); assert.equal(prompt(vocab).item.word.wordId, shared);
    await finish(vocab); await setCurrentBook(db, 'a1-core');
    const resumed = await begin(db); assert.equal(resumed.id, a1.id);
    const state = (await getStudyRoundById(db, a1.id))!.state;
    assert.equal(state.words.some(word => word.wordId === shared), false);
    const practiced = saved.state.queue.find(item => item.attempt > 1)!;
    assert.equal(state.queue.find(item => item.word.wordId === practiced.word.wordId)!.stars, practiced.stars);
    await finish(resumed);
    assert.equal((await getBookProgress(db, 'a1-core'))!.learned, 10);
  } finally { close(); }
});

test('pre-Phase-4 round is attributed before switching, survives restart and invalid switches roll back', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'phase4-upgrade-')); const file = join(folder, 'app.db'); let handle = openTestDatabase(file);
  try {
    await initializeDatabase(handle.db); const session = await begin(handle.db); await step(session);
    await handle.db.runAsync("UPDATE study_rounds SET state_json = json_remove(state_json, '$.bookId') WHERE round_id = ?", session.id);
    const beforeCards = await handle.db.getAllAsync('SELECT * FROM cards'), beforeLogs = await handle.db.getAllAsync('SELECT * FROM review_logs');
    await assert.rejects(setCurrentBook(handle.db, 'no-such-book'));
    assert.equal((await getSettings(handle.db)).currentBookId, 'a1-core');
    await setCurrentBook(handle.db, MY);
    assert.equal((await startStudy(handle.db, { createId: randomUUID, now })).kind, 'empty');
    handle.close(); handle = openTestDatabase(file); await initializeDatabase(handle.db);
    assert.equal((await getSettings(handle.db)).currentBookId, MY); await setCurrentBook(handle.db, 'a1-core');
    const resumed = await begin(handle.db); assert.equal(resumed.id, session.id);
    assert.deepEqual(await handle.db.getAllAsync('SELECT * FROM cards'), beforeCards); assert.deepEqual(await handle.db.getAllAsync('SELECT * FROM review_logs'), beforeLogs);
    assert.equal((await handle.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version, 6);
  } finally { handle.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('failed vocabulary writes leave membership and all learning records unchanged', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db); const car = await wordId(db, 'voiture'); const before = await counts(db);
    await db.execAsync("CREATE TRIGGER fail_add BEFORE INSERT ON word_book_words BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    await assert.rejects(addVocabularyWord(db, car)); assert.equal(await isWordInBook(db, MY, car), false);
    await db.execAsync('DROP TRIGGER fail_add'); await addVocabularyWord(db, car);
    await db.execAsync("CREATE TRIGGER fail_remove BEFORE DELETE ON word_book_words BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    await assert.rejects(removeVocabularyWord(db, car)); assert.equal(await isWordInBook(db, MY, car), true);
    assert.deepEqual(await counts(db), before);
  } finally { close(); }
});

test('selected search history resolves a clicked word from a fragment or Chinese query while retaining query deduplication', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const car = await wordId(db, 'voiture');
    await saveSearch(db, 'voi', 'fr-zh', now(), car);
    let rows = await getSearchHistoryItems(db);
    assert.equal(rows[0].query, 'voi'); assert.equal(rows[0].entry?.lemma, 'voiture');
    assert.equal(rows[0].entry?.partOfSpeech, 'noun'); assert.equal(rows[0].entry?.meaningsZh[0], '汽车');
    await saveSearch(db, ' VOI ', 'fr-zh', now(), car);
    assert.equal((await getSearchHistory(db)).length, 1);
    await saveSearch(db, '车', 'zh-fr', now(), car);
    rows = await getSearchHistoryItems(db);
    assert.equal(rows[0].direction, 'zh-fr'); assert.equal(rows[0].entry?.wordId, car);
    const before = await getSearchHistory(db);
    await assert.rejects(saveSearch(db, 'missing', 'fr-zh', now(), 'missing-word'));
    assert.deepEqual(await getSearchHistory(db), before);
  } finally { close(); }
});

test('history retains query and direction, reorders duplicates, consolidates legacy records, caps at 20 and clears safely', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db); const session = await begin(db); await step(session);
    const car = await wordId(db, 'voiture'); const before = await counts(db);
    assert.ok(before[0] > 0 && before[1] > 0);
    await saveWordSearch(db, car, now()); await saveSearch(db, ' VOITURE ', 'fr-zh', now());
    assert.equal((await getSearchHistory(db)).length, 1);
    await saveSearch(db, 'voiture', 'zh-fr', now()); assert.equal((await getSearchHistory(db)).length, 2);
    await clearSearchHistory(db);
    for (let i = 0; i < 25; i++) await saveSearch(db, `query-${i}`, 'fr-zh', new Date(2026, 8, 21, 12, i));
    let history = await getSearchHistory(db); assert.equal(history.length, 20); assert.equal(history[0].query, 'query-24');
    await saveSearch(db, 'query-6', 'fr-zh', new Date(2026, 8, 21, 13));
    history = await getSearchHistory(db); assert.equal(history.length, 20); assert.equal(history[0].query, 'query-6');
    assert.equal((await getSearchHistoryItems(db))[0].query, 'query-6'); // Unresolved text remains replayable.
    await clearSearchHistory(db); assert.deepEqual(await getSearchHistory(db), []); assert.deepEqual(await counts(db), before);
  } finally { close(); }
});
