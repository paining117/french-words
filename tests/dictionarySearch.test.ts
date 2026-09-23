import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSampleDatabase as initializeDatabase } from '../src/db/database';
import { importWordBook } from '../scripts/import-wordbook';
import { foldFrenchSearch, normalizeFrench } from '../src/utils/normalizeFrench';
import { lookupLocal, suggestLocal } from '../src/services/dictionaryService';
import { getDictionaryEntry } from '../src/repositories/wordRepository';
import { getSearchHistory, saveSearch } from '../src/repositories/searchRepository';
import { createSuggestionSearch, type SuggestionState } from '../src/services/dictionary/suggestionSearch';
import type { DictionaryEntry, Direction } from '../src/types/dictionary';
import { openTestDatabase } from './sqliteAdapter';

test('search folds French accents, combining marks, ligatures and apostrophes without changing identity normalization', () => {
  assert.equal(foldFrenchSearch(' ÀÂÇÉÈÊËÎÏÔÙÛÜŸŒÆ '), 'aaceeeeiio uuuyoeae'.replace(/ /g, ''));
  assert.equal(foldFrenchSearch('E\u0301COLE'), 'ecole');
  assert.equal(foldFrenchSearch('L’ŒUVRE'), "l'oeuvre");
  assert.equal(foldFrenchSearch('  UNE   SŒUR '), 'une soeur');
  assert.notEqual(normalizeFrench('ou'), normalizeFrench('où'));
  assert.equal(normalizeFrench('ÉCOLE'), 'école');
});

test('English-keyboard queries and fragments return original spelling, meaning and a resolvable detail ID', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    for (const [query, lemma] of [['ecole', 'école'], ['ECO', 'école'], ['cole', 'école'], ['etudiant', 'étudiant'], ['cafe', 'café'], ['etre', 'être'], ['soeur', 'sœur'], ['une soeur', 'sœur']]) {
      const results = await suggestLocal(db, query, 'fr-zh');
      const entry = results.find(item => item.lemma === lemma);
      assert.ok(entry, query); assert.ok(entry.wordId); assert.ok(entry.meaningsZh[0]);
      const detail = await getDictionaryEntry(db, entry.wordId!);
      assert.equal(detail?.lemma, lemma); assert.equal(detail?.meaningsZh[0], entry.meaningsZh[0]);
    }
    assert.equal((await suggestLocal(db, '汽车', 'zh-fr'))[0].lemma, 'voiture');
    assert.equal((await suggestLocal(db, '妻子', 'zh-fr'))[0].lemma, 'femme');
    for (const query of ['', '  ', '\u0301', '%', '_', "' OR 1=1 --", 'inexistant-xyz']) assert.deepEqual(await suggestLocal(db, query, 'fr-zh'), [], query);
    assert.deepEqual(await suggestLocal(db, '%', 'zh-fr'), []);
    assert.equal((await getSearchHistory(db)).length, 0); // Keystrokes are read-only.
    assert.equal((await lookupLocal(db, 'soeur', 'fr-zh')).entries[0].lemma, 'sœur');
    await saveSearch(db, 'école', 'fr-zh');
    assert.equal((await getSearchHistory(db)).length, 1); // Lookup is read-only; only opening a result saves history.
  } finally { close(); }
});

