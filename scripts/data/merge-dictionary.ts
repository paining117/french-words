import { createHash } from 'node:crypto';
import type { DatasetWord, DatasetBook } from '../../src/types/dataset';
import type { RawDictionaryEntry } from './parse-freedict';
import type { CefrEntry } from './parse-flelex';
export const stableId = (lemma: string, pos: string, discriminator = '') => `dict_${createHash('sha256').update(JSON.stringify([lemma, pos, discriminator])).digest('hex').slice(0, 24)}`;
export function mergeDictionary(raw: RawDictionaryEntry[], cefr: CefrEntry[]) {
  const groups = new Map<string, RawDictionaryEntry[]>();
  for (const row of raw) { const key = JSON.stringify([row.normalizedLemma, row.partOfSpeech]); const group = groups.get(key) ?? []; group.push(row); groups.set(key, group); }
  const words: DatasetWord[] = [], duplicates: unknown[] = [];
  for (const group of groups.values()) {
    // Distinct known noun genders carry different homograph senses (e.g. livre).
    const split = new Set(group.map(e => e.gender).filter(Boolean)).size > 1;
    const subgroups = new Map<string, RawDictionaryEntry[]>();
    for (const row of group) { const key = split ? row.gender ?? 'unknown' : ''; const sub = subgroups.get(key) ?? []; sub.push(row); subgroups.set(key, sub); }
    for (const [homograph, sub] of subgroups) {
      const row = sub[0], meaningsZh = [...new Set(sub.flatMap(v => v.meaningsZh))];
      if (sub.length > 1) duplicates.push({ lemma: row.lemma, pos: row.partOfSpeech, homograph, sourceRefs: sub.map(v => v.sourceRef), merged: sub.length });
      // Do not infer number or fabricate an article from spelling alone.
      words.push({ ...row, id: stableId(row.normalizedLemma, row.partOfSpeech, homograph), homograph, meaningsZh, sourceRef: sub.map(v => v.sourceRef).join('|'), examples: [] });
    }
  }
  words.sort((a, b) => a.normalizedLemma.localeCompare(b.normalizedLemma, 'fr') || a.id.localeCompare(b.id));
  const byLemma = new Map<string, DatasetWord[]>();
  for (const w of words) { const list = byLemma.get(w.normalizedLemma) ?? []; list.push(w); byLemma.set(w.normalizedLemma, list); }
  const unmatched: unknown[] = [], ambiguous: unknown[] = [], assignments = new Map<string, CefrEntry[]>(); let matched = 0;
  for (const row of cefr) {
    const candidates = byLemma.get(row.normalizedLemma) ?? [];
    if (row.properNoun) { unmatched.push({ ...row, reason: 'proper-noun-excluded' }); continue; }
    const compatible = candidates.filter(w => !w.properNoun && row.partOfSpeech !== 'other' && w.partOfSpeech === row.partOfSpeech);
    const eligible = compatible.length ? compatible : candidates.length === 1 && !candidates[0].properNoun && (row.partOfSpeech === 'other' || candidates[0].partOfSpeech === 'other') ? candidates : [];
    if (eligible.length > 1 || (!eligible.length && candidates.length > 1 && row.partOfSpeech === 'other')) { ambiguous.push({ ...row, reason: 'ambiguous_cefr_match', candidates: candidates.map(w => w.id) }); continue; }
    if (!eligible.length) { unmatched.push({ ...row, reason: candidates.length ? 'pos-mismatch' : 'no-Chinese-entry' }); continue; }
    const list = assignments.get(eligible[0].id) ?? []; list.push(row); assignments.set(eligible[0].id, list); matched++;
  }
  const assigned = new Map<string, CefrEntry>();
  for (const word of words) {
    const rows = assignments.get(word.id); if (!rows) continue;
    if (new Set(rows.map(r => r.cefrLevel)).size > 1) { ambiguous.push({ wordId: word.id, reason: 'conflicting-cefr-levels', entries: rows }); matched -= rows.length; continue; }
    const row = [...rows].sort((a, b) => (b.levelFrequency ?? b.totalFrequency ?? -1) - (a.levelFrequency ?? a.totalFrequency ?? -1) || (b.totalFrequency ?? -1) - (a.totalFrequency ?? -1))[0];
    word.cefrLevel = row.cefrLevel; assigned.set(word.id, row);
  }
  const books: DatasetBook[] = (['A1', 'A2', 'B1', 'B2'] as const).map(level => {
    const selected = words.filter(w => w.cefrLevel === level && !w.properNoun);
    selected.sort((a, b) => {
      const x = assigned.get(a.id)!, y = assigned.get(b.id)!;
      return (y.levelFrequency ?? y.totalFrequency ?? -1) - (x.levelFrequency ?? x.totalFrequency ?? -1) || (y.totalFrequency ?? -1) - (x.totalFrequency ?? -1) || a.normalizedLemma.localeCompare(b.normalizedLemma, 'fr') || a.id.localeCompare(b.id);
    });
    return { id: `${level.toLowerCase()}-core`, name: `${level} 核心词汇`, level, wordIds: selected.map(w => w.id) };
  });
  return { words, books, unmatched, ambiguous, duplicates, matched };
}
