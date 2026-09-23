import type { StoredCard } from './fsrs';
import type { StudyQueueItem, StudyReviewWord, StudySummary, UserRating } from './study';

export interface ReviewQueueItem extends StudyQueueItem {
  card: StoredCard;
  retrievability: number | null;
}
export type ReviewSnapshot =
  | { status: 'prompt' | 'answer'; familiar?: boolean; token: string; item: ReviewQueueItem; total: number; reviewedCount: number; summary: StudySummary; answerRating?: UserRating; selectedChoiceId?: string }
  | { status: 'completed'; total: number; reviewedCount: number; summary: StudySummary; words: StudyReviewWord[]; reviewedToday: number };
