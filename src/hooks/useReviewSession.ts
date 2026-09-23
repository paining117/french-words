import { WordClassificationConflictError } from '../repositories/wordBookRepository';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { startReview, ReviewConflictError, type ReviewSession, type ReviewStartResult } from '../services/reviewService';
import type { ReviewSnapshot } from '../types/review';
import type { UserRating } from '../types/study';
import { createId } from '../utils/id';
import { logError } from '../utils/logger';

type ReviewViewState = ReviewSnapshot | { status: 'loading' } | { status: 'empty'; skipped: number } | { status: 'error'; message: string };
export function useReviewSession() {
  const db = useSQLiteContext();
  const [view, setView] = useState<ReviewViewState>({ status: 'loading' });
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const session = useRef<ReviewSession | null>(null);
  const initialization = useRef<Promise<ReviewStartResult> | null>(null);
  const mounted = useRef(false);
  const submitting = useRef(false);
  useEffect(() => {
    let current = true;
    mounted.current = true;
    initialization.current ??= startReview(db, { createId });
    void initialization.current.then(result => {
      if (!current) return;
      if (result.kind === 'empty') setView({ status: 'empty', skipped: result.skipped });
      else { session.current = result.session; setView(result.session.getSnapshot()); }
    }).catch(error => {
      logError(error);
      if (current) setView({ status: 'error', message: '复习内容加载失败' });
    });
    return () => { current = false; mounted.current = false; };
  }, [db, generation]);
  const retry = useCallback(() => {
    if (submitting.current) return;
    initialization.current = null; session.current = null;
    setFeedback(null); setView({ status: 'loading' }); setGeneration(value => value + 1);
  }, []);
  const act = useCallback(async (token: string, rating?: UserRating, choiceId?: string, familiar = false) => {
    const active = session.current;
    if (!active || submitting.current) return;
    submitting.current = true; setPending(true); setFeedback(null);
    try {
      const next = familiar ? await active.markFamiliar(token) : choiceId !== undefined ? await active.submitChoice(token, choiceId) : rating === undefined ? await active.continue(token) : await active.submitRating(token, rating);
      if (mounted.current) setView(next);
    } catch (error) {
      logError(error);
      if (mounted.current) {
        if (error instanceof ReviewConflictError) setView({ status: 'error', message: '复习进度已更新，请重新加载' });
        else setFeedback(error instanceof WordClassificationConflictError ? error.message : '保存失败，请重试');
      }
    } finally { submitting.current = false; if (mounted.current) setPending(false); }
  }, []);
  return { view, pending, feedback, retry, familiar: (token: string) => act(token, undefined, undefined, true), rate: (token: string, rating: UserRating) => act(token, rating), choose: (token: string, choiceId: string) => act(token, undefined, choiceId), next: (token: string) => act(token) };
}
