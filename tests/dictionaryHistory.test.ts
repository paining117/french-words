import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeSampleDatabase as initializeDatabase } from '../src/db/database';
import { importWordBook } from '../scripts/import-wordbook';
import { findWords } from '../src/repositories/wordRepository';
import { getSearchHistory, saveSearch, saveWordSearch } from '../src/repositories/searchRepository';
import { getDictionaryHistory } from '../src/services/dictionaryHistory';
import { partOfSpeechLabel } from '../src/utils/wordLabel';
import { openTestDatabase } from './sqliteAdapter';

test('word history preserves spelling, part of speech, meaning, ordering and homographs across restarts', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'dictionary-history-'));
  const path = join(folder, 'history.db');
  let handle = openTestDatabase(path);
  try {
    await initializeDatabase(handle.db);
    await importWordBook(handle.db, { id: 'history-homographs', name: 'History test', words: [
      { lemma: 'orange', partOfSpeech: 'noun', gender: 'f', meaningsZh: ['橙子'] },
      { lemma: 'orange', partOfSpeech: 'adjective', meaningsZh: ['橙色的'] },
    ] });
    const matches = await findWords(handle.db, 'orange', 'fr-zh');
    const noun = matches.find(word => word.part_of_speech === 'noun')!;
    const adjective = matches.find(word => word.part_of_speech === 'adjective')!;
    await saveWordSearch(handle.db, noun.id, new Date(2026, 8, 20, 12));
    await saveWordSearch(handle.db, adjective.id, new Date(2026, 8, 20, 13));
    handle.close(); handle = openTestDatabase(path); await initializeDatabase(handle.db);
    let history = await getDictionaryHistory(handle.db);
    assert.deepEqual(history.map(entry => [entry.wordId, entry.lemma, partOfSpeechLabel(entry.partOfSpeech, entry.gender), entry.meaningsZh[0]]), [
      [adjective.id, 'orange', 'adj.', '橙色的'], [noun.id, 'orange', 'n.f.', '橙子'],
    ]);
    await saveWordSearch(handle.db, noun.id, new Date(2026, 8, 20, 14));
    history = await getDictionaryHistory(handle.db);
    assert.equal(history.length, 2); assert.equal(history[0].wordId, noun.id);
    await saveWordSearch(handle.db, 'missing-word');
    assert.equal((await getDictionaryHistory(handle.db)).length, 2);
  } finally { handle.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('legacy French and Chinese history resolves meanings, while ambiguous fragments and missing words are not guessed', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const date = new Date(2026, 8, 20, 12);
    await saveSearch(db, 'ecole', 'fr-zh', date);
    await saveSearch(db, '妻子', 'zh-fr', date);
    await saveSearch(db, 'e', 'fr-zh', date);
    await saveSearch(db, 'not-in-the-dictionary', 'fr-zh', date);
    let history = await getDictionaryHistory(db);
    assert.deepEqual(new Set(history.map(entry => entry.lemma)), new Set(['école', 'femme']));
    assert.ok(history.find(entry => entry.lemma === 'femme')?.meaningsZh.includes('妻子'));
    const school = (await findWords(db, 'ecole', 'fr-zh'))[0];
    await saveWordSearch(db, school.id, new Date(2026, 8, 20, 13));
    history = await getDictionaryHistory(db);
    assert.equal(history[0].lemma, 'école');
    assert.equal(history.filter(entry => entry.wordId === school.id).length, 1);
    assert.equal((await getSearchHistory(db)).length, 5); // Reading did not delete old user input.
    await db.runAsync('DELETE FROM words WHERE id = ?', school.id);
    assert.ok(!(await getDictionaryHistory(db)).some(entry => entry.wordId === school.id));
  } finally { close(); }
});

test('selected-word history is bounded and a failed persistence transaction leaves the previous list intact', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const words = await db.getAllAsync<{ id: string }>('SELECT id FROM words ORDER BY id LIMIT 25');
    for (let i = 0; i < words.length; i++) await saveWordSearch(db, words[i].id, new Date(2026, 8, 20, 12, i));
    const before = await getDictionaryHistory(db);
    assert.equal(before.length, 20); assert.equal(before[0].wordId, words[24].id);
    await db.execAsync("CREATE TRIGGER fail_history BEFORE INSERT ON search_history BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    await assert.rejects(saveWordSearch(db, words[0].id));
    assert.deepEqual(await getDictionaryHistory(db), before);
  } finally { close(); }
});
