import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseFreeDict } from '../scripts/data/parse-freedict';
import { parseFlelex } from '../scripts/data/parse-flelex';
import { parseTatoeba, createExampleMatcher } from '../scripts/data/parse-tatoeba';
import { mergeDictionary } from '../scripts/data/merge-dictionary';
import { validateDataset } from '../scripts/data/validate-dataset';
import { initializeSampleDatabase } from '../src/db/database';
import { importOfflineDataset } from '../src/db/importOfflineDataset';
import { migrateDatabase } from '../src/db/migrations';
import { SCHEMA_V1 } from '../src/db/schema';
import { importWordBook } from '../scripts/import-wordbook';
import { findWords, getDictionaryEntry } from '../src/repositories/wordRepository';
import { getUnlearnedWords, addVocabularyWord, removeVocabularyWord } from '../src/repositories/wordBookRepository';
import { setCurrentBook } from '../src/repositories/settingsRepository';
import { startStudy } from '../src/services/studyService';
import { getDueCards } from '../src/repositories/cardRepository';
import { foldFrenchSearch, normalizeFrench } from '../src/utils/normalizeFrench';
import type { DatasetWord, DatasetBundle } from '../src/types/dataset';
import type { Database } from '../src/db/connection';
import { openTestDatabase } from './sqliteAdapter';

const tei = (entries: string) => `<TEI><teiHeader><fileDesc><editionStmt><edition>fixture</edition></editionStmt><publicationStmt><availability><p>Licensed under <ref target="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</ref></p></availability></publicationStmt></fileDesc></teiHeader><text><body>${entries}</body></text></TEI>`;
const entry = (lemma: string, meaning: string, pos = 'n', gender = '') => `<entry><form><orth>${lemma}</orth></form><gramGrp><pos>${pos}</pos><gen>${gender}</gen></gramGrp><sense><cit type="trans" xml:lang="zh"><quote>${meaning}</quote></cit></sense></entry>`;
const word = (lemma: string, extra: Partial<DatasetWord> = {}): DatasetWord => ({ id: `fixture-${lemma}`, lemma, normalizedLemma: normalizeFrench(lemma), searchKey: foldFrenchSearch(lemma), partOfSpeech: 'noun', homograph: '', meaningsZh: ['测试'], source: 'freedict', sourceRef: `fixture:${lemma}`, examples: [], ...extra });
const bundle = (words: DatasetWord[], version = 'fixture'): DatasetBundle => ({ version, chunks: words.map(w => () => [w]), books: [{ id: 'a2-core', name: 'A2 核心词汇', level: 'A2', wordIds: words.map(w => w.id) }] });

