import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getDictionaryEntry } from '../../src/repositories/wordRepository';
import { addVocabularyWord, getWordClassification, removeVocabularyWord, WordClassificationConflictError, type WordClassification } from '../../src/repositories/wordBookRepository';
import { useResource } from '../../src/hooks/useResource';
import { Screen, PageTitle, commonStyles } from '../../src/components/common/Screen';
import { LoadState } from '../../src/components/common/LoadState';
import { AppButton } from '../../src/components/common/AppButton';
import { colors } from '../../src/theme/colors';
import { NounArticle } from '../../src/components/word/NounArticle';
import { partOfSpeechLabel } from '../../src/utils/wordLabel';
import { logError } from '../../src/utils/logger';
export default function WordScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const db = useSQLiteContext();
  const [membership, setMembership] = useState<{ id: string; classification: WordClassification } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const { state, refresh } = useResource(useCallback(async () => {
    const [word, classification] = await Promise.all([getDictionaryEntry(db, id), getWordClassification(db, id)]);
    setMembership({ id, classification });
    return word;
  }, [db, id]));
  const changeMembership = async (add: boolean) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      if (add) await addVocabularyWord(db, id); else await removeVocabularyWord(db, id);
      setMembership({ id, classification: add ? 'vocabulary' : null });
    } catch (reason) { logError(reason); setError(reason instanceof WordClassificationConflictError ? reason.message : add ? '加入失败，请重试' : '移除失败，请重试'); }
    finally { submitting.current = false; setBusy(false); }
  };
  const confirmRemove = () => {
    if (submitting.current) return;
    Alert.alert('移出生词本', '确定将这个词移出生词本吗？已有学习和复习记录会保留。', [
      { text: '取消', style: 'cancel' }, { text: '移除', style: 'destructive', onPress: () => { void changeMembership(false); } },
    ]);
  };
  if (state.status !== 'ready') return <LoadState error={state.status === 'error'} retry={() => void refresh()} />;
  if (!state.data) return <Screen><PageTitle title="未找到这个词" subtitle="请返回查词页面重试。" /></Screen>;
  const word = state.data;
  const added = membership?.id === id && membership.classification === 'vocabulary';
  const familiar = membership?.id === id && membership.classification === 'familiar';
  const pos = partOfSpeechLabel(word.partOfSpeech, word.gender);
  return <Screen><View style={{ marginTop: 28, gap: 6 }}><Text selectable style={{ color: colors.text, fontSize: 38, fontWeight: '500' }}>{word.lemma}</Text><NounArticle partOfSpeech={word.partOfSpeech} gender={word.gender} /></View>
    {(word.displayForm || pos) && <View style={{ gap: 6 }}>{word.displayForm && <Text style={commonStyles.muted}>{word.displayForm}</Text>}{pos && <Text style={commonStyles.muted}>{pos}</Text>}</View>}
    <View style={{ gap: 10 }}>{word.meaningsZh.map((meaning, i) => <Text key={i} selectable style={{ color: colors.text, fontSize: 22, lineHeight: 32 }}>{meaning}</Text>)}</View>
    {word.examples.map((example, i) => <View key={i} style={{ gap: 10, marginTop: 16 }}><Text selectable style={{ fontSize: 18, lineHeight: 28, color: colors.text }}>{example.french}</Text><Text style={commonStyles.muted}>{example.chinese}</Text>{example.source === 'tatoeba' && <Text selectable style={[commonStyles.muted, { fontSize: 11 }]}>{example.attribution}{'\n'}{example.source_ref?.replace(/\|/g, '\n')}</Text>}</View>)}
    <Text style={commonStyles.muted}>{word.sourceLabel}</Text>
    <View style={{ gap: 8, marginTop: 12 }}>
      {error && <Text accessibilityLiveRegion="polite" style={{ color: colors.error }}>{error}</Text>}
      <AppButton title={busy ? '正在保存…' : familiar ? '已标熟' : added ? '已加入生词本' : '+ 加入生词本'} disabled={busy || added || familiar || membership?.id !== id} onPress={() => { void changeMembership(true); }} />
      {added && <Pressable accessibilityRole="button" disabled={busy} onPress={confirmRemove} style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}><Text style={commonStyles.muted}>移出生词本</Text></Pressable>}
    </View>
  </Screen>;
}