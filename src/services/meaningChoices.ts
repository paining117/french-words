import type { Connection } from '../db/connection';
import type { MeaningChoice, StudyWord } from '../types/study';
import { wordWithArticle } from '../utils/wordLabel';
import { meaningKeys } from '../utils/meaningHints';
import { getLearningMeanings } from './learningMeanings';

const shuffle = <T>(values: readonly T[]): T[] => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};

export async function prepareMeaningChoices(db: Connection, words: readonly StudyWord[], preserveAnswered = false): Promise<StudyWord[]> {
  const candidates = await getLearningMeanings(db);
  const byId = new Map(candidates.map(word => [word.wordId, word]));
  const keysById = new Map(candidates.map(word => [word.wordId, word.meaningsZh.flatMap(meaningKeys)]));
  return words.map(word => {
    const targetKeys = [...word.meaningsZh.flatMap(meaningKeys), ...(keysById.get(word.wordId) ?? [])];
    const saved = word.meaningChoices;
    const used = new Set(targetKeys);
    const valid = saved?.length === 4 && new Set(saved.map(choice => choice.id)).size === 4
      && saved.filter(choice => choice.id === word.wordId).length === 1
      && saved.filter(choice => choice.id !== word.wordId).every(choice => {
        const keys = [...meaningKeys(choice.meaning), ...(keysById.get(choice.id) ?? [])];
        if (!byId.has(choice.id) || !keys.length || keys.some(key => used.has(key))) return false;
        keys.forEach(key => used.add(key)); return true;
      });
    if (saved?.length === 4 && (valid || preserveAnswered)) return { ...word, meaningChoicesVersion: 1, meaningChoices: saved.map(choice => {
      const candidate = choice.id === word.wordId ? word : byId.get(choice.id);
      return { ...choice, lemma: choice.lemma ?? candidate?.lemma, frenchLabel: candidate ? wordWithArticle(candidate) : choice.frenchLabel ?? choice.lemma };
    }) };
    const correct = word.meaningsZh[0]?.trim();
    if (!correct) throw new Error('Missing Chinese meaning');
    used.clear(); targetKeys.forEach(key => used.add(key));
    const choices: MeaningChoice[] = [{ id: word.wordId, meaning: correct, lemma: word.lemma, frenchLabel: wordWithArticle(word) }];
    const pool = shuffle(candidates).sort((a, b) => Number(b.partOfSpeech === word.partOfSpeech) - Number(a.partOfSpeech === word.partOfSpeech));
    for (const candidate of pool) {
      const meaning = candidate.meaningsZh[0]?.trim(), keys = keysById.get(candidate.wordId)!;
      if (candidate.wordId === word.wordId || !meaning || !keys.length || keys.some(key => used.has(key))) continue;
      choices.push({ id: candidate.wordId, meaning, lemma: candidate.lemma, frenchLabel: wordWithArticle(candidate) });
      keys.forEach(key => used.add(key));
      if (choices.length === 4) break;
    }
    if (choices.length !== 4) throw new Error('Not enough distinct meanings for reinforcement');
    return { ...word, meaningChoicesVersion: 1, meaningChoices: shuffle(choices) };
  });
}
