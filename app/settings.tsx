import { useCallback, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getHomeData } from '../src/services/homeService';
import { useResource } from '../src/hooks/useResource';
import { PageTitle, Screen, commonStyles } from '../src/components/common/Screen';
import { LoadState } from '../src/components/common/LoadState';
import { AppButton } from '../src/components/common/AppButton';
import { setStudyRoundSize } from '../src/repositories/settingsRepository';
import { DAILY_OPTIONS, isValidRoundSize } from '../src/types/settings';
import { colors } from '../src/theme/colors';
import { logError } from '../src/utils/logger';
export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { state, refresh } = useResource(useCallback(() => getHomeData(db), [db]));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const save = async () => {
    if (saving.current) return;
    const size = Number(draft);
    if (!/^\d+$/.test(draft) || !isValidRoundSize(size)) { setError('请输入大于 0 且为 5 的倍数的整数'); return; }
    saving.current = true; setBusy(true); setError('');
    try { await setStudyRoundSize(db, size); await refresh(); Keyboard.dismiss(); setEditing(false); }
    catch (reason) { logError(reason); setError('保存失败，请重试'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Screen keyboardAware><PageTitle title="设置" />
    {state.status === 'ready' ? <>
      <Pressable accessibilityRole="button" onPress={() => router.push('/books')} style={commonStyles.row}><Text style={commonStyles.text}>当前词书　↗</Text><Text style={commonStyles.muted}>{state.data.book.name}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="修改每轮新词数" disabled={busy} style={commonStyles.row} onPress={() => { setDraft(String(state.data.dailyNewWords)); setError(''); setEditing(value => !value); }}>
        <Text style={commonStyles.text}>每轮新词数　{state.data.dailyNewWords}　›</Text>
      </Pressable>
      {editing && <View style={{ gap: 16 }}>
        <View style={styles.options}>{DAILY_OPTIONS.map(size => <Pressable key={size} accessibilityRole="button" accessibilityState={{ selected: Number(draft) === size, disabled: busy }} disabled={busy} onPress={() => { setDraft(String(size)); setError(''); }} style={[styles.option, Number(draft) === size && styles.selected]}><Text style={[commonStyles.text, Number(draft) === size && { color: colors.heroText }]}>{size}</Text></Pressable>)}</View>
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" accessibilityLabel="减少5个" disabled={busy || !isValidRoundSize(Number(draft)) || Number(draft) <= 5} onPress={() => setDraft(String(Number(draft) - 5))} style={styles.step}><Text style={styles.symbol}>−</Text></Pressable>
          <TextInput accessibilityLabel="每轮新词数，正整数且为5的倍数" editable={!busy} value={draft} onChangeText={value => { setDraft(value); setError(''); }} keyboardType="number-pad" maxLength={16} style={styles.input} onSubmitEditing={() => void save()} />
          <Pressable accessibilityRole="button" accessibilityLabel="增加5个" disabled={busy || !isValidRoundSize(Number(draft) + 5)} onPress={() => setDraft(String(Number(draft) + 5))} style={styles.step}><Text style={styles.symbol}>＋</Text></Pressable>
        </View>
        {error !== '' && <Text accessibilityLiveRegion="polite" style={{ color: colors.error }}>{error}</Text>}
        <AppButton title={busy ? '正在保存…' : '保存'} disabled={busy} onPress={() => void save()} />
      </View>}
      <Text style={commonStyles.muted}>修改从下一轮生效，当前轮进度保留。</Text>
    </> : <LoadState inline error={state.status === 'error'} retry={() => void refresh()} />}
    <Pressable accessibilityRole="button" onPress={() => router.push('/stats')} style={commonStyles.row}><Text style={commonStyles.text}>学习记录　↗</Text></Pressable>
    <Pressable accessibilityRole="button" style={commonStyles.row} onPress={() => router.push('/about')}><Text style={commonStyles.text}>关于　↗</Text></Pressable>
  </Screen>;
}
const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { minWidth: 48, minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.45)' },
  selected: { backgroundColor: colors.forest }, stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, symbol: { fontSize: 25, color: colors.forest },
  input: { flex: 1, textAlign: 'center', fontSize: 24, padding: 10, color: colors.text, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.4)' },
});
