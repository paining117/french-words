import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEmptyCard } from 'ts-fsrs';
import sample from '../content/wordbooks/a1.sample.json';
import { initializeSampleDatabase as initializeDatabase } from '../src/db/database';
import { migrateDatabase } from '../src/db/migrations';
import { importWordBook, validateWordBook } from '../scripts/import-wordbook';
import { getHomeData } from '../src/services/homeService';
import { checkIn } from '../src/services/checkinService';
import { lookupLocal } from '../src/services/dictionaryService';
import { getSearchHistory, saveSearch } from '../src/repositories/searchRepository';
import { findWords } from '../src/repositories/wordRepository';
import { normalizeFrench, detectDirection } from '../src/utils/normalizeFrench';
import { localDate, previousLocalDate, checkinStreak } from '../src/utils/date';
import { openTestDatabase } from './sqliteAdapter';

test('French normalization preserves accents and combines Unicode', () => {
  assert.equal(normalizeFrench('  VOITURE  '), 'voiture');
  assert.equal(normalizeFrench('E\u0301COLE'), 'école');
  assert.equal(normalizeFrench('ÀÂÇÉÈÊËÎÏÔÙÛÜŸŒ'), 'àâçéèêëîïôùûüÿœ');
  assert.equal(detectDirection('汽车'), 'zh-fr');
  assert.equal(detectDirection('voiture 汽'), 'zh-fr'); // Phase 4: any Han text selects Chinese.
});

test('local calendar streak handles gaps, midnight, leap day and year boundary', () => {
  assert.equal(localDate(new Date(2026, 8, 19, 0, 1)), '2026-09-19');
  assert.equal(previousLocalDate('2024-03-01'), '2024-02-29');
  assert.equal(previousLocalDate('2026-01-01'), '2025-12-31');
  assert.equal(checkinStreak(['2026-09-17','2026-09-18','2026-09-19'], '2026-09-19'), 3);
  assert.equal(checkinStreak(['2026-09-17','2026-09-19'], '2026-09-19'), 1);
  assert.equal(checkinStreak(['2026-09-17','2026-09-18'], '2026-09-19'), 2);
  assert.equal(checkinStreak(['2026-09-17'], '2026-09-19'), 0);
  assert.equal(checkinStreak(['2025-12-31','2026-01-01'], '2026-01-01'), 2);
});

test('sample is 60–100 distinct words, with genders and at least half with examples', () => {
  validateWordBook(sample);
  assert.ok(sample.words.length >= 60 && sample.words.length <= 100);
  assert.ok(sample.words.filter(w => w.examples.length).length >= sample.words.length / 2);
  for (const word of sample.words.filter(w => w.partOfSpeech === 'noun')) {
    assert.ok(word.gender && word.displayForm);
  }
  assert.match(sample.description, /sample dataset.*not final production vocabulary/);
});

