export type SessionType = 'study' | 'review';
export type SessionViewState = 'loading' | 'prompt' | 'answer' | 'completed' | 'error';
export interface Session {
  id: string;
  type: SessionType;
  started_at: string;
  ended_at: string | null;
  total_count: number;
  good_count: number;
  hard_count: number;
  again_count: number;
}
