import type { StudyPhase, StudyQueueItem, StudyWord, UserRating } from '../types/study';
export function studyPhase(item: StudyQueueItem): StudyPhase {
  if (item.phase) return item.phase;
  if (item.attempt === 1) return 'new';
  return item.requiresConfirmation && !item.confirmationPending ? 'relearn' : 'choice';
}
export function isReinforcement(item: StudyQueueItem): boolean {
  return ['choice', 'meaning', 'recall'].includes(studyPhase(item));
}
export function createStudyQueue(words: StudyWord[]): StudyQueueItem[] {
  return words.map(word => ({ word, attempt: 1, phase: 'choice', stars: 0 }));
}
export function completesMastery(item: StudyQueueItem, rating: UserRating): boolean {
  return rating === 'known' && studyPhase(item) === 'recall';
}
export function starsAfterAnswer(item: StudyQueueItem, rating: UserRating): number {
  if (!isReinforcement(item) || rating !== 'known') return 0;
  return { choice: 1, meaning: 2, recall: 3, new: 0, relearn: 0 }[studyPhase(item)];
}
export function advanceStudyQueue(queue: readonly StudyQueueItem[], rating: UserRating): StudyQueueItem[] {
  const [current, ...remaining] = queue;
  if (!current) throw new Error('Study queue is empty');
  if (completesMastery(current, rating)) return remaining;
  const phase = studyPhase(current);
  const nextPhase: StudyPhase = rating !== 'known' ? 'choice' : phase === 'choice' ? 'meaning' : phase === 'meaning' ? 'recall' : 'choice';
  const gap = rating === 'uncertain' ? 5 : 3;
  let otherPresentations = 0;
  const eligiblePosition = remaining.findIndex(item => {
    if (item.word.wordId !== current.word.wordId) otherPresentations += 1;
    return otherPresentations >= gap;
  });
  // Repeated stages go to the tail so difficult words cannot starve new words.
  // Short tails (even zero other words) are allowed until all three stars fill.
  const useTail = eligiblePosition === -1 || current.attempt > 1 || rating === 'known';
  remaining.splice(useTail ? remaining.length : eligiblePosition + 1, 0, {
    word: current.word,
    attempt: current.attempt + 1,
    minGap: useTail ? remaining.filter(item => item.word.wordId !== current.word.wordId).length : gap,
    phase: nextPhase,
    stars: starsAfterAnswer(current, rating),
  });
  return remaining;
}
export function studyAttemptId(sessionId: string, item: StudyQueueItem): string {
  return JSON.stringify([sessionId, item.word.wordId, item.attempt]);
}