test('real SQLite bootstrap, constraints, repeat initialization, reopen persistence and live due counts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'french-words-'));
  const file = join(dir, 'test.db');
  let handle = openTestDatabase(file);
  try {
    const now = new Date('2026-09-19T10:00:00.000Z');
    await initializeDatabase(handle.db);
    await initializeDatabase(handle.db);
    const tables = await handle.db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    assert.equal(tables.length, 16);
    assert.equal((await handle.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version, 6);
    assert.equal((await handle.db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys, 1);
    assert.equal((await handle.db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode'))?.journal_mode, 'wal');
    const home = await getHomeData(handle.db, now);
    assert.equal(home.book.total, sample.words.length);
    assert.equal(home.book.learned, 0);
    assert.equal(home.dailyNewWords, 10);
    assert.equal(home.due, 0);
    assert.equal(home.checkin.checkedIn, false);
    await checkIn(handle.db, now);
    await checkIn(handle.db, now);
    assert.equal((await handle.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM checkins'))?.n, 1);
    const [word] = await findWords(handle.db, 'VOITURE', 'fr-zh');
    const card = createEmptyCard(now);
    const insert = "INSERT INTO cards (word_id, fsrs_card_json, due_at, origin, created_at) VALUES (?, ?, ?, 'study', ?)";
    await handle.db.runAsync(insert, word.id, JSON.stringify(card), now.toISOString(), now.toISOString());
    await assert.rejects(handle.db.runAsync(insert, word.id, '{}', now.toISOString(), now.toISOString()));
    await assert.rejects(handle.db.runAsync(insert, 'missing-word', '{}', now.toISOString(), now.toISOString()));
    await handle.db.runAsync("UPDATE settings SET value = '15' WHERE key = 'daily_new_words'");
    handle.close();
    handle = openTestDatabase(file);
    await initializeDatabase(handle.db);
    const reopened = await getHomeData(handle.db, now);
    assert.equal(reopened.book.total, sample.words.length);
    assert.equal(reopened.book.learned, 1);
    assert.equal(reopened.checkin.checkedIn, true);
    assert.equal(reopened.checkin.streak, 1);
    assert.equal(reopened.dailyNewWords, 15); // The saved preference now controls subsequent round size.
    assert.equal(reopened.due, 1);
    const stored = await handle.db.getFirstAsync<{ fsrs_card_json: string }>('SELECT fsrs_card_json FROM cards WHERE word_id = ?', word.id);
    assert.equal(stored?.fsrs_card_json, JSON.stringify(card));
    await handle.db.runAsync('UPDATE cards SET suspended = 1 WHERE word_id = ?', word.id);
    assert.equal((await getHomeData(handle.db, now)).due, 0);
    await handle.db.runAsync('UPDATE cards SET suspended = 0, due_at = ? WHERE word_id = ?', '2026-09-20T10:00:00.000Z', word.id);
    assert.equal((await getHomeData(handle.db, now)).due, 0);
  } finally { handle.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('offline dictionary matches French, display forms, Chinese and literal SQL input', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    for (const query of ['voiture', 'Voiture', '  VOITURE ', 'UNE VOITURE']) {
      const result = await lookupLocal(db, query, 'fr-zh');
      assert.equal(result.entries[0].lemma, 'voiture');
      assert.equal(result.entries[0].meaningsZh[0], '汽车');
      assert.ok(result.entries[0].examples[0].french);
    }
    assert.equal((await lookupLocal(db, '汽车', 'zh-fr')).entries[0].lemma, 'voiture');
    assert.equal((await lookupLocal(db, '妻子', 'zh-fr')).entries[0].lemma, 'femme');
    assert.equal((await lookupLocal(db, 'E\u0301COLE', 'fr-zh')).entries[0].lemma, 'école');
    assert.equal((await lookupLocal(db, "' OR 1=1 --", 'fr-zh')).entries.length, 0);
    assert.equal((await lookupLocal(db, '%', 'zh-fr')).entries.length, 0);
    assert.equal((await lookupLocal(db, '_', 'fr-zh')).entries.length, 0);
    assert.equal((await lookupLocal(db, 'inexistant-xyz', 'fr-zh')).entries.length, 0);
    await db.execAsync('DELETE FROM search_history');
    for (let i = 0; i < 25; i++) await saveSearch(db, `query-${i}`, 'fr-zh', new Date(2026, 8, 19, 12, i));
    const history = await getSearchHistory(db);
    assert.equal(history.length, 20);
    assert.equal(history[0].query, 'query-24');
    await saveSearch(db, 'QUERY-24', 'fr-zh', new Date(2026, 8, 19, 13));
    assert.equal((await getSearchHistory(db)).length, 20);
  } finally { close(); }
});

test('import reuses identity across books, allows distinct parts of speech and rolls back failures', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const second = { id: 'second', name: 'Second', words: [{ lemma: 'VOITURE', partOfSpeech: 'noun', meaningsZh: ['汽车'] }, { lemma: 'orange', partOfSpeech: 'noun', meaningsZh: ['橙子'] }, { lemma: 'orange', partOfSpeech: 'adjective', meaningsZh: ['橙色的'] }] };
    assert.equal(await importWordBook(db, second), true);
    assert.equal(await importWordBook(db, second), false);
    assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM words'))?.n, sample.words.length + 2);
    await assert.rejects(importWordBook(db, { ...second, id: 'duplicates', words: [second.words[0], second.words[0]] }));
    await db.execAsync("CREATE TRIGGER fail_import BEFORE INSERT ON words WHEN NEW.lemma = 'fail-test' BEGIN SELECT RAISE(ABORT, 'test rollback'); END;");
    await assert.rejects(importWordBook(db, { id: 'broken', name: 'Broken', words: [{ lemma: 'first-test', partOfSpeech: 'noun', meaningsZh: ['测试'] }, { lemma: 'fail-test', partOfSpeech: 'noun', meaningsZh: ['测试'] }] }));
    assert.equal(await db.getFirstAsync('SELECT id FROM word_books WHERE id = ?', 'broken'), null);
    assert.equal(await db.getFirstAsync('SELECT id FROM words WHERE lemma = ?', 'first-test'), null);
    await db.execAsync('PRAGMA user_version = 7');
    await assert.rejects(migrateDatabase(db));
    assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM words'))?.n, sample.words.length + 2);
  } finally { close(); }
});
