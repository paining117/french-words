import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestDatabase } from './sqliteAdapter';
import { initializeSampleDatabase } from '../src/db/database';
import { migrateDatabase } from '../src/db/migrations';
import { startStudy } from '../src/services/studyService';
import { startReview } from '../src/services/reviewService';
import { undoFamiliar } from '../src/services/familiarService';
import { addVocabularyWord, getWordClassification, removeVocabularyWord, WordClassificationConflictError } from '../src/repositories/wordBookRepository';
import { getCardByWordId } from '../src/repositories/cardRepository';
import { getSession } from '../src/repositories/sessionRepository';

test('生 and 熟 are exclusive across APIs and direct SQLite writes; undo permits choosing the other', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db);
    const result = await startStudy(db, { createId: randomUUID });
    if (result.kind !== 'session') throw Error('Missing study');
    const s = result.session, view = s.getSnapshot();
    if (view.status !== 'prompt') throw Error('Missing prompt');
    const id = view.item.word.wordId;
    await addVocabularyWord(db, id);
    await assert.rejects(s.markFamiliar(view.token), WordClassificationConflictError);
    assert.equal(await getCardByWordId(db, id), null);
    assert.deepEqual(s.getSnapshot(), view);
    assert.equal((await getSession(db, s.id)).total_count, 0);
    assert.equal(await getWordClassification(db, id), 'vocabulary');
    await assert.rejects(db.runAsync("INSERT INTO word_book_words VALUES ('my-familiar', ?, 0)", id), /UNIQUE/);
    await removeVocabularyWord(db, id);
    await s.markFamiliar(view.token);
    const card = await getCardByWordId(db, id);
    await assert.rejects(addVocabularyWord(db, id), WordClassificationConflictError);
    assert.equal(await getWordClassification(db, id), 'familiar');
    assert.deepEqual(await getCardByWordId(db, id), card);
    // INSERT OR IGNORE and UPDATE cannot bypass the invariant either.
    assert.equal((await db.runAsync("INSERT OR IGNORE INTO word_book_words VALUES ('my-vocabulary', ?, 0)", id)).changes, 0);
    await assert.rejects(db.runAsync("UPDATE word_book_words SET book_id = 'my-vocabulary' WHERE word_id = ? AND book_id = 'a1-core'", id), /UNIQUE/);
    await undoFamiliar(db, id);
    await addVocabularyWord(db, id);
    assert.equal(await getWordClassification(db, id), 'vocabulary');
    assert.equal(await getCardByWordId(db, id), null);
    assert.equal((await db.getAllAsync('SELECT * FROM review_logs')).length, 0);
  } finally { close(); }
});

test('Review cannot mark a vocabulary word familiar or change its due until vocabulary is withdrawn', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db);
    const result = await startStudy(db, { createId: randomUUID, now: () => new Date(2026, 8, 1, 12) });
    if (result.kind !== 'session') throw Error('Missing study');
    const view = result.session.getSnapshot(); if (view.status !== 'prompt') throw Error('Missing prompt');
    const id = view.item.word.wordId;
    await result.session.submitChoice(view.token, id);
    await addVocabularyWord(db, id);
    const r = await startReview(db, { createId: randomUUID, now: () => new Date(2026, 8, 10, 12) });
    if (r.kind !== 'session') throw Error('Missing review');
    const rv = r.session.getSnapshot(); if (rv.status !== 'prompt') throw Error('Missing review prompt');
    const card = await getCardByWordId(db, id), logs = await db.getAllAsync('SELECT * FROM review_logs');
    await assert.rejects(r.session.markFamiliar(rv.token), WordClassificationConflictError);
    assert.deepEqual(r.session.getSnapshot(), rv);
    assert.deepEqual(await getCardByWordId(db, id), card);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM review_logs'), logs);
    await removeVocabularyWord(db, id); await r.session.markFamiliar(rv.token);
    assert.equal(await getWordClassification(db, id), 'familiar');
  } finally { close(); }
});

test('v6 upgrade resolves legacy overlap without changing Cards, logs, rounds or familiar undo snapshots', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db);
    const result = await startStudy(db, { createId: randomUUID });
    if (result.kind !== 'session') throw Error('Missing study');
    const view = result.session.getSnapshot(); if (view.status !== 'prompt') throw Error('Missing prompt');
    const id = view.item.word.wordId;
    await result.session.markFamiliar(view.token);
    const other = (await db.getFirstAsync<{ id: string }>('SELECT id FROM words WHERE id <> ? LIMIT 1', id))!.id;
    await addVocabularyWord(db, other);
    await db.execAsync('DROP INDEX idx_word_classification; PRAGMA user_version = 5');
    await db.runAsync("INSERT INTO word_book_words VALUES ('my-vocabulary', ?, 1)", id);
    const tables = ['cards', 'review_logs', 'study_rounds', 'familiar_marks', 'familiar_actions', 'sessions', 'checkins'];
    const before = await Promise.all(tables.map(table => db.getAllAsync(`SELECT * FROM ${table}`)));
    await migrateDatabase(db); await migrateDatabase(db);
    assert.equal(await getWordClassification(db, id), 'familiar');
    assert.equal(await getWordClassification(db, other), 'vocabulary');
    assert.deepEqual(await Promise.all(tables.map(table => db.getAllAsync(`SELECT * FROM ${table}`))), before);
    assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM word_book_words WHERE word_id = ? AND book_id IN (?, ?)', id, 'my-vocabulary', 'my-familiar'))!.n, 1);
    assert.equal((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version, 6);
  } finally { close(); }
});
