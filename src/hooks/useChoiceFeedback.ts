import { useCallback, useState } from 'react';
/** Feedback is a presentation of an already committed answer, never a second score. */
export function useChoiceFeedback(answer: { token: string; selectedChoiceId?: string; answerRating?: string } | null) {
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const token = answer?.selectedChoiceId && revealedToken !== answer.token ? answer.token : null;
  const correct = answer?.answerRating === 'known';
  const reveal = useCallback(() => { if (token) setRevealedToken(token); }, [token]);
  return { visible: token !== null, correct, reveal };
}
