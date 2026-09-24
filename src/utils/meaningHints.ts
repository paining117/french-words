import { foldFrenchSearch } from './normalizeFrench';

/** Compare senses without typography or parenthetical usage annotations. */
export function meaningKeys(value: string): string[] {
  return value.normalize('NFKC').replace(/\([^)]*\)/g, '').split(/[；;，,、/\n]/)
    .map(part => part.replace(/[\s。.!！?？]/g, '').toLowerCase()).filter(Boolean);
}

export function usageHint(word: { lemma: string; partOfSpeech?: string }): string | undefined {
  if (word.partOfSpeech !== 'interjection') return;
  // Usage distinctions: Larousse, entries bonjour and salut (interjection).
  switch (foldFrenchSearch(word.lemma)) {
    case 'bonjour': return '白天见面时的常用问候';
    case 'salut': return '熟人间的随意问候，也可用于告别';
  }
}

/** Use a distinguishing prefix if meaning alone permits another spelling. */
export function spellingHint(word: { lemma: string; partOfSpeech?: string }, alternatives: readonly { lemma: string; partOfSpeech?: string }[]): string | undefined {
  const note = usageHint(word), target = foldFrenchSearch(word.lemma);
  const peers = alternatives.filter(other => foldFrenchSearch(other.lemma) !== target);
  if (!peers.length || (note && peers.every(other => usageHint(other) && usageHint(other) !== note))) return note;
  const letters = Array.from(target).filter(char => /\p{L}/u.test(char));
  const rivals = peers.map(other => Array.from(foldFrenchSearch(other.lemma)).filter(char => /\p{L}/u.test(char)))
    .filter(chars => chars.length === letters.length);
  let length = 1;
  while (length < letters.length && rivals.some(chars => chars.slice(0, length).join('') === letters.slice(0, length).join(''))) length++;
  const prefix = letters.slice(0, length).join('');
  const clue = `${length === 1 ? '首字母' : '开头'} ${prefix} · ${letters.length} 个字母`;
  return [note, clue].filter(Boolean).join(' · ');
}
