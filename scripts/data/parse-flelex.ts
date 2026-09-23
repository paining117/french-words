import { parse } from 'csv-parse/sync';
import { normalizeFrench } from '../../src/utils/normalizeFrench';
import type { CefrLevel } from '../../src/types/dataset';
import { mapPos } from './pos';
export interface CefrEntry { lemma: string; normalizedLemma: string; partOfSpeech: string; properNoun: boolean; cefrLevel: CefrLevel; levelFrequency?: number; totalFrequency?: number }
export const levels: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const key = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
export function parseFlelex(text: string) {
  const rows = parse(text, { bom: true, delimiter: text.split('\n')[0].includes('\t') ? '\t' : ',', columns: (headers: string[]) => headers.map(key), skip_empty_lines: true, trim: true }) as Record<string, string>[];
  if (!rows.length) throw Error('Empty FLELex file');
  const names = Object.keys(rows[0]);
  const column = (candidates: string[]) => candidates.find(k => names.includes(k));
  const lemmaKey = column(['word', 'lemma', 'lemme']), posKey = column(['pos', 'tag', 'category', 'partofspeech']);
  const levelKey = column(['level', 'cefr', 'cefrlevel', 'derivedlevel', 'derivedcefrlevel', 'levelbeacco', 'beacco', 'predictedlevel']);
  if (!lemmaKey || !posKey || !levelKey) throw Error(`Unrecognized FLELex headers: ${names.join(', ')}. Expected explicit Beacco derived level; do not infer it.`);
  const entries: CefrEntry[] = [], skipped: unknown[] = [];
  for (const [i, row] of rows.entries()) {
    const lemma = row[lemmaKey].trim().normalize('NFC'), level = row[levelKey].trim().toUpperCase() as CefrLevel;
    const mapped = mapPos(row[posKey]);
    if (!lemma || !/\p{L}/u.test(lemma) || /^(pun|sent|sym)/i.test(row[posKey]) || !levels.includes(level)) { skipped.push({ row: i + 2, lemma, level, reason: 'invalid-or-unassigned' }); continue; }
    const number = (v?: string) => v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined;
    const levelFreq = column([level.toLowerCase(), `freq${level.toLowerCase()}`, `frequency${level.toLowerCase()}`]);
    const total = column(['total', 'totalfrequency', 'freqtotal', 'frequencytotal', 'frequency', 'freq']);
    entries.push({ lemma, normalizedLemma: normalizeFrench(lemma), partOfSpeech: mapped.pos, properNoun: mapped.proper, cefrLevel: level, levelFrequency: number(levelFreq ? row[levelFreq] : undefined), totalFrequency: number(total ? row[total] : undefined) });
  }
  return { entries, skipped, rawCount: rows.length, headers: names };
}