test('TEI parses nested Chinese senses, explicit gender, unknown POS and skips missing Chinese', () => {
  const parsed = parseFreeDict(tei(entry('école', '学校', 'n', 'fem') + `<entry><form><orth>test</orth></form><gramGrp><pos>unknown</pos></gramGrp><sense><cit type="trans" xml:lang="zh"><quote>测试</quote><quote>测试</quote></cit><sense><cit type="trans" xml:lang="zh"><quote>检验</quote></cit></sense></sense></entry>` + entry('absent', 'English')));
  assert.equal(parsed.rawHeadwords, 3); assert.equal(parsed.entries.length, 2); assert.equal(parsed.skipped.length, 1);
  assert.equal(parsed.entries[0].gender, 'f'); assert.equal(parsed.entries[0].searchKey, 'ecole');
  assert.deepEqual(parsed.entries[1].meaningsZh, ['测试', '检验']); assert.equal(parsed.entries[1].partOfSpeech, 'other');
  assert.equal(parsed.warnings.length, 1); assert.match(parsed.metadata.license, /CC BY-SA/);
  assert.throws(() => parseFreeDict('<broken>'));
});
test('CEFR parser requires an explicit level, accepts reordered headers and maps TreeTagger POS', () => {
  const parsed = parseFlelex('level\tpos\tword\tA1\tA2\tB1\tB2\tC1\tC2\ttotal\nA1\tVER:infi\têtre\t20\t5\t2\t1\t0\t0\t28\nC2\tNOM\tabîme\t0\t0\t0\t0\t0\t2\t2\nA2\tNAM\tParis\t0\t3\t0\t0\t0\t0\t3\n?\tPUN\t.\t0\t0\t0\t0\t0\t0\t0');
  assert.equal(parsed.entries.length, 3); assert.equal(parsed.entries[0].partOfSpeech, 'verb');
  assert.equal(parsed.entries[0].levelFrequency, 20); assert.equal(parsed.entries[2].properNoun, true);
  assert.equal(parsed.skipped.length, 1); assert.throws(() => parseFlelex('word\tpos\tA1\nêtre\tVER\t20'), /explicit/);
});
test('merge preserves noun homographs, reports ambiguous and missing matches, creates noncumulative frequency ordered books', () => {
  const raw = parseFreeDict(tei(entry('livre', '书', 'n', 'masc') + entry('livre', '磅', 'n', 'fem') + entry('voiture', '汽车') + entry('chat', '猫') + entry('rare', '少见', 'adj') + entry('voiture', '轿车'))).entries;
  const levels = parseFlelex('word\tpos\tlevel\tA1\tB2\tC2\ttotal\nlivre\tNOM\tA1\t50\t0\t0\t50\nvoiture\tNOM\tA1\t20\t1\t0\t21\nchat\tNOM\tA1\t10\t1\t0\t11\nrare\tADJ\tC2\t0\t0\t2\t2\nmissing\tNOM\tB2\t0\t2\t0\t2').entries;
  const result = mergeDictionary(raw, levels); validateDataset(result.words, result.books);
  assert.equal(result.words.filter(w => w.lemma === 'livre').length, 2);
  assert.equal(result.ambiguous.length, 1); assert.equal(result.unmatched.length, 1); assert.equal(result.duplicates.length, 1);
  assert.deepEqual(result.books[0].wordIds.map(id => result.words.find(w => w.id === id)!.lemma), ['voiture','chat']);
  assert.ok(!result.books.some(b => b.wordIds.includes(result.words.find(w => w.lemma === 'rare')!.id)));
  assert.deepEqual(result.words.map(w => w.id), mergeDictionary([...raw].reverse(), levels).words.map(w => w.id));
  assert.throws(() => validateDataset([...result.words, result.words[0]], result.books), /Duplicate/);
});
test('Tatoeba exact token matching does not confuse chat/château or ou/où and handles apostrophes and phrases', () => {
  const parsed = parseTatoeba('1\tLe château est grand.\t2\t城堡很大。\tAlice\tBob\n3\tLe chat dort ici.\t4\t猫在这里睡觉。\tAlice\tBob\n5\tC’est un arc-en-ciel.\t6\t这是一道彩虹。\tAlice\tBob\n7\tOù est la gare ?\t8\t车站在哪？\tAlice\tBob\n9\tSee https://x.org now.\t10\t网址。\tAlice\tBob');
  assert.equal(parsed.skipped, 1); const match = createExampleMatcher(parsed.examples);
  assert.equal(match('chat')?.french, 'Le chat dort ici.'); assert.equal(match('château')?.french, 'Le château est grand.');
  assert.ok(match('arc-en-ciel')); assert.ok(match('est')); assert.equal(match('ou'), undefined); assert.equal(match('chat dort')?.chinese, '猫在这里睡觉。');
  assert.match(match('chat')!.attribution!, /Alice \/ Bob/);
});
test('v3 additive upgrade backfills search without changing IDs or old stored values', async () => {
  const { db, close } = openTestDatabase();
  try {
    await db.execAsync(SCHEMA_V1); await db.execAsync('PRAGMA user_version = 3');
    await importWordBook(db, { id: 'old', name: 'old', words: [{ lemma: 'École', displayForm: 'une école', partOfSpeech: 'noun', meaningsZh: ['学校'] }] });
    const old = await db.getFirstAsync<{ id: string }>('SELECT id FROM words');
    await migrateDatabase(db); await migrateDatabase(db);
    assert.equal((await findWords(db, 'ecole', 'fr-zh'))[0].id, old!.id);
    assert.equal((await findWords(db, 'UNE ECOLE', 'fr-zh'))[0].lemma, 'École');
  } finally { close(); }
});
test('offline import preserves curated content, cards/logs/session/checkins and selected book, and repeated import is a fast no-op', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db);
    const session = await startStudy(db, { createId: randomUUID, now: () => new Date('2026-09-22T10:00:00Z') }); assert.equal(session.kind, 'session');
    if (session.kind !== 'session') throw Error('session'); const prompt = session.session.getSnapshot(); assert.equal(prompt.status, 'prompt');
    if (prompt.status !== 'prompt') throw Error('prompt'); await session.session.submitChoice(prompt.token, prompt.item.word.wordId);
    await db.runAsync("INSERT INTO checkins VALUES ('2026-09-22','2026-09-22T10:00:00Z')");
    const tables = ['cards','review_logs','sessions','study_rounds','checkins','settings'];
    const before = await Promise.all(tables.map(t => db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`)));
    const old = (await findWords(db, 'voiture', 'fr-zh'))[0], detail = await getDictionaryEntry(db, old.id);
    const data = bundle([word('voiture', { gender: 'f', meaningsZh: ['汽车','新增释义'], examples: [{ french: 'Fake fixture.', chinese: '仅测试', source: 'tatoeba', sourceRef: 'fixture' }] }), word('offline-new')]);
    await importOfflineDataset(db, data);
    for (let i = 0; i < tables.length; i++) {
      const after = await db.getAllAsync<{ key?: string }>(`SELECT * FROM ${tables[i]} ORDER BY rowid`);
      assert.deepEqual(after.filter(r => !r.key?.startsWith('dictionary_')), before[i]);
    }
    const updated = await getDictionaryEntry(db, old.id); assert.equal(updated?.wordId, old.id); assert.equal(updated?.meaningsZh[0], detail?.meaningsZh[0]); assert.deepEqual(updated?.examples, detail?.examples); assert.ok(updated?.meaningsZh.includes('新增释义'));
    const count = await db.getFirstAsync('SELECT COUNT(*) n FROM meanings');
    assert.equal(await importOfflineDataset(db, { ...data, chunks: [() => { throw Error('must not load seed again'); }] }), false);
    assert.deepEqual(await db.getFirstAsync('SELECT COUNT(*) n FROM meanings'), count);
  } finally { close(); }
});
test('interrupted chunk is rolled back, completed chunks resume, and version is recorded only at completion', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); const data = bundle([word('one'),word('two')]); let calls = 0;
    const interrupted: Database = { ...db, withTransactionAsync: async task => { if (++calls === 2) throw Error('interrupted'); await db.withTransactionAsync(task); } };
    await assert.rejects(importOfflineDataset(interrupted, data), /interrupted/);
    assert.equal(await db.getFirstAsync("SELECT * FROM settings WHERE key = 'dictionary_dataset_version'"), null);
    assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM dictionary_word_map'))!.n, 1);
    await importOfflineDataset(db, { ...data, chunks: [() => { throw Error('must resume after chunk one'); }, data.chunks[1]] });
    assert.equal((await getUnlearnedWords(db, 'a2-core', 10)).length, 2);
    await db.execAsync("CREATE TRIGGER reject_meaning BEFORE INSERT ON meanings WHEN NEW.meaning_zh = '故障' BEGIN SELECT RAISE(ABORT,'injected'); END;");
    await assert.rejects(importOfflineDataset(db, bundle([word('rollback', { meaningsZh: ['故障'] })], 'next')));
    assert.equal(await db.getFirstAsync("SELECT * FROM words WHERE lemma = 'rollback'"), null);
    assert.equal((await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='dictionary_dataset_version'"))!.value, 'fixture');
  } finally { close(); }
});
test('same lemma masculine/feminine entries retain separate identities while existing masculine ID is reused', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); const old = (await findWords(db, 'livre', 'fr-zh'))[0];
    await importOfflineDataset(db, bundle([word('livre', { id: 'livre-m', gender: 'm', homograph: 'm', meaningsZh: ['书'] }), word('livre', { id: 'livre-f', gender: 'f', homograph: 'f', meaningsZh: ['磅'] })]));
    const results = (await findWords(db, 'livre', 'fr-zh')).filter(w => w.lemma === 'livre'); assert.equal(results.length, 2);
    assert.equal(results.find(w => w.gender === 'm')?.id, old.id); assert.equal(results.find(w => w.gender === 'f')?.primary_meaning_zh, '磅');
  } finally { close(); }
});
test('later releases append reordered meanings and CEFR metadata without losing existing A1 order or selection', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db);
    const old = await db.getAllAsync('SELECT * FROM word_book_words WHERE book_id = \'a1-core\' ORDER BY order_index');
    const first = bundle([word('future-level', { meaningsZh: ['原义'] })], 'first'); first.books = [];
    await importOfflineDataset(db, first);
    const second = bundle([word('future-level', { meaningsZh: ['新义','原义'], cefrLevel: 'A1' })], 'second');
    second.books = [{ id: 'a1-core', name: 'A1 核心词汇', level: 'A1', wordIds: ['fixture-future-level'] }];
    await importOfflineDataset(db, second);
    assert.deepEqual((await getDictionaryEntry(db, 'fixture-future-level'))?.meaningsZh, ['原义','新义']);
    assert.equal((await db.getFirstAsync<{ cefr_level: string }>("SELECT cefr_level FROM words WHERE id='fixture-future-level'"))!.cefr_level, 'A1');
    const after = await db.getAllAsync('SELECT * FROM word_book_words WHERE book_id = \'a1-core\' ORDER BY order_index');
    assert.deepEqual(after.slice(0, old.length), old); assert.equal(after.length, old.length + 1);
    assert.equal((await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='current_book_id'"))!.value, 'a1-core');
  } finally { close(); }
});
test('a conflicting source gender never overwrites curated gender or prevents the remaining import', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); const old = (await findWords(db, 'voiture', 'fr-zh'))[0];
    await importOfflineDataset(db, bundle([word('voiture', { gender: 'm', meaningsZh: ['汽车'] })]));
    const result = (await findWords(db, 'voiture', 'fr-zh'))[0];
    assert.equal(result.id, old.id); assert.equal(result.gender, 'f');
  } finally { close(); }
});
test('CEFR book selection uses existing Study and Review stays global; vocabulary adds no card', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db); const data = bundle([word('new-one'),word('new-two')]); await importOfflineDataset(db, data);
    await setCurrentBook(db, 'a2-core'); assert.deepEqual((await getUnlearnedWords(db, 'a2-core', 10)).map(w => w.id), ['fixture-new-one','fixture-new-two']);
    await addVocabularyWord(db, 'fixture-new-one'); await addVocabularyWord(db, 'fixture-new-one');
    assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM cards'))!.n, 0);
    const opened = await startStudy(db, { createId: randomUUID }); if (opened.kind !== 'session') throw Error('session');
    const p = opened.session.getSnapshot(); if (p.status !== 'prompt') throw Error('prompt');
    await opened.session.submitChoice(p.token, p.item.word.wordId);
    await db.runAsync("UPDATE cards SET due_at='2000-01-01T00:00:00Z'"); await setCurrentBook(db, 'a1-core');
    assert.equal((await getDueCards(db, new Date())).length, 1);
    await removeVocabularyWord(db, 'fixture-new-one'); assert.equal((await getDueCards(db, new Date())).length, 1);
  } finally { close(); }
});
