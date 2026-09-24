import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { createPronunciationPlayer, type PronunciationState } from '../services/pronunciation';
import { logError } from '../utils/logger';

const speaker = createPronunciationPlayer(Speech, logError);

export function usePronunciation(lemma: string) {
  const [state, setState] = useState<PronunciationState>('idle');
  const owner = useRef<object>({});
  const focused = useRef(false);
  const play = useCallback(() => {
    if (focused.current && AppState.currentState === 'active') void speaker.play(owner.current, lemma, setState);
  }, [lemma]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    let started = false;
    const autoPlay = () => { if (!started && AppState.currentState === 'active') { started = true; play(); } };
    autoPlay();
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active') autoPlay();
      else { void speaker.stop(owner.current); setState('idle'); }
    });
    return () => { focused.current = false; listener.remove(); void speaker.stop(owner.current); };
  }, [play]));
  return { state, play };
}
