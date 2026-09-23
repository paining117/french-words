import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { logError } from '../utils/logger';
export type Resource<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };
export function useResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<Resource<T>>({ status: 'loading' });
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const data = await load();
      if (id === request.current) setState({ status: 'ready', data });
    } catch (error) { logError(error); if (id === request.current) setState({ status: 'error' }); }
  }, [load]);
  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { request.current += 1; };
  }, [refresh]));
  return { state, refresh };
}
