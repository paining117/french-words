export function mapPos(value: string): { pos: string; proper: boolean; known: boolean } {
  const v = value.trim().toLowerCase();
  const aliases: Record<string, string> = { n: 'noun', nom: 'noun', noun: 'noun', pn: 'noun', nam: 'noun', 'nom:prop': 'noun', 'proper noun': 'noun', v: 'verb', verb: 'verb', adj: 'adjective', adjective: 'adjective', adv: 'adverb', adverb: 'adverb', pro: 'pronoun', pron: 'pronoun', pronoun: 'pronoun', prep: 'preposition', prp: 'preposition', preposition: 'preposition', conj: 'conjunction', kon: 'conjunction', conjunction: 'conjunction', det: 'determiner', art: 'determiner', determiner: 'determiner', int: 'interjection', intj: 'interjection', interj: 'interjection', interjection: 'interjection', num: 'numeral', numeral: 'numeral', other: 'other' };
  const base = v.split(':')[0];
  const pos = aliases[v] ?? aliases[base] ?? (base.startsWith('ver') ? 'verb' : 'other');
  return { pos, proper: ['pn', 'nam', 'nom:prop', 'proper noun'].includes(v), known: !!aliases[v] || !!aliases[base] || base.startsWith('ver') };
}
