import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { normalizeFrench, foldFrenchSearch } from '../../src/utils/normalizeFrench';
import { mapPos } from './pos';
export interface RawDictionaryEntry { lemma: string; normalizedLemma: string; searchKey: string; partOfSpeech: string; gender?: 'm' | 'f'; meaningsZh: string[]; source: 'freedict'; sourceRef: string; properNoun: boolean }
type Node = Record<string, unknown>;
const record = (v: unknown): v is Node => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
export function plain(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (Array.isArray(v)) return v.map(plain).filter(Boolean).join(' ');
  if (record(v)) return Object.entries(v).filter(([k]) => !k.startsWith('@_')).map(([, v]) => plain(v)).filter(Boolean).join(' ');
  return '';
}
function chineseQuotes(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) { node.forEach(n => chineseQuotes(n, out)); return out; }
  if (!record(node)) return out;
  for (const citation of list(node.cit)) if (record(citation) && ['zh', 'zho', 'cmn', 'zh-Hans', 'zh-Hant'].includes(String(citation['@_xml:lang'])) && ['trans', 'translation'].includes(String(citation['@_type']))) {
    for (const q of list(citation.quote)) { const value = plain(q).replace(/\s+/g, ' ').trim(); if (value && /\p{Script=Han}/u.test(value)) out.push(value); }
  }
  // Sense nesting is common in actual WikDict TEI; never collect unrelated notes/definitions.
  for (const sense of list(node.sense)) chineseQuotes(sense, out);
  return out;
}
export function parseFreeDict(xml: string) {
  if (XMLValidator.validate(xml) !== true) throw Error('Invalid FreeDict XML');
  // fast-xml-parser does not load external DTDs; source archive stays build-only.
  const doc = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true }).parse(xml);
  const root = doc.TEI; if (!root?.teiHeader || !root?.text?.body) throw Error('Missing TEI structure');
  const header = root.teiHeader.fileDesc;
  const license = plain(header.publicationStmt?.availability);
  const refs = list(header.publicationStmt?.availability?.p).flatMap(p => record(p) ? list(p.ref) : []).filter(record);
  const licenseUrl = refs.map(r => r['@_target']).find(v => typeof v === 'string' && v.includes('creativecommons.org'));
  if (!license || !licenseUrl) throw Error('Cannot verify actual TEI license: inspect header manually');
  const entries: RawDictionaryEntry[] = [], skipped: unknown[] = [], warnings: unknown[] = [];
  const raw = list(root.text.body.entry);
  raw.forEach((entry, index) => {
    if (!record(entry)) { skipped.push({ index, reason: 'invalid-entry' }); return; }
    const forms = list(entry.form).filter(record), lemma = plain(forms[0]?.orth).normalize('NFC');
    const gram = list(entry.gramGrp).find(record), rawPos = plain(gram?.pos), mapped = mapPos(rawPos);
    const genderText = plain(gram?.gen).toLowerCase(), gender = ['m', 'masc', 'masculine'].includes(genderText) ? 'm' : ['f', 'fem', 'feminine'].includes(genderText) ? 'f' : undefined;
    const meaningsZh = [...new Set(chineseQuotes(entry))];
    if (!lemma || !meaningsZh.length || !/\p{L}/u.test(lemma)) { skipped.push({ index, lemma, reason: 'empty-lemma-or-Chinese-meaning' }); return; }
    if (!mapped.known) warnings.push({ index, lemma, rawPos, warning: 'unknown-pos' });
    entries.push({ lemma, normalizedLemma: normalizeFrench(lemma), searchKey: foldFrenchSearch(lemma), partOfSpeech: mapped.pos, gender, meaningsZh, source: 'freedict', sourceRef: `fra-zho:${String(entry['@_xml:id'] ?? index + 1)}`, properNoun: mapped.proper });
  });
  return { entries, skipped, warnings, rawHeadwords: raw.length, metadata: { version: plain(header.editionStmt?.edition), declaredExtent: plain(header.extent), license, licenseUrl: String(licenseUrl), publisher: plain(header.publicationStmt?.publisher), source: plain(header.sourceDesc), copyright: 'No separate copyright statement in TEI header; see publisher, source and availability.' } };
}
