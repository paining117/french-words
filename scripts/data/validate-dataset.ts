import type { DatasetBook, DatasetWord } from '../../src/types/dataset';
import { foldFrenchSearch, normalizeFrench } from '../../src/utils/normalizeFrench';
export function validateDataset(words: DatasetWord[], books: DatasetBook[]): void {
  const ids = new Map<string, DatasetWord>();
  for (const w of words) {
    if (!w.id || ids.has(w.id)) throw Error('Duplicate or missing stable ID'); ids.set(w.id, w);
    if (!w.lemma.trim() || w.normalizedLemma !== normalizeFrench(w.lemma) || w.searchKey !== foldFrenchSearch(w.lemma)) throw Error('Invalid lemma / normalization');
    if (!w.meaningsZh.length || w.meaningsZh.some(v => !v.trim() || !/\p{Script=Han}/u.test(v))) throw Error('Empty Chinese meanings');
    if (w.gender !== undefined && w.gender !== 'm' && w.gender !== 'f') throw Error('Invalid gender');
    if (w.cefrLevel !== undefined && !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(w.cefrLevel)) throw Error('Invalid CEFR');
    if (w.examples.length > 1 || w.examples.some(e => !e.french.trim() || !e.chinese.trim() || !e.sourceRef)) throw Error('Invalid example');
  }
  const bookIds = new Set<string>(), membership = new Set<string>();
  for (const book of books) {
    if (bookIds.has(book.id) || !['A1', 'A2', 'B1', 'B2'].includes(book.level)) throw Error('Invalid book'); bookIds.add(book.id);
    for (const id of book.wordIds) {
      const word = ids.get(id); if (!word || word.cefrLevel !== book.level || word.properNoun) throw Error('Invalid book relation');
      if (membership.has(id)) throw Error('Duplicate book-word relation / cumulative levels'); membership.add(id);
    }
  }
}
