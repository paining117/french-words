import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
export function DailyActions({ daily, due, bookComplete, roundPending }: { daily: number; due: number; bookComplete: boolean; roundPending: boolean }) {
  const studyLabel = roundPending ? '继续本轮学习' : bookComplete ? '当前词书已学完' : '下一轮新词';
  return <View style={styles.container}>
    <Pressable accessibilityRole="button" accessibilityLabel={`学习，${studyLabel} ${daily}`} onPress={() => router.push('/study')} style={({ pressed }) => [styles.action, pressed && { opacity: 0.55 }]}>
      <View style={styles.words}><Text style={styles.title}>学习</Text><Text style={styles.caption}>{studyLabel}</Text></View><Text style={styles.number}>{daily}</Text><Text style={styles.arrow}>↗</Text>
    </Pressable>
    <View style={styles.line} />
    <Pressable accessibilityRole="button" accessibilityLabel={`复习，待复习 ${due}`} onPress={() => { if (due > 0) router.push('/review'); }} disabled={due === 0} accessibilityState={{ disabled: due === 0 }} style={({ pressed }) => [styles.action, pressed && { opacity: 0.55 }]}>
      <View style={styles.words}><Text style={styles.title}>复习</Text><Text style={styles.caption}>{due === 0 ? '今日复习已完成' : '待复习'}</Text></View><Text style={styles.number}>{due}</Text><Text style={styles.arrow}>{due > 0 ? '↗' : '—'}</Text>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({ container: { width: '100%', maxWidth: 460, alignSelf: 'center', marginVertical: 26 }, action: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 24, minHeight: 96 }, words: { flex: 1, gap: 8 }, title: { color: colors.heroText, fontSize: 32, fontWeight: '500', letterSpacing: 3 }, caption: { color: colors.heroMuted, fontSize: 13 }, number: { color: colors.heroText, fontSize: 38, fontWeight: '300', fontVariant: ['tabular-nums'] }, arrow: { color: colors.heroMuted, fontSize: 24, width: 24 }, line: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)' } });
