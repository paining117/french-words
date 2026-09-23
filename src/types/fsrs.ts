export type { Card, ReviewLog } from 'ts-fsrs';
export interface StoredCard {
  word_id: string;
  fsrs_card_json: string;
  due_at: string;
  last_review_at: string | null;
  first_learned_at: string | null;
  origin: 'study' | 'dictionary' | 'familiar';
  suspended: number;
  created_at: string;
}
