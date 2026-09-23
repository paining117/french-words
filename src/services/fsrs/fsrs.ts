import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
import type { UserRating } from '../../types/study';
import { deserializeFsrsCard, serializeFsrsCard } from './serializeCard';

export type StudyFsrsRating = Rating.Good | Rating.Hard | Rating.Again;
const mapping: Record<UserRating, StudyFsrsRating> = {
  known: Rating.Good, uncertain: Rating.Hard, unknown: Rating.Again,
};
const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});
export function userRatingToFsrsRating(rating: UserRating): StudyFsrsRating {
  const mapped = mapping[rating];
  if (mapped === undefined) throw new Error('Invalid user rating');
  return mapped;
}
export function fsrsRatingToUserRating(rating: number): UserRating {
  const entry = (Object.entries(mapping) as [UserRating, StudyFsrsRating][]).find(([, value]) => value === rating);
  if (!entry) throw new Error('Invalid stored study rating');
  return entry[0];
}
export function createNewFsrsCard(now: Date): Card { return createEmptyCard(now); }
export function getRetrievability(card: Card, now: Date): number {
  const result = scheduler.get_retrievability(card, now, false);
  if (!Number.isFinite(result) || result < 0 || result > 1) throw new Error('Invalid retrievability');
  return result;
}
export function reviewFsrsCard(serialized: string | null, rating: UserRating, now: Date) {
  const card = serialized === null ? createNewFsrsCard(now) : deserializeFsrsCard(serialized);
  const grade = userRatingToFsrsRating(rating);
  const result = scheduler.next(card, now, grade);
  return {
    serializedCard: serializeFsrsCard(result.card),
    serializedLog: JSON.stringify(result.log),
    dueAt: result.card.due.toISOString(),
    lastReviewAt: result.card.last_review?.toISOString() ?? now.toISOString(),
    rating: grade,
  };
}
