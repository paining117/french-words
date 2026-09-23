import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

export const CHOICE_FEEDBACK_DELAY = 700;
/** Feedback is a presentation of an already committed answer, never a second score. */
export function useChoiceFeedback(answer: { token: string; selectedChoiceId?: string; answerRating?: string } | null) {
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const token = answer?.selectedChoiceId && revealedToken !== answer.token ? answer.token : null;
  const correct = answer?.answerRating === 'known';
  const reveal = useCallback(() => { if (token) setRevealedToken(token); }, [token]);
  useFocusEffect(useCallback(() => {
    if (!token || !correct) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { if (timer !== undefined) clearTimeout(timer); };
    const schedule = () => { clear(); timer = setTimeout(reveal, CHOICE_FEEDBACK_DELAY); };
    if (AppState.currentState === 'active') schedule();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') schedule(); else clear(); });
    return () => { clear(); listener.remove(); };
  }, [token, correct, reveal]));
  return { visible: token !== null, correct, reveal };
}
