import test from 'node:test';
import assert from 'node:assert/strict';
import { createPronunciationPlayer, selectFrenchVoice, type PronunciationOptions, type PronunciationState, type PronunciationVoice, type SpeechEngine } from '../src/services/pronunciation';

const french: PronunciationVoice = { identifier: 'fr-fr-local', language: 'fr-FR', quality: 'Default' };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  const spoken: { text: string; options: PronunciationOptions }[] = [];
  const errors: unknown[] = [];
  let stops = 0;
  const engine: SpeechEngine = {
    getAvailableVoicesAsync: async () => [french],
    stop: async () => { stops++; },
    speak: (text, options) => { spoken.push({ text, options }); options.onStart(); },
  };
  const player = createPronunciationPlayer(engine, error => errors.push(error));
  return { engine, player, spoken, errors, stops: () => stops };
}

test('voice selection requires French, prefers France, and excludes explicitly network-only voices', () => {
  const voices = [
    { identifier: 'english', language: 'en-US', quality: 'Enhanced' },
    { identifier: 'fr-fr-network', language: 'fr-FR', quality: 'Enhanced' },
    { identifier: 'canada-local', language: 'fr-CA', quality: 'Enhanced' },
    { ...french, language: 'fr_FR' },
  ];
  assert.equal(selectFrenchVoice(voices)?.identifier, french.identifier);
  assert.equal(selectFrenchVoice(voices.slice(0, 3))?.identifier, 'canada-local');
  assert.equal(selectFrenchVoice(voices.slice(0, 2)), undefined);
});

test('speech preserves accents and ligatures, supplies the French voice, and resets after completion', async () => {
  const f = fixture(), states: PronunciationState[] = [];
  await f.player.play({}, '  sœur e\u0301cole  ', state => states.push(state));
  assert.equal(f.spoken[0].text, 'sœur école');
  assert.equal(f.spoken[0].options.language, 'fr-FR');
  assert.equal(f.spoken[0].options.voice, french.identifier);
  assert.equal(f.stops(), 1);
  f.spoken[0].options.onDone();
  assert.deepEqual(states, ['loading', 'speaking', 'idle']);
});

test('leaving while voices load prevents late speech or callbacks', async () => {
  const f = fixture(), owner = {}, states: PronunciationState[] = [];
  let resolveVoices!: (voices: PronunciationVoice[]) => void;
  f.engine.getAvailableVoicesAsync = () => new Promise(resolve => { resolveVoices = resolve; });
  const playing = f.player.play(owner, 'bonjour', state => states.push(state));
  await tick();
  const stopping = f.player.stop(owner);
  resolveVoices([french]);
  await Promise.all([playing, stopping]);
  assert.equal(f.spoken.length, 0);
  assert.deepEqual(states, ['loading']);
});

test('rapid replay never queues multiple pronunciations and ignores callbacks from the old word', async () => {
  const f = fixture(), owner = {}, states: PronunciationState[] = [];
  await f.player.play(owner, 'bonjour', state => states.push(state));
  const old = f.spoken[0].options;
  await Promise.all([
    f.player.play(owner, 'salut', state => states.push(state)),
    f.player.play(owner, 'école', state => states.push(state)),
  ]);
  assert.deepEqual(f.spoken.map(item => item.text), ['bonjour', 'école']);
  const snapshot = [...states];
  old.onDone(); old.onError(new Error('late error')); old.onStopped();
  assert.deepEqual(states, snapshot);
  assert.equal(f.errors.length, 0);
});

test('cleanup of a covered screen cannot stop the new detail screen', async () => {
  const f = fixture(), previous = {}, current = {};
  await f.player.play(previous, 'bonjour', () => {});
  await f.player.play(current, 'salut', () => {});
  const count = f.stops();
  await f.player.stop(previous);
  assert.equal(f.stops(), count);
  await f.player.stop(current);
  assert.equal(f.stops(), count + 1);
});

test('a slow stop completes before the replacement word begins', async () => {
  const f = fixture(), owner = {};
  let finishStop!: () => void;
  f.engine.stop = () => new Promise(resolve => { finishStop = resolve; });
  const first = f.player.play(owner, 'bonjour', () => {});
  await tick();
  const second = f.player.play(owner, 'salut', () => {});
  assert.equal(f.spoken.length, 0);
  finishStop(); await tick();
  assert.equal(f.spoken.length, 0);
  finishStop(); await Promise.all([first, second]);
  assert.deepEqual(f.spoken.map(item => item.text), ['salut']);
});

test('missing French voice never falls back to English and retry can discover a newly installed voice', async () => {
  const f = fixture(), owner = {}, states: PronunciationState[] = [];
  f.engine.getAvailableVoicesAsync = async () => [];
  await f.player.play(owner, 'bonjour', state => states.push(state));
  assert.equal(f.spoken.length, 0);
  assert.equal(states.at(-1), 'unavailable');
  f.engine.getAvailableVoicesAsync = async () => [french];
  await f.player.play(owner, 'bonjour', state => states.push(state));
  assert.equal(states.at(-1), 'speaking');
});

test('engine failure reports an error without blocking future replay', async () => {
  const f = fixture(), owner = {}, states: PronunciationState[] = [];
  f.engine.getAvailableVoicesAsync = async () => { throw new Error('engine unavailable'); };
  await f.player.play(owner, 'bonjour', state => states.push(state));
  assert.equal(states.at(-1), 'error');
  assert.equal(f.errors.length, 1);
  f.engine.getAvailableVoicesAsync = async () => [french];
  await f.player.play(owner, 'bonjour', state => states.push(state));
  f.spoken[0].options.onError(new Error('playback failed'));
  assert.equal(states.at(-1), 'error');
  await f.player.play(owner, 'bonjour', state => states.push(state));
  assert.equal(states.at(-1), 'speaking');
});
