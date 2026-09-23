import type { Connection } from '../db/connection';
import type { MeaningChoice, StudyWord } from '../types/study';
import { wordWithArticle } from '../utils/wordLabel';

type MeaningCandidate = { id: string; lemma: string; part_of_speech: string | null; gender: 'm' | 'f' | null; meaning_zh: string };
const parts = (value: string) => value.split(/[；;，,、/（）()]/).map(part => part.trim()).filter(Boolean);
const shuffle = <T>(values: readonly T[]): T[] => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};

export async function prepareMeaningChoices(db: Connection, words: readonly StudyWord[]): Promise<StudyWord[]> {
  const candidates = await db.getAllAsync<MeaningCandidate>(`SELECT w.id, w.lemma, w.part_of_speech, w.gender, m.meaning_zh FROM words w
    JOIN meanings m ON m.word_id = w.id ORDER BY w.id, m.order_index`);
  return words.map(word => {
    if (word.meaningChoices?.length === 4) return { ...word, meaningChoices: word.meaningChoices.map(choice => {
      const candidate = candidates.find(candidate => candidate.id === choice.id);
      const lemma = choice.lemma ?? (choice.id === word.wordId ? word.lemma : candidate?.lemma);
      const frenchLabel = choice.id === word.wordId ? wordWithArticle(word) : candidate ? wordWithArticle({ lemma: candidate.lemma, partOfSpeech: candidate.part_of_speech ?? undefined, gender: candidate.gender ?? undefined }) : lemma;
      return { ...choice, lemma, frenchLabel };
    }) };
    const correct = word.meaningsZh[0]?.trim();
    if (!correct) throw new Error('Missing Chinese meaning');
    const used = new Set(word.meaningsZh.flatMap(parts));
    const ids = new Set([word.wordId]);
    const choices: MeaningChoice[] = [{ id: word.wordId, meaning: correct, lemma: word.lemma, frenchLabel: wordWithArticle(word) }];
    const pool = shuffle(candidates).sort((a, b) => Number(b.part_of_speech === word.partOfSpeech) - Number(a.part_of_speech === word.partOfSpeech));
    for (const candidate of pool) {
      const meaning = candidate.meaning_zh.trim(), pieces = parts(meaning);
      if (ids.has(candidate.id) || !meaning || pieces.some(piece => used.has(piece))) continue;
      choices.push({ id: candidate.id, meaning, lemma: candidate.lemma, frenchLabel: wordWithArticle({ lemma: candidate.lemma, partOfSpeech: candidate.part_of_speech ?? undefined, gender: candidate.gender ?? undefined }) }); ids.add(candidate.id); pieces.forEach(piece => used.add(piece));
      if (choices.length === 4) break;
    }
    if (choices.length !== 4) throw new Error('Not enough distinct meanings for reinforcement');
    return { ...word, meaningChoices: shuffle(choices) };
  });
}
