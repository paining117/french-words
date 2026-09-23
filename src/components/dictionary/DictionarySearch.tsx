import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { suggestLocal } from '../../services/dictionaryService';
import { createSuggestionSearch, type SuggestionState } from '../../services/dictionary/suggestionSearch';
import { exactDictionaryMatches, getSearchHistoryItems } from '../../services/dictionaryHistory';
import { clearSearchHistory, saveSearch } from '../../repositories/searchRepository';
import { detectDirection } from '../../utils/normalizeFrench';
import { partOfSpeechLabel } from '../../utils/wordLabel';
import { logError } from '../../utils/logger';
import type { DictionaryEntry } from '../../types/dictionary';
import { useResource } from '../../hooks/useResource';
import { AppButton } from '../common/AppButton';
import { SearchIcon } from '../common/SearchIcon';
import { colors } from '../../theme/colors';

export function DictionarySearch() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const submitting = useRef(false);
  const [state, setState] = useState<SuggestionState>({ status: 'idle' });
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const clearingRef = useRef(false);
  const input = useRef<TextInput>(null);
  const opening = useRef(false);
  const history = useResource(useCallback(() => getSearchHistoryItems(db), [db]));
  const direction = detectDirection(query);
  const search = useMemo(() => createSuggestionSearch((value, selectedDirection) => suggestLocal(db, value, selectedDirection), setState), [db]);
  useFocusEffect(useCallback(() => {
    search.schedule(query, direction);
    return () => { search.cancel(); submitting.current = false; };
  }, [search, query, direction]));
  useFocusEffect(useCallback(() => {
    opening.current = false;
    const timer = setTimeout(() => input.current?.focus(), 300);
    return () => { clearTimeout(timer); Keyboard.dismiss(); };
  }, []));
  const openWord = async (entry: DictionaryEntry, value = query, selectedDirection = direction) => {
    if (!entry.wordId || opening.current) return;
    opening.current = true; Keyboard.dismiss();
    try { await saveSearch(db, value, selectedDirection, undefined, entry.wordId); await history.refresh(); }
    catch (error) { logError(error); setHistoryError('查询记录保存失败'); }
    router.push({ pathname: '/word/[id]', params: { id: entry.wordId } });
  };
  const submit = async () => {
    if (submitting.current || !query.trim()) return;
    submitting.current = true;
    const value = query, selectedDirection = direction;
    Keyboard.dismiss();
    try {
      const entries = await search.run(value, selectedDirection);
      if (!entries) return;
      const exact = exactDictionaryMatches(entries, value, selectedDirection);
      const match = exact.length === 1 ? exact[0] : entries.length === 1 ? entries[0] : undefined;
      if (match) await openWord(match, value, selectedDirection);
    } finally { submitting.current = false; }
  };
  const changeQuery = (value: string) => {
    search.cancel(); submitting.current = false;
    setQuery(value); setState({ status: 'idle' });
  };
  const clearHistory = async () => {
    if (clearingRef.current) return;
    clearingRef.current = true; setClearing(true); setHistoryError(null);
    try { await clearSearchHistory(db); await history.refresh(); }
    catch (error) { logError(error); setHistoryError('清空失败，请重试'); }
    finally { clearingRef.current = false; setClearing(false); }
  };
  const typing = query.trim().length > 0;
  const entries = state.status === 'ready' ? state.entries : [];
  const resultRow = (entry: DictionaryEntry, value = query, selectedDirection = direction, key = entry.wordId) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${entry.lemma}，${partOfSpeechLabel(entry.partOfSpeech, entry.gender) ?? ''}，${entry.meaningsZh.join('；')}`} style={({ pressed }) => [styles.result, pressed && { opacity: 0.55 }]} onPress={() => { void openWord(entry, value, selectedDirection); }}>
    <View style={styles.resultTop}><Text style={styles.french}>{entry.lemma}</Text><Text style={styles.pos}>{partOfSpeechLabel(entry.partOfSpeech, entry.gender)}</Text></View>
    <Text style={styles.meaning}>{entry.meaningsZh.join('；')}</Text>
    {entry.source === 'ai' && <Text style={styles.pos}>AI 补充</Text>}
  </Pressable>;
  const results = <View style={styles.listContent}>
    {typing && state.status === 'loading' && <ActivityIndicator color={colors.forest} style={styles.message} accessibilityLabel="正在查询" />}
    {typing && state.status === 'error' && <AppButton title="查询失败，点击重试" subtle onPress={() => { void search.run(query, direction); }} />}
    {typing && state.status === 'ready' && !entries.length && <Text style={styles.empty}>本地词库中没有找到这个词</Text>}
    {typing && entries.map(entry => resultRow(entry))}
    {!typing && <>
      {history.state.status === 'loading' && <ActivityIndicator color={colors.forest} />}
      {history.state.status === 'error' && <AppButton title="历史加载失败，点击重试" subtle onPress={() => { void history.refresh(); }} />}
      {history.state.status === 'ready' && history.state.data.map(row => row.entry ? resultRow(row.entry, row.query, row.direction, row.id) :
        <Pressable key={row.id} accessibilityRole="button" style={styles.result} onPress={() => {
          changeQuery(row.query);
        }}><Text style={styles.french}>{row.query}</Text></Pressable>)}
      {history.state.status === 'ready' && history.state.data.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="清空查询历史" disabled={clearing} onPress={() => { void clearHistory(); }} style={styles.clearButton}><Text style={styles.pos}>{clearing ? '清空中…' : '清空'}</Text></Pressable>}
    </>}
    {historyError && <Text style={styles.error}>{historyError}</Text>}
  </View>;
  const content = <>
    <View style={styles.inputRow}>
      <TextInput ref={input} accessibilityLabel="输入法语或中文，支持无重音拼写" placeholder="输入法语或中文" placeholderTextColor={colors.secondary} value={query} onChangeText={changeQuery} onSubmitEditing={() => { void submit(); }} returnKeyType="search" autoCorrect={false} autoCapitalize="none" maxLength={100} clearButtonMode="while-editing" style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel="搜索" disabled={!typing} onPress={() => { void submit(); }} style={({ pressed }) => [styles.searchButton, (pressed || !typing) && { opacity: 0.5 }]}><SearchIcon /></Pressable>
    </View>
    <ScrollView style={{ flex: 1, marginTop: 12 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentInsetAdjustmentBehavior="never">{results}</ScrollView>
  </>;
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top} style={styles.screen} onAccessibilityEscape={() => { Keyboard.dismiss(); router.back(); }}>{content}</KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingLeft: 16, backgroundColor: 'rgba(255,255,255,0.58)' },
  input: { flex: 1, minWidth: 0, minHeight: 54, fontSize: 18, color: colors.text, paddingVertical: 12 },
  searchButton: { width: 50, height: 54, justifyContent: 'center', alignItems: 'center' },
  clearButton: { minHeight: 44, alignSelf: 'flex-end', minWidth: 48, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingBottom: 24 }, result: { paddingVertical: 17, gap: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  resultTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 12 },
  french: { fontSize: 23, color: colors.text, fontWeight: '500' }, pos: { color: colors.secondary, fontSize: 13 }, meaning: { color: colors.text, fontSize: 16, lineHeight: 25 },
  empty: { color: colors.secondary, fontSize: 15, textAlign: 'center', paddingVertical: 28 }, message: { marginTop: 24 }, error: { color: colors.error, fontSize: 14 },
});
