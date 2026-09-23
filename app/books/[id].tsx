import { FAMILIAR_BOOK_ID, undoFamiliar } from '../../src/services/familiarService';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getBookProgress, getWordsByBookId, VOCABULARY_BOOK_ID, removeVocabularyWord } from '../../src/repositories/wordBookRepository';
import { getSettings, setCurrentBook } from '../../src/repositories/settingsRepository';
import { useResource } from '../../src/hooks/useResource';
import { PageTitle, Screen, commonStyles } from '../../src/components/common/Screen';
import { LoadState } from '../../src/components/common/LoadState';
import { AppButton } from '../../src/components/common/AppButton';
import { partOfSpeechLabel } from '../../src/utils/wordLabel';
import { logError } from '../../src/utils/logger';
import { LearningScreen } from '../../src/components/common/LearningScreen';
import { colors } from '../../src/theme/colors';
export default function BookScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const db = useSQLiteContext();
  const switching = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state, refresh } = useResource(useCallback(async () => ({ book: await getBookProgress(db, id), words: await getWordsByBookId(db, id), settings: await getSettings(db) }), [db, id]));
  const select = async () => {
    if (switching.current) return;
    switching.current = true; setBusy(true); setError(null);
    try { await setCurrentBook(db, id); await refresh(); }
    catch (reason) { logError(reason); setError('切换失败，请重试'); }
    finally { switching.current = false; setBusy(false); }
  };
  const remove = (wordId: string) => Alert.alert(id === FAMILIAR_BOOK_ID ? '确定撤回标熟吗？' : '确定将这个词移出生词本吗？',
    id === FAMILIAR_BOOK_ID ? '恢复标熟前的安排；如果之后已有新的学习记录，则保留最新进度。' : undefined,
    [{ text: '取消', style: 'cancel' }, { text: '确定', onPress: () => { void (async () => {
      if (switching.current) return;
      switching.current = true; setBusy(true); setError(null);
      try { if (id === FAMILIAR_BOOK_ID) await undoFamiliar(db, wordId); else await removeVocabularyWord(db, wordId); await refresh(); }
      catch (reason) { logError(reason); setError('撤回失败，请重试'); }
      finally { switching.current = false; setBusy(false); }
    })(); } }]);
  if (state.status !== 'ready') return <LoadState error={state.status === 'error'} retry={() => void refresh()} />;
  const { book, words, settings } = state.data;
  if (!book) return <Screen><PageTitle title="未找到这本词书" /></Screen>;
  return <LearningScreen><FlatList data={words} keyExtractor={word => word.id} initialNumToRender={16} maxToRenderPerBatch={20} windowSize={7} contentContainerStyle={{ padding: 28, paddingBottom: 32 }} ListHeaderComponent={<View style={{ gap: 20 }}><PageTitle title={book.name} />
    <Text style={commonStyles.text}>{book.learned} / {book.total} 个词</Text>
    {error && <Text style={{ color: colors.error }}>{error}</Text>}
    {id !== FAMILIAR_BOOK_ID && <AppButton title={busy ? '正在切换…' : settings.currentBookId === id ? '当前词书' : '设为当前词书'} disabled={busy || settings.currentBookId === id} onPress={() => { void select(); }} />}
    {!words.length && <View style={{ gap: 10 }}><Text style={commonStyles.text}>还没有单词</Text>{id === VOCABULARY_BOOK_ID && <Text style={commonStyles.muted}>在首页查词后，将需要学习的词加入这里。</Text>}</View>}
    </View>} renderItem={({ item: word }) => <View style={{ flexDirection: 'row', alignItems: 'center' }}><Pressable accessibilityRole="button" key={word.id} style={[commonStyles.row, { flex: 1 }]} onPress={() => router.push({ pathname: '/word/[id]', params: { id: word.id } })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text style={[commonStyles.text, { flex: 1, fontSize: 21 }]}>{word.lemma}</Text><Text style={commonStyles.muted}>{word.learned ? '已学习' : '未学习'}</Text></View>
      {word.display_form && <Text style={commonStyles.muted}>{word.display_form}</Text>}
      <Text style={commonStyles.muted}>{partOfSpeechLabel(word.part_of_speech ?? undefined, word.gender ?? undefined)}　{word.primary_meaning_zh}</Text>
    </Pressable>{(id === VOCABULARY_BOOK_ID || id === FAMILIAR_BOOK_ID) && <Pressable accessibilityRole="button" accessibilityLabel={`撤回${word.lemma}的标记`} disabled={busy} onPress={() => remove(word.id)} style={{ padding: 12, minHeight: 44 }}><Text style={{ color: colors.secondary }}>撤回</Text></Pressable>}</View>} />
  </LearningScreen>;
}