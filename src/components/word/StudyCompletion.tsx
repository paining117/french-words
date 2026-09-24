import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, InputAccessoryView, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useHeaderHeight, usePreventRemove } from 'expo-router/react-navigation';
import { useSQLiteContext } from 'expo-sqlite';
import { LearningScreen } from '../common/LearningScreen';
import { AppButton } from '../common/AppButton';
import { StudySummary } from './StudySummary';
import { checkSpelling, createSpelling, loadCompletion, loadSpellingHints, nextSpelling, saveCompletion, spellingCharacters, spellingDraft, type CompletionState } from '../../services/spellingService';
import type { StudySnapshot } from '../../types/study';
import { colors } from '../../theme/colors';
import { logError } from '../../utils/logger';

export function StudyCompletion({ roundId, result, onContinue }: {
  roundId: string; result: Extract<StudySnapshot, { status: 'completed' }>; onContinue: () => void;
}) {
  const db = useSQLiteContext();
  const headerHeight = useHeaderHeight();
  const [state, setState] = useState<CompletionState | null>(null);
  const [hints, setHints] = useState<Record<string, string | undefined>>({});
  const [input, setInput] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const saving = useRef(false), alive = useRef(true);
  const textInput = useRef<TextInput>(null);
  const spelling = state?.spelling;
  const word = result.words.find(item => item.wordId === spelling?.queue[0]);
  const spellingActive = state?.stage === 'spelling' && !!word;
  const correct = spelling?.status === 'correct';
  const wrong = spelling?.status === 'wrong' && !retrying;
  const load = useCallback(async () => {
    const [value, clues] = await Promise.all([loadCompletion(db, roundId), loadSpellingHints(db, result.words)]);
    if (alive.current) { setHints(clues); setState(value); setInput(spellingDraft(value.spelling)); setRetrying(false); }
  }, [db, roundId, result.words]);
  useEffect(() => {
    alive.current = true;
    void load().catch(reason => { logError(reason); if (alive.current) setError('加载失败，请重试'); });
    return () => { alive.current = false; };
  }, [load]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const save = async (value: CompletionState) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      await saveCompletion(db, roundId, value);
      if (alive.current) { setState(value); setInput(spellingDraft(value.spelling)); setRetrying(false); }
      if (value.stage === 'summary') Keyboard.dismiss();
    } catch (reason) { logError(reason); if (alive.current) setError('保存失败，请重试'); }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  const exit = () => {
    if (saving.current) return;
    Alert.alert('确定要退出拼写吗', undefined, [{ text: '否', style: 'cancel' }, { text: '是', onPress: () => void save({ stage: 'summary', spelling: spelling ?? null }) }]);
  };
  // Covers the navigation back button, the system gesture and Android back.
  usePreventRemove(!!spellingActive, exit);
  const submit = () => {
    if (!spelling || !word || busy) return;
    const next = correct ? nextSpelling(spelling) : checkSpelling(spelling, input, word.lemma);
    if (next === spelling) return;
    void save({ stage: next.status === 'done' ? 'summary' : 'spelling', spelling: next });
  };
  const toolbar = <View style={styles.toolbar}>
    <Pressable accessibilityRole="button" accessibilityLabel="退出拼写" disabled={busy} onPress={exit} style={({ pressed }) => [styles.tool, pressed && styles.toolPressed, busy && styles.toolDisabled]}><SpellingActionIcon kind="close" /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={correct ? '下一个单词' : '检查拼写'} disabled={busy || (!correct && !input.trim())} onPress={submit} style={({ pressed }) => [styles.tool, pressed && styles.toolPressed, (busy || (!correct && !input.trim())) && styles.toolDisabled]}><SpellingActionIcon kind={correct ? 'next' : 'check'} highlighted={correct} /></Pressable>
  </View>;
  if (!state) return <LearningScreen><View style={styles.center}>{error ? <AppButton title="重试" onPress={() => { setError(''); void load().catch(reason => { logError(reason); setError('加载失败，请重试'); }); }} /> : <ActivityIndicator />}</View></LearningScreen>;
  if (state.stage === 'summary') return <LearningScreen><StudySummary result={result} /><View style={styles.footer}><AppButton title="继续学习" onPress={onContinue} /><AppButton title="返回首页" onPress={() => router.dismissTo('/')} /></View></LearningScreen>;
  if (state.stage === 'choice') return <LearningScreen><View style={[styles.center, styles.choices]}><AppButton title="总结" disabled={busy} onPress={() => void save({ stage: 'summary', spelling: null })} /><AppButton title="开始拼写" disabled={busy} onPress={() => void save({ stage: 'spelling', spelling: createSpelling(result.words) })} />{error !== '' && <Text style={styles.error}>{error}</Text>}</View></LearningScreen>;
  if (!word || !spelling) return <LearningScreen><View style={styles.center}><AppButton title="总结" onPress={() => void save({ stage: 'summary', spelling: spelling ?? null })} /></View></LearningScreen>;
  return <LearningScreen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
    <Text style={styles.progress}>{spelling.mastered.length} / {result.words.length}</Text>
    <View style={styles.center}>
      <View style={styles.inputBox}>
        <TextInput ref={textInput} autoFocus inputAccessoryViewID="spelling-tools" value={input} maxLength={160}
          accessibilityLabel="输入法语单词" style={[styles.input, correct && styles.green, wrong && { color: 'transparent' }]}
          selectionColor={wrong ? 'transparent' : colors.forest} autoCapitalize="none" autoCorrect={false} spellCheck={false}
          autoComplete="off" textContentType="none" smartInsertDelete={false} underlineColorAndroid="transparent"
          keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'visible-password'} returnKeyType={correct ? 'next' : 'done'} submitBehavior="submit" onSubmitEditing={submit}
          onKeyPress={event => { if (wrong && event.nativeEvent.key === 'Backspace') { setRetrying(true); setInput(''); } }}
          onChangeText={value => {
            if (correct || busy) return;
            setRetrying(true); setInput(value);
          }} />
        {wrong && <Text pointerEvents="none" style={[styles.input, styles.errorOverlay]}>{spellingCharacters(spelling.answer, word.lemma).map((part, index) => <Text key={index} style={part.wrong ? styles.error : undefined}>{part.text}</Text>)}</Text>}
      </View>
      {spelling.hadError && !correct && <Text style={[styles.correctAnswer, styles.green]}>{word.lemma}</Text>}
      <Text style={styles.meaning}>{word.meaning}</Text>
      {!!hints[word.wordId] && <Text style={styles.hint}>{hints[word.wordId]}</Text>}
      {error !== '' && <Text style={styles.error}>{error}</Text>}
    </View>
    {(Platform.OS !== 'ios' || !keyboardOpen) && toolbar}
  </KeyboardAvoidingView>
    {Platform.OS === 'ios' && <InputAccessoryView nativeID="spelling-tools" backgroundColor="transparent">{toolbar}</InputAccessoryView>}
  </LearningScreen>;
}
function SpellingActionIcon({ kind, highlighted = false }: { kind: 'close' | 'check' | 'next'; highlighted?: boolean }) {
  const stroke = { position: 'absolute' as const, height: 2.4, borderRadius: 2, backgroundColor: highlighted ? '#228052' : colors.text };
  return <View accessible={false} style={{ width: 24, height: 24 }}>
    {kind === 'close' ? <>
      <View style={[stroke, { width: 24, left: 0, top: 11, transform: [{ rotate: '45deg' }] }]} />
      <View style={[stroke, { width: 24, left: 0, top: 11, transform: [{ rotate: '-45deg' }] }]} />
    </> : kind === 'check' ? <>
      <View style={[stroke, { width: 10, left: 1, top: 14, transform: [{ rotate: '45deg' }] }]} />
      <View style={[stroke, { width: 20, left: 6, top: 10, transform: [{ rotate: '-50deg' }] }]} />
    </> : <>
      <View style={[stroke, { width: 22, left: 0, top: 11 }]} />
      <View style={[stroke, { width: 11, left: 13, top: 7, transform: [{ rotate: '45deg' }] }]} />
      <View style={[stroke, { width: 11, left: 13, top: 15, transform: [{ rotate: '-45deg' }] }]} />
    </>}
  </View>;
}
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 20 },
  choices: { alignItems: 'stretch', paddingHorizontal: 60 }, footer: { padding: 20, gap: 12 },
  meaning: { fontSize: 16, lineHeight: 24, color: colors.text, textAlign: 'center', maxHeight: 120 },
  hint: { fontSize: 14, lineHeight: 22, color: colors.secondary, textAlign: 'center' },
  progress: { fontSize: 15, color: colors.secondary, paddingHorizontal: 28, paddingTop: 18 },
  inputBox: { width: '100%', minHeight: 64 },
  input: { padding: 10, fontSize: 32, lineHeight: 44, textAlign: 'center', color: colors.text },
  errorOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  correctAnswer: { fontSize: 24, textAlign: 'center' }, green: { color: '#228052' }, error: { color: '#BC3535' },
  toolbar: { minHeight: 76, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  tool: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.42)', alignItems: 'center', justifyContent: 'center' },
  toolPressed: { backgroundColor: 'rgba(255,255,255,0.7)', transform: [{ scale: 0.95 }] }, toolDisabled: { opacity: 0.45 },
});
