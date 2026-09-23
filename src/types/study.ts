import type { DictionaryEntry } from './dictionary';

export type UserRating = 'known' | 'uncertain' | 'unknown';
export const USER_RATINGS: ReadonlyArray<{ value: UserRating; label: string }> = [
  { value: 'known', label: '认识' },
  { value: 'uncertain', label: '模糊' },
  { value: 'unknown', label: '不认识' },
];
export interface MeaningChoice { id: string; meaning: string; lemma?: string; frenchLabel?: string }
export type StudyWord = DictionaryEntry & { wordId: string; meaningChoices?: MeaningChoice[] };
export type StudyPhase = 'new' | 'relearn' | 'choice' | 'meaning' | 'recall';
export interface StudySummary {
  total_count: number;
  good_count: number;
  hard_count: number;
  again_count: number;
}
export interface StudyQueueItem {
  word: StudyWord;
  attempt: number;
  minGap?: number;
  phase?: StudyPhase;
  stars?: number;
  /** Legacy fields are read only when upgrading a saved pre-three-star round. */
  requiresConfirmation?: boolean;
  confirmationPending?: boolean;
}
export type StudyEmptyReason = 'quota-complete' | 'book-complete';

export interface StudyReviewWord { wordId: string; lemma: string; partOfSpeech?: string; gender?: 'm' | 'f'; meaning: string; dueAt: string; suspended: boolean }
export interface ActiveStudySnapshot {
  familiar?: boolean;
  token: string;
  item: StudyQueueItem;
  total: number;
  masteredCount: number;
  summary: StudySummary;
  roundDate: string;
  answerRating?: UserRating;
  selectedChoiceId?: string;
}
export type StudySnapshot =
  | (ActiveStudySnapshot & { status: 'prompt' | 'answer' })
  | { status: 'completed'; summary: StudySummary; masteredCount: number; learnedToday: number; roundDate: string; words: StudyReviewWord[] };
export interface DailyStudyRound {
  bookId?: string;
  reinforcementVersion?: 2 | 3;
  sessionId: string;
  date: string;
  words: StudyWord[];
  queue: StudyQueueItem[];
  masteredIds: string[];
  baseSummary: StudySummary;
  snapshot: StudySnapshot;
}
