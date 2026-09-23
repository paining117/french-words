export function partOfSpeechLabel(partOfSpeech?: string, gender?: 'm' | 'f'): string | undefined {
  if (!partOfSpeech) return undefined;
  if (partOfSpeech === 'noun') return gender ? `n.${gender}.` : 'n.';
  const labels: Record<string, string> = { verb: 'v.', adjective: 'adj.', adverb: 'adv.', interjection: 'interj.', numeral: 'num.', expression: '表达', preposition: 'prép.', pronoun: 'pron.', conjunction: 'conj.' };
  return partOfSpeech === 'phrase' ? '短语' : partOfSpeech === 'determiner' ? '限定词' : labels[partOfSpeech];
}

export function definiteArticle(partOfSpeech?: string, gender?: 'm' | 'f'): 'le' | 'la' | undefined {
  return partOfSpeech === 'noun' ? gender === 'm' ? 'le' : gender === 'f' ? 'la' : undefined : undefined;
}
/** The article is a gender label, separate from spelling (including elided nouns). */
export function wordWithArticle(word: { lemma: string; partOfSpeech?: string; gender?: 'm' | 'f' }): string {
  const article = definiteArticle(word.partOfSpeech, word.gender);
  return article ? `${article} · ${word.lemma}` : word.lemma;
}
