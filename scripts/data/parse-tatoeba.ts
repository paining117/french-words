import { parse } from 'csv-parse/sync';
import { normalizeFrench } from '../../src/utils/normalizeFrench';
import type { DatasetExample } from '../../src/types/dataset';
export function frenchTokens(text: string): string[] {
  return normalizeFrench(text).replace(/[’‘ʼ]/g, "'").match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
}
export function parseTatoeba(text: string) {
  const rows = parse(text, { delimiter: '\t', quote: false, bom: true, skip_empty_lines: true, relax_column_count: true }) as string[][];
  const examples: DatasetExample[] = []; let skipped = 0;
  for (const row of rows) {
    // Official Sentence pairs export: French id, French text, Chinese id, Chinese text.
    if (![4, 6].includes(row.length) || !/^\d+$/.test(row[0]) || !/^\d+$/.test(row[2])) { skipped++; continue; }
    const french = row[1].trim(), chinese = row[3].trim(), n = frenchTokens(french).length;
    if (n < 3 || n > 15 || french.length > 120 || !/\p{Script=Han}/u.test(chinese) || /https?:\/\/|www\.|[!?]{3}|[<>]/i.test(french + chinese)) { skipped++; continue; }
    examples.push({ french, chinese, source: 'tatoeba', attribution: row.length === 6 ? `${row[4]} / ${row[5]} · CC BY 2.0 FR` : 'Tatoeba contributors · CC BY 2.0 FR', sourceRef: `https://tatoeba.org/sentences/show/${row[0]}|https://tatoeba.org/sentences/show/${row[2]}` });
  }
  return { examples, parsed: rows.length, skipped };
}
export function createExampleMatcher(examples: DatasetExample[]) {
  const rows = [...examples].sort((a, b) => a.french.length - b.french.length || a.sourceRef.localeCompare(b.sourceRef));
  const index = new Map<string, number[]>(), tokenized = rows.map(e => frenchTokens(e.french));
  tokenized.forEach((tokens, i) => { for (const token of new Set(tokens)) { const ids = index.get(token) ?? []; ids.push(i); index.set(token, ids); } });
  return (lemma: string): DatasetExample | undefined => {
    const tokens = frenchTokens(lemma); if (!tokens.length) return;
    for (const i of index.get(tokens[0]) ?? []) {
      if (tokenized[i].some((_, offset) => tokens.every((token, j) => tokenized[i][offset + j] === token))) return rows[i];
    }
  };
}