test('accent collisions remain separate, exact spelling wins, prefixes precede substrings and suggestions are bounded', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    await importWordBook(db, { id: 'search-cases', name: 'Search test cases', words: [
      ...['cote', 'côté', 'côte', 'coteau', 'abricote', 'cœur', 'cæcum'].map(lemma => ({ lemma, partOfSpeech: 'noun', meaningsZh: ['测试'] })),
      { lemma: 'œuvre', displayForm: 'l’œuvre', partOfSpeech: 'noun', meaningsZh: ['作品'] },
      ...Array.from({ length: 25 }, (_, index) => ({ lemma: `cote-prefix-${index}`, partOfSpeech: 'noun', meaningsZh: ['候选'] })),
    ] });
    const matches = await suggestLocal(db, 'cote', 'fr-zh');
    assert.equal(matches.length, 20); assert.equal(matches[0].lemma, 'cote');
    assert.equal(new Set(matches.map(entry => entry.wordId)).size, matches.length);
    assert.deepEqual(new Set(matches.slice(1, 3).map(entry => entry.lemma)), new Set(['côté', 'côte']));
    assert.equal((await suggestLocal(db, 'côté', 'fr-zh'))[0].lemma, 'côté');
    assert.ok(!matches.some(entry => entry.lemma === 'abricote')); // We have >20 prefix/exact hits.
    assert.equal((await suggestLocal(db, 'coeur', 'fr-zh'))[0].lemma, 'cœur');
    assert.equal((await suggestLocal(db, 'caecum', 'fr-zh'))[0].lemma, 'cæcum');
    assert.equal((await suggestLocal(db, "l'oeu", 'fr-zh'))[0].lemma, 'œuvre');
    const count = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) n FROM words WHERE lemma IN ('cote', 'côté', 'côte')");
    assert.equal(count?.n, 3);
  } finally { close(); }
});

const entry = (lemma: string): DictionaryEntry => ({ wordId: lemma, lemma, meaningsZh: ['测试'], examples: [] });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('live search cannot publish stale results or stale errors after another query or a clear', async () => {
  const first = deferred<DictionaryEntry[]>(), second = deferred<DictionaryEntry[]>(), third = deferred<DictionaryEntry[]>();
  const states: SuggestionState[] = [];
  const search = createSuggestionSearch(query => query === 'e' ? first.promise : query === 'ec' ? second.promise : third.promise, state => states.push(state));
  const old = search.run('e', 'fr-zh');
  const newest = search.run('ec', 'fr-zh');
  second.resolve([entry('école')]); await newest;
  first.reject(new Error('late failure')); await old;
  assert.deepEqual(states.at(-1), { status: 'ready', entries: [entry('école')] });
  const pending = search.run('eco', 'fr-zh');
  await search.run('', 'fr-zh');
  third.resolve([entry('école')]); await pending;
  assert.deepEqual(states.at(-1), { status: 'idle' });
});

test('typing is debounced, direction changes replace the request, and cancellation prevents work', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: [string, Direction][] = [];
  const states: SuggestionState[] = [];
  const search = createSuggestionSearch(async (query, direction) => { calls.push([query, direction]); return [entry(query)]; }, state => states.push(state));
  search.schedule('e', 'fr-zh'); context.mock.timers.tick(100);
  search.schedule('ec', 'fr-zh'); context.mock.timers.tick(100);
  assert.equal(calls.length, 0);
  search.schedule('汽车', 'zh-fr'); context.mock.timers.tick(249); assert.equal(calls.length, 0);
  context.mock.timers.tick(1); await Promise.resolve();
  assert.deepEqual(calls, [['汽车', 'zh-fr']]);
  assert.deepEqual(states.at(-1), { status: 'ready', entries: [entry('汽车')] });
  search.schedule('ecole', 'fr-zh'); search.cancel(); context.mock.timers.tick(1000);
  assert.equal(calls.length, 1);
});

test('active failures show an error and retry succeeds; unmount cancellation drops in-flight results', async () => {
  const states: SuggestionState[] = [];
  let fail = true;
  const search = createSuggestionSearch(async () => { if (fail) throw new Error('database unavailable'); return [entry('sœur')]; }, state => states.push(state));
  await search.run('soeur', 'fr-zh'); assert.deepEqual(states.at(-1), { status: 'error' });
  fail = false;
  await search.run('soeur', 'fr-zh'); assert.deepEqual(states.at(-1), { status: 'ready', entries: [entry('sœur')] });
  const pending = deferred<DictionaryEntry[]>();
  const disposable = createSuggestionSearch(() => pending.promise, state => states.push(state));
  const running = disposable.run('ecole', 'fr-zh'); disposable.cancel();
  const count = states.length;
  pending.resolve([entry('école')]); await running;
  assert.equal(states.length, count);
});
