import type { DictionaryEntry, Direction } from '../../types/dictionary';
import { logError } from '../../utils/logger';

export type SuggestionState = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; entries: DictionaryEntry[] };

/** Debounce input and discard results from obsolete requests, including errors. */
export function createSuggestionSearch(
  load: (query: string, direction: Direction) => Promise<DictionaryEntry[]>,
  publish: (state: SuggestionState) => void,
  delayMs = 250,
) {
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { generation++; clearTimeout(timer); timer = undefined; };
  const run = async (query: string, direction: Direction) => {
    cancel();
    const id = generation;
    if (!query.trim()) { publish({ status: 'idle' }); return; }
    publish({ status: 'loading' });
    try {
      const entries = await load(query, direction);
      if (id === generation) { publish({ status: 'ready', entries }); return entries; }
    } catch (error) {
      logError(error);
      if (id === generation) publish({ status: 'error' });
    }
  };
  return {
    cancel, run,
    schedule: (query: string, direction: Direction) => {
      cancel();
      if (!query.trim()) { publish({ status: 'idle' }); return; }
      publish({ status: 'loading' });
      timer = setTimeout(() => { void run(query, direction); }, delayMs);
    },
  };
}
