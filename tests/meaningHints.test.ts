import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase, initializeSampleDatabase } from '../src/db/database';
import { importWordBook } from '../scripts/import-wordbook';
import { getDictionaryEntry, getExampleCredits } from '../src/repositories/wordRepository';
import { prepareMeaningChoices } from '../src/services/meaningChoices';
import { loadSpellingHints } from '../src/services/spellingService';
import { meaningKeys, spellingHint, usageHint } from '../src/utils/meaningHints';
import type { StudyReviewWord, StudyWord } from '../src/types/study';
import { openTestDatabase } from './sqliteAdapter';

test('greeting prompts explain usage without claiming bonjour is exclusively formal', () => {
  const bonjour = { lemma: 'Bonjour', partOfSpeech: 'interjection' };
  const salut = { lemma: 'salut', partOfSpeech: 'interjection' };
  assert.equal(spellingHint(bonjour, [salut]), '白天见面时的常用问候');
  assert.equal(spellingHint(salut, [bonjour]), '熟人间的随意问候，也可用于告别');
  assert.equal(usageHint({ lemma: 'salut', partOfSpeech: 'noun' }), undefined);
});

test('ambiguous spelling hints distinguish equal lengths and equal initials, including Unicode', () => {
  assert.equal(spellingHint({ lemma: 'voiture' }, [{ lemma: 'auto' }]), '首字母 v · 7 个字母');
  assert.equal(spellingHint({ lemma: 'bateau' }, [{ lemma: 'barque' }]), '开头 bat · 6 个字母');
  assert.equal(spellingHint({ lemma: 'école' }, [{ lemma: 'étude' }]), '开头 ec · 5 个字母');
  assert.equal(spellingHint({ lemma: 'ÉCOLE' }, [{ lemma: 'école' }]), undefined);
  assert.equal(spellingHint({ lemma: 'voiture' }, []), undefined);
  assert.deepEqual(meaningKeys(' 你好！（口语）； 再见。'), ['你好', '再见']);
});

test('spelling checks synonyms outside the round, not just the previous or next word', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db);
    await importWordBook(db, { id: 'hints', name: 'Hints', words: [
      { lemma: 'bateau', partOfSpeech: 'noun', meaningsZh: ['船'] },
      { lemma: 'barque', partOfSpeech: 'noun', meaningsZh: ['小舟', '船（小型）'] },
    ] });
    const words: StudyReviewWord[] = [{ wordId: 'saved-boat', lemma: 'bateau', partOfSpeech: 'noun', meaning: '船', dueAt: '', suspended: false }];
    const hints = await loadSpellingHints(db, words);
    assert.equal(hints['saved-boat'], '开头 bat · 6 个字母');
    const greeting = await loadSpellingHints(db, [{ ...words[0], wordId: 'saved-greeting', lemma: 'bonjour', partOfSpeech: 'interjection', meaning: '你好' }]);
    assert.match(greeting['saved-greeting']!, /白天见面/);
  } finally { close(); }
});

test('bundled dictionary greetings retain useful hints and never appear as competing choices', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const rows = await db.getAllAsync<{ id: string }>("SELECT id FROM words WHERE lemma IN ('bonjour', 'salut') AND part_of_speech = 'interjection'");
    assert.equal(rows.length, 2);
    const words = await Promise.all(rows.map(async row => ({ ...await getDictionaryEntry(db, row.id), wordId: row.id } as StudyWord)));
    const choices = await prepareMeaningChoices(db, words);
    for (const word of choices) assert.equal(word.meaningChoices!.filter(choice => rows.some(row => row.id === choice.id)).length, 1);
    const hints = await loadSpellingHints(db, words.map(word => ({ ...word, meaning: word.meaningsZh[0], dueAt: '', suspended: false })));
    assert.match(hints[words.find(word => word.lemma === 'bonjour')!.wordId]!, /白天见面/);
    assert.match(hints[words.find(word => word.lemma === 'salut')!.wordId]!, /熟人间/);
  } finally { close(); }
});

test('choices exclude every sense of synonyms and repair ambiguous saved options without changing a committed answer', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db);
    await importWordBook(db, { id: 'synonym-repair', name: 'Synonyms', words: [
      { lemma: 'boat-target', partOfSpeech: 'noun', meaningsZh: ['船'] },
      { lemma: 'boat-synonym', partOfSpeech: 'noun', meaningsZh: ['小舟', ' 船！（小型）'] },
    ] });
    const rows = await db.getAllAsync<{ id: string; lemma: string }>("SELECT id, lemma FROM words WHERE lemma LIKE 'boat-%'");
    const targetId = rows.find(row => row.lemma === 'boat-target')!.id;
    const synonymId = rows.find(row => row.lemma === 'boat-synonym')!.id;
    const word = { ...await getDictionaryEntry(db, targetId), wordId: targetId } as StudyWord;
    const [initial] = await prepareMeaningChoices(db, [word]);
    assert.ok(initial.meaningChoices!.every(choice => choice.id !== synonymId));
    const saved = { ...initial, meaningChoices: initial.meaningChoices!.map(choice => ({ ...choice })) };
    const index = saved.meaningChoices.findIndex(choice => choice.id !== targetId);
    saved.meaningChoices[index] = { id: synonymId, lemma: 'boat-synonym', frenchLabel: 'boat-synonym', meaning: '小舟' };
    const [repaired] = await prepareMeaningChoices(db, [saved]);
    assert.ok(repaired.meaningChoices!.every(choice => choice.id !== synonymId));
    assert.deepEqual((await prepareMeaningChoices(db, [repaired]))[0], repaired);
    const [answered] = await prepareMeaningChoices(db, [saved], true);
    assert.deepEqual(answered.meaningChoices!.map(choice => [choice.id, choice.meaning]), saved.meaningChoices.map(choice => [choice.id, choice.meaning]));
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM cards'))!.count, 0);
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM review_logs'))!.count, 0);
  } finally { close(); }
});

test('example attribution remains accessible separately without altering dictionary examples', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeSampleDatabase(db);
    const word = await db.getFirstAsync<{ id: string }>('SELECT id FROM words LIMIT 1');
    await db.runAsync("INSERT INTO examples (id, word_id, french, chinese, source, source_ref, attribution, order_index) VALUES ('credit-example', ?, ?, ?, 'tatoeba', ?, ?, 99)", word!.id, 'Bonjour.', '你好。', 'https://tatoeba.org/sentences/show/1', 'Example author · CC BY 2.0 FR');
    const credits = await getExampleCredits(db, 0);
    assert.equal(credits[0].attribution, 'Example author · CC BY 2.0 FR');
    assert.equal(credits[0].source_ref, 'https://tatoeba.org/sentences/show/1');
    assert.ok((await getDictionaryEntry(db, word!.id))!.examples.some(example => example.attribution === credits[0].attribution));
    assert.deepEqual(await getExampleCredits(db, 1), []);
  } finally { close(); }
});
