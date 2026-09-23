import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { openTestDatabase } from '../../tests/sqliteAdapter';
import { initializeSampleDatabase, initializeDatabase } from '../../src/db/database';
import { bundledDataset } from '../../data/generated/seed';
import { importOfflineDataset } from '../../src/db/importOfflineDataset';
import { validateDataset } from './validate-dataset';
import { findWords } from '../../src/repositories/wordRepository';
import { startStudy } from '../../src/services/studyService';
import { getBooks } from '../../src/repositories/wordBookRepository';
import type { Direction } from '../../src/types/dictionary';

const size = (path: string): number => statSync(path).isDirectory() ? readdirSync(path).reduce((n, name) => n + size(join(path, name)), 0) : statSync(path).size;
async function main() {
  validateDataset(bundledDataset.chunks.flatMap(load => load()), bundledDataset.books);
  mkdirSync('.verification', { recursive: true });
  const directory = mkdtempSync('.verification/offline-import-'), file = join(directory, 'dictionary.db');
  const { db, close } = openTestDatabase(file);
  let report;
  try {
    await initializeSampleDatabase(db);
    const opened = await startStudy(db, { createId: randomUUID });
    if (opened.kind !== 'session') throw Error('Expected baseline study session');
    const prompt = opened.session.getSnapshot(); if (prompt.status !== 'prompt') throw Error('Expected prompt');
    await opened.session.submitChoice(prompt.token, prompt.item.word.wordId);
    await db.runAsync("INSERT INTO checkins VALUES ('2026-09-22','2026-09-22T10:00:00.000Z')");
    const tables = ['cards','review_logs','sessions','study_rounds','checkins'];
    const before = await Promise.all(tables.map(t => db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`)));
    const oldWords = await db.getAllAsync<{ id: string }>('SELECT id FROM words');
    const oldRelations = await db.getAllAsync('SELECT * FROM word_book_words ORDER BY book_id,order_index');
    const start = performance.now(); await importOfflineDataset(db, bundledDataset); const importMs = performance.now() - start;
    for (let i = 0; i < tables.length; i++) assert.deepEqual(await db.getAllAsync(`SELECT * FROM ${tables[i]} ORDER BY rowid`), before[i], tables[i]);
    for (const row of oldWords) assert.ok(await db.getFirstAsync('SELECT 1 FROM words WHERE id = ?', row.id));
    for (const relation of oldRelations as { book_id: string; word_id: string; order_index: number }[]) assert.deepEqual(await db.getFirstAsync('SELECT * FROM word_book_words WHERE book_id = ? AND word_id = ?', relation.book_id, relation.word_id), relation);
    const repeat = performance.now(); await initializeDatabase(db); const repeatMs = performance.now() - repeat;
    const search: { query: string; direction: Direction; ms: number; hits: number }[] = [];
    for (const [query, direction] of [['voiture','fr-zh'],['VOITURE','fr-zh'],['une voiture','fr-zh'],['ecole','fr-zh'],['etre','fr-zh'],['soeur','fr-zh'],['livre','fr-zh'],['vo','fr-zh'],['汽车','zh-fr'],['车','zh-fr'],['火山','zh-fr'],['not-a-real-word','fr-zh']] as [string,Direction][]) {
      const start = performance.now(); const matches = await findWords(db, query, direction);
      assert.ok(matches.length <= 20); search.push({ query, direction, ms: +(performance.now() - start).toFixed(3), hits: matches.length });
      if (query.toLowerCase() === 'voiture') assert.equal(matches[0].lemma, 'voiture');
    }
    const counts: Record<string,number> = {};
    for (const t of ['words','meanings','examples','cards','review_logs','dictionary_word_map']) counts[t] = (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`))!.n;
    assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'), []);
    assert.equal(Object.values((await db.getFirstAsync('PRAGMA integrity_check'))!)[0], 'ok');
    const books = await getBooks(db);
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    report = { datasetVersion: bundledDataset.version, validatedAt: new Date().toISOString(), environment: `Node ${process.version}, desktop SQLite; not iPhone`, importMs: +importMs.toFixed(3), repeatMs: +repeatMs.toFixed(3), preservedOldWordIds: oldWords.length, preservedTables: tables, counts, books: books.map(b => ({ id:b.id, total:b.total, learned:b.learned })), search, maxSearchMs: Math.max(...search.map(s => s.ms)), databaseFile: file, databaseBytes: statSync(file).size, generatedBytes: size('data/generated'), runtimeSeedBytes: size('data/generated/seed'), foreignKeys: 'ok', integrity: 'ok' };
  } finally { close(); }
  writeFileSync('data/generated/reports/import-verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
