import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** Show the saved word's details before moving on. Pause while the app is hidden. */
export function useFamiliarAdvance(token: string | null, next: (token: string) => Promise<void>) {
  const latest = useRef(next);
  latest.current = next;
  useFocusEffect(useCallback(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { if (timer) clearTimeout(timer); };
    const schedule = () => { clear(); timer = setTimeout(() => void latest.current(token), 1500); };
    if (AppState.currentState === 'active') schedule();
    const listener = AppState.addEventListener('change', state => state === 'active' ? schedule() : clear());
    return () => { clear(); listener.remove(); };
  }, [token]));
}
