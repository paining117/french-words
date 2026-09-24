export interface PronunciationVoice { identifier: string; language: string; quality: string }
export type PronunciationState = 'idle' | 'loading' | 'speaking' | 'unavailable' | 'error';
export interface PronunciationOptions {
  language: string; voice: string; rate: number; pitch: number;
  onStart: () => void; onDone: () => void; onStopped: () => void; onError: (error: Error) => void;
}
export interface SpeechEngine {
  getAvailableVoicesAsync: () => Promise<PronunciationVoice[]>;
  stop: () => Promise<void>;
  speak: (text: string, options: PronunciationOptions) => void;
}

export function selectFrenchVoice(voices: readonly PronunciationVoice[]): PronunciationVoice | undefined {
  const language = (voice: PronunciationVoice) => voice.language.replace(/_/g, '-').toLowerCase();
  const rank = (voice: PronunciationVoice) => Number(language(voice) === 'fr-fr') * 4
    + Number(/local|offline/i.test(voice.identifier)) * 2 + Number(voice.quality === 'Enhanced');
  return voices.filter(voice => /^fr(?:-|$)/.test(language(voice)) && !/network|online/i.test(voice.identifier))
    .sort((a, b) => rank(b) - rank(a) || a.identifier.localeCompare(b.identifier))[0];
}

/** One shared speaker; late callbacks and disappearing screens cannot revive an old word. */
export function createPronunciationPlayer(engine: SpeechEngine, reportError: (error: unknown) => void) {
  let generation = 0;
  let owner: object | null = null;
  let commands = Promise.resolve();
  const enqueue = (operation: () => Promise<void>) => {
    commands = commands.then(operation).catch(reportError);
    return commands;
  };
  return {
    play(requestOwner: object, lemma: string, onState: (state: PronunciationState) => void): Promise<void> {
      const text = lemma.trim().normalize('NFC');
      const token = ++generation;
      owner = requestOwner;
      const current = () => token === generation && owner === requestOwner;
      const update = (state: PronunciationState) => { if (current()) onState(state); };
      update('loading');
      return enqueue(async () => {
        if (!current()) return;
        try {
          await engine.stop();
          if (!current()) return;
          if (!text) { update('idle'); return; }
          const voice = selectFrenchVoice(await engine.getAvailableVoicesAsync());
          if (!current()) return;
          if (!voice) { update('unavailable'); return; }
          engine.speak(text, {
            language: voice.language.replace(/_/g, '-'), voice: voice.identifier, rate: 0.85, pitch: 1,
            onStart: () => update('speaking'), onDone: () => update('idle'), onStopped: () => update('idle'),
            onError: error => { if (current()) { reportError(error); update('error'); } },
          });
        } catch (error) { if (current()) { reportError(error); update('error'); } }
      });
    },
    stop(requestOwner: object): Promise<void> {
      if (owner !== requestOwner) return Promise.resolve();
      owner = null;
      const token = ++generation;
      return enqueue(async () => { if (token === generation) await engine.stop(); });
    },
  };
}
