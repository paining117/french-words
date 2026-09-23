import { WordClassificationConflictError } from '../repositories/wordBookRepository';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { startStudy, resumeStudyCompletion, StudyConflictError, type StudySession, type StudySnapshot, type StudyStartResult } from '../services/studyService';
import type { StudyEmptyReason, UserRating } from '../types/study';
import { createId } from '../utils/id';
import { logError } from '../utils/logger';

export type StudyViewState = StudySnapshot | { status: 'loading' } | { status: 'empty'; reason: StudyEmptyReason } | { status: 'error'; message: string };
export function useStudySession() {
  const db = useSQLiteContext();
  const [view, setView] = useState<StudyViewState>({ status: 'loading' });
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const session = useRef<StudySession | null>(null);
  const initialization = useRef<Promise<StudyStartResult> | null>(null);
  const mounted = useRef(false);
  const submitting = useRef(false);

  useEffect(() => {
    let current = true;
    mounted.current = true;
    // Reuse an in-flight initialization under React's development effect replay.
    initialization.current ??= resumeStudyCompletion(db).then(saved => saved ?? startStudy(db, { createId }));
    void initialization.current.then(result => {
      if (!current) return;
      if (result.kind === 'empty') setView({ status: 'empty', reason: result.reason });
      else { session.current = result.session; setView(result.session.getSnapshot()); }
    }).catch(error => {
      logError(error);
      if (current) setView({ status: 'error', message: '学习内容加载失败' });
    });
    return () => { current = false; mounted.current = false; };
  }, [db, generation]);

  const retry = useCallback(() => {
    if (submitting.current) return;
    initialization.current = null; session.current = null;
    setFeedback(null); setView({ status: 'loading' }); setGeneration(value => value + 1);
  }, []);
  const act = useCallback(async (kind: 'rating' | 'choice' | 'continue' | 'familiar', token: string, rating?: UserRating, choiceId?: string) => {
    const active = session.current;
    if (!active || submitting.current) return;
    submitting.current = true;
    setPending(true); setFeedback(null);
    try {
      const next = kind === 'familiar' ? await active.markFamiliar(token) : kind === 'choice' && choiceId !== undefined ? await active.submitChoice(token, choiceId)
        : kind === 'rating' && rating !== undefined ? await active.submitRating(token, rating) : await active.continue(token);
      if (mounted.current) setView(next);
    } catch (error) {
      logError(error);
      if (mounted.current) {
        if (error instanceof StudyConflictError) setView({ status: 'error', message: '学习进度已更新，请重新加载' });
        else setFeedback(error instanceof WordClassificationConflictError ? error.message : '保存失败，请重试');
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  return { view, pending, feedback, retry, sessionId: session.current?.id, familiar: (token: string) => act('familiar', token), rate: (token: string, rating: UserRating) => act('rating', token, rating), choose: (token: string, choiceId: string) => act('choice', token, undefined, choiceId), next: (token: string) => act('continue', token) };
}
