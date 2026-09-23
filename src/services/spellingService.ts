import type { Connection } from '../db/connection';
import { foldFrenchSearch } from '../utils/normalizeFrench';
import type { StudyReviewWord } from '../types/study';

export interface SpellingState {
  queue: string[];
  mastered: string[];
  status: 'typing' | 'wrong' | 'correct' | 'done';
  hadError: boolean;
  answer: string;
  turn: number;
}
export interface CompletionState { stage: 'choice' | 'spelling' | 'summary'; spelling: SpellingState | null }
/** The submitted error is displayed separately; the next native edit starts empty. */
export function spellingDraft(state: SpellingState | null | undefined): string {
  return state?.status === 'wrong' ? '' : state?.answer ?? '';
}
export function createSpelling(words: readonly StudyReviewWord[]): SpellingState {
  const queue = [...new Set(words.map(word => word.wordId))];
  return { queue, mastered: [], status: queue.length ? 'typing' : 'done', hadError: false, answer: '', turn: 0 };
}
export function checkSpelling(state: SpellingState, input: string, lemma: string): SpellingState {
  if (state.status === 'done' || state.status === 'correct' || !input.trim()) return state;
  if (foldFrenchSearch(input) !== foldFrenchSearch(lemma)) return { ...state, answer: input, hadError: true, status: 'wrong' };
  return { ...state, answer: lemma, status: 'correct',
    mastered: state.hadError ? state.mastered : [...new Set([...state.mastered, state.queue[0]])] };
}
export function nextSpelling(state: SpellingState): SpellingState {
  if (state.status !== 'correct') return state;
  const [word, ...queue] = state.queue;
  if (state.hadError) queue.splice(Math.min(3, queue.length), 0, word);
  return { ...state, queue, hadError: false, answer: '', status: queue.length ? 'typing' : 'done', turn: state.turn + 1 };
}

/** Align insertions/deletions instead of coloring every letter after a typo red. */
export function spellingCharacters(input: string, lemma: string): { text: string; wrong: boolean }[] {
  const original = Array.from(input.normalize('NFC'));
  const expanded: { char: string; original: number }[] = [];
  original.forEach((text, index) => {
    for (const char of (text === ' ' ? ' ' : foldFrenchSearch(text))) expanded.push({ char, original: index });
  });
  const a = expanded.map(item => item.char), b = Array.from(foldFrenchSearch(lemma));
  const costs = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) costs[i][0] = i;
  for (let j = 0; j <= b.length; j++) costs[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    costs[i][j] = Math.min(costs[i - 1][j] + 1, costs[i][j - 1] + 1, costs[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
  }
  const wrong = new Set<number>();
  let i = a.length, j = b.length;
  while (i || j) {
    if (i && j && costs[i][j] === costs[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1])) {
      if (a[i - 1] !== b[j - 1]) wrong.add(expanded[i - 1].original);
      i--; j--;
    } else if (i && costs[i][j] === costs[i - 1][j] + 1) { wrong.add(expanded[--i].original); }
    else { if (expanded.length) wrong.add(expanded[Math.min(i, expanded.length - 1)].original); j--; }
  }
  return original.map((text, index) => ({ text, wrong: wrong.has(index) }));
}
export async function loadCompletion(db: Connection, roundId: string): Promise<CompletionState> {
  await db.runAsync("INSERT OR IGNORE INTO study_completion (round_id, stage) VALUES (?, 'choice')", roundId);
  const row = await db.getFirstAsync<{ stage: CompletionState['stage']; spelling_json: string | null }>('SELECT stage, spelling_json FROM study_completion WHERE round_id = ?', roundId);
  if (!row) throw new Error('Study completion missing');
  return { stage: row.stage, spelling: row.spelling_json ? JSON.parse(row.spelling_json) as SpellingState : null };
}
export async function saveCompletion(db: Connection, roundId: string, value: CompletionState): Promise<void> {
  const result = await db.runAsync('UPDATE study_completion SET stage = ?, spelling_json = ? WHERE round_id = ?', value.stage, value.spelling ? JSON.stringify(value.spelling) : null, roundId);
  if (result.changes !== 1) throw new Error('Study completion missing');
}
