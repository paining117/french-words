import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseFreeDict } from './parse-freedict';
import { parseFlelex } from './parse-flelex';
import { parseTatoeba, createExampleMatcher } from './parse-tatoeba';
import { mergeDictionary } from './merge-dictionary';
import { validateDataset } from './validate-dataset';

const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const write = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const lines = (file: string, rows: unknown[]) => writeFileSync(file, rows.map(v => JSON.stringify(v)).join('\n') + '\n');
export function buildDataset() {
  const rawRoot = 'data/raw', output = 'data/generated';
  const teiPath = join(rawRoot, 'freedict/fra-zho/fra-zho/fra-zho.tei');
  const tei = readFileSync(teiPath, 'utf8'), freedict = parseFreeDict(tei);
  const catalog = JSON.parse(readFileSync(join(rawRoot, 'freedict/catalog.json'), 'utf8'));
  const release = catalog.find((r: { name: string }) => r.name === 'fra-zho')?.releases.find((r: { platform: string; version: string }) => r.platform === 'src' && r.version === freedict.metadata.version);
  const archive = readFileSync(join(rawRoot, 'freedict/fra-zho/source.tar.xz'));
  if (!release || createHash('sha512').update(archive).digest('hex') !== release.checksum) throw Error('Official FreeDict archive checksum mismatch');
  const flelexPath = join(rawRoot, 'flelex/FleLex_TT_Beacco.tsv');
  const flelexText = existsSync(flelexPath) ? readFileSync(flelexPath, 'utf8') : null;
  const flelex = flelexText ? parseFlelex(flelexText) : { entries: [], skipped: [], rawCount: 0, headers: [] };
  const tatoebaPath = join(rawRoot, 'tatoeba/fra-cmn.tsv');
  const tatoebaText = existsSync(tatoebaPath) ? readFileSync(tatoebaPath, 'utf8') : null;
  const tatoebaMetaPath = join(rawRoot, 'tatoeba/source.json');
  if (tatoebaText && !existsSync(tatoebaMetaPath)) throw Error('Tatoeba source.json with actual license and download metadata is required');
  const tatoebaMeta = tatoebaText ? JSON.parse(readFileSync(tatoebaMetaPath, 'utf8')) : null;
  if (tatoebaMeta && (!tatoebaMeta.sourceUrl?.startsWith('https://') || !tatoebaMeta.license || !tatoebaMeta.downloadedAt)) throw Error('Incomplete Tatoeba provenance');
  const tatoeba = tatoebaText ? parseTatoeba(tatoebaText) : { examples: [], parsed: 0, skipped: 0 };
  const merged = mergeDictionary(freedict.entries, flelex.entries);
  const matchExample = createExampleMatcher(tatoeba.examples);
  for (const word of merged.words) { const example = matchExample(word.lemma); if (example) word.examples = [example]; }
  validateDataset(merged.words, merged.books);
  const warnings = [!flelexText ? 'FLELex missing: CEFR generation unavailable; no levels invented' : '', !tatoebaText ? 'Tatoeba example step skipped: optional official export missing' : ''].filter(Boolean);
  const sources = {
    freedict: { dictionary: 'fra-zho', ...freedict.metadata, sourceUrl: release.URL, downloadedAt: statSync(join(rawRoot, 'freedict/fra-zho/source.tar.xz')).mtime.toISOString(), sha256: sha(tei), archiveSha512: release.checksum },
    flelex: { available: !!flelexText, variant: 'FLELex / Beacco with TreeTagger POS', sourceUrl: 'https://cental.uclouvain.be/cefrlex/static/resources/fr/FleLex_TT_Beacco.tsv', pageUrl: 'https://cental.uclouvain.be/cefrlex/flelex/download/', license: 'CC BY-NC-SA 4.0', version: flelexText ? `sha256:${sha(flelexText)}` : null, downloadedAt: flelexText ? statSync(flelexPath).mtime.toISOString() : null, authors: 'Pintard, A. & François, T. (2020); François, T., Gala, N., Watrin, P. & Fairon, C. (2014)' },
    tatoeba: { available: !!tatoebaText, ...(tatoebaMeta ?? { sourceUrl: 'https://tatoeba.org/en/downloads', license: null }), sha256: tatoebaText ? sha(tatoebaText) : null },
  };
  const counts = { dictionaryEntries: merged.words.length, meanings: merged.words.reduce((n, w) => n + w.meaningsZh.length, 0), examples: merged.words.filter(w => w.examples.length).length, ...Object.fromEntries(merged.books.map(b => [b.level, b.wordIds.length])) };
  const version = `offline-v1-${sha(JSON.stringify([merged.words, merged.books])).slice(0, 20)}`;
  for (const dir of ['dictionary', 'wordbooks', 'reports', 'seed']) mkdirSync(join(output, dir), { recursive: true });
  lines(join(output, 'dictionary/words.jsonl'), merged.words.map(({ meaningsZh, examples, ...word }) => word));
  lines(join(output, 'dictionary/meanings.jsonl'), merged.words.flatMap(w => w.meaningsZh.map((meaningZh, orderIndex) => ({ wordId: w.id, meaningZh, orderIndex }))));
  lines(join(output, 'dictionary/examples.jsonl'), merged.words.flatMap(w => w.examples.map(e => ({ wordId: w.id, ...e }))));
  for (const book of merged.books) write(join(output, `wordbooks/${book.level.toLowerCase()}.json`), book);
  const chunks: string[] = [];
  for (let i = 0; i < merged.words.length; i += 250) { const name = `dictionary-${String(chunks.length + 1).padStart(3, '0')}.json`; writeFileSync(join(output, 'seed', name), JSON.stringify(merged.words.slice(i, i + 250))); chunks.push(name); }
  // Literal require paths for Metro; each JSON chunk is loaded only during import.
  writeFileSync(join(output, 'seed/index.ts'), `import type { DatasetBundle, DatasetWord } from '../../../src/types/dataset';\nexport const bundledDataset: DatasetBundle = {\nversion: ${JSON.stringify(version)},\nbooks: [${(flelexText ? merged.books : []).map(b => `require('../wordbooks/${b.level.toLowerCase()}.json')`).join(',')}],\nchunks: [\n${chunks.map(n => `() => require('./${n}') as DatasetWord[]`).join(',\n')}\n] };\n`);
  write('data/sources.json', sources);
  write(join(output, 'manifest.json'), { schemaVersion: 1, version, generatedAt: new Date().toISOString(), sources, counts, warnings });
  const summary = { freedictRawHeadwords: freedict.rawHeadwords, freedictParsed: freedict.entries.length, freedictSkipped: freedict.skipped.length, uniqueDictionaryWords: counts.dictionaryEntries, chineseMeanings: counts.meanings, flelexRaw: flelex.rawCount, flelexParsed: flelex.entries.length, flelexMatched: merged.matched, flelexUnmatched: merged.unmatched.length, ambiguousMatches: merged.ambiguous.length, ...Object.fromEntries(merged.books.map(b => [b.level, b.wordIds.length])), tatoebaPairsParsed: tatoeba.parsed, tatoebaPairsEligible: tatoeba.examples.length, wordsWithExamples: counts.examples, wordsWithoutExamples: counts.dictionaryEntries - counts.examples, warnings };
  write(join(output, 'reports/build-summary.json'), summary);
  write(join(output, 'reports/freedict-unparsed.json'), freedict.skipped);
  write(join(output, 'reports/freedict-warnings.json'), freedict.warnings);
  write(join(output, 'reports/flelex-unmatched.json'), merged.unmatched);
  write(join(output, 'reports/flelex-skipped.json'), flelex.skipped);
  write(join(output, 'reports/cefr-ambiguous.json'), merged.ambiguous);
  write(join(output, 'reports/duplicate-report.json'), merged.duplicates);
  console.log(JSON.stringify(summary, null, 2));
  return { words: merged.words, books: merged.books, version };
}
buildDataset();
