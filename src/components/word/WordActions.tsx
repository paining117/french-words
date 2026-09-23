import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSQLiteContext } from 'expo-sqlite';
import { addVocabularyWord, getWordClassification, WordClassificationConflictError, type WordClassification } from '../../repositories/wordBookRepository';
import { colors } from '../../theme/colors';
import { logError } from '../../utils/logger';

interface WordActionProps {
  wordId: string; familiar?: boolean; disabled: boolean; onFamiliar: () => void; onBusyChange: (busy: boolean) => void;
}

/** Keep actions on the navigation bar, independent of the progress/stars row. */
export function WordActionHeader({ wordId, ...props }: Omit<WordActionProps, 'wordId'> & { wordId?: string }) {
  const [message, setMessage] = useState('');
  const headerHeight = useHeaderHeight();
  useEffect(() => { setMessage(''); }, [wordId]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 1800);
    return () => clearTimeout(timer);
  }, [message]);
  const buttons = wordId ? <WordActions key={wordId} {...props} wordId={wordId} onMessage={setMessage} /> : null;
  return <>
    <Stack.Screen options={{
      headerRight: () => buttons,
      // Match the unobtrusive back button on iOS 26: no glass capsule.
      unstable_headerRightItems: () => buttons ? [{ type: 'custom', element: buttons, hidesSharedBackground: true }] : [],
    }} />
    {message !== '' && <View pointerEvents="none" style={[styles.toast, { top: headerHeight + 4 }]}><Text accessibilityLiveRegion="polite" style={styles.toastText}>{message}</Text></View>}
  </>;
}

function WordActions({ wordId, familiar, disabled, onFamiliar, onBusyChange, onMessage }: WordActionProps & { onMessage: (message: string) => void }) {
  const db = useSQLiteContext();
  const [classification, setClassification] = useState<WordClassification>(null);
  const [ready, setReady] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  useFocusEffect(useCallback(() => {
    let current = true;
    mounted.current = true;
    setReady(false);
    void getWordClassification(db, wordId).then(value => {
      if (current) { setClassification(value); setReady(true); }
    }).catch(logError);
    return () => { current = false; mounted.current = false; };
  }, [db, wordId]));
  const added = classification === 'vocabulary';
  const markedFamiliar = !!familiar || classification === 'familiar';
  const vocabularyDisabled = disabled || !ready || markedFamiliar;
  const familiarDisabled = disabled || !ready || added || !!familiar;
  const add = async () => {
    if (vocabularyDisabled || saving.current) return;
    saving.current = true; onBusyChange(true);
    try {
      await addVocabularyWord(db, wordId);
      if (mounted.current) { setClassification('vocabulary'); onMessage('已加入生词本'); }
    } catch (error) { logError(error); if (mounted.current) onMessage(error instanceof WordClassificationConflictError ? error.message : '加入失败，请重试'); }
    finally { saving.current = false; onBusyChange(false); }
  };
  return <View style={styles.wrap}>
    <Pressable accessibilityRole="button" accessibilityLabel="加入生词本" accessibilityHint={markedFamiliar ? '需先在熟词本中撤回标熟' : undefined} accessibilityState={{ selected: added, disabled: vocabularyDisabled }} disabled={vocabularyDisabled} onPress={() => void add()} style={styles.button}><Text style={[styles.label, vocabularyDisabled && !added && styles.disabled, added && styles.selected]}>生</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="标为熟词，30天后复习" accessibilityHint={added ? '需先在生词本中撤回标生' : undefined} accessibilityState={{ selected: markedFamiliar, disabled: familiarDisabled }} disabled={familiarDisabled} onPress={() => { if (!familiarDisabled && !saving.current) onFamiliar(); }} style={styles.button}><Text style={[styles.label, familiarDisabled && !markedFamiliar && styles.disabled, markedFamiliar && styles.selected]}>熟</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: colors.secondary }, selected: { color: '#228052', fontWeight: '700' },
  disabled: { opacity: 0.35 },
  toast: { position: 'absolute', right: 20, minWidth: 145, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#294D3F', zIndex: 20, elevation: 4 },
  toastText: { color: '#fff', fontSize: 14, textAlign: 'center' },
});
