import { StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import type { StudyReviewWord, StudySnapshot } from '../../types/study';
import { colors } from '../../theme/colors';
import { reviewDueLabel } from '../../utils/reviewDue';
import { appNow } from '../../utils/appClock';
export function StudySummary({ result }: { result: Extract<StudySnapshot, { status: 'completed' }> }) {
  return <SessionWordSummary words={result.words} footer={`今日已学 ${result.learnedToday} 个单词`} />;
}
export function SessionWordSummary({ words, footer }: { words: StudyReviewWord[]; footer: string }) {
  const [availableHeight, setAvailableHeight] = useState(0);
  const [now, setNow] = useState(appNow);
  useEffect(() => { const timer = setInterval(() => setNow(appNow()), 30000); return () => clearInterval(timer); }, []);
  // Fit the complete list into the space left by the header, safe area and
  // return button. Single-line cells cannot make a row expand or scroll.
  const rowHeight = Math.min(40, Math.max(0, availableHeight - 36) / Math.max(1, words.length));
  const fontSize = Math.min(16, rowHeight * 0.58);
  return <View style={styles.wrap}>
    <View style={styles.sheet} onLayout={event => setAvailableHeight(event.nativeEvent.layout.height)}>
      {availableHeight > 0 && <>
        {words.map(word => {
          const due = reviewDueLabel(word.dueAt, now, word.suspended, 'day');
          const label = word.lemma;
          return <View key={word.wordId} accessible accessibilityLabel={`${label}，${word.meaning}，${due}`} style={[styles.row, { height: rowHeight }]}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} allowFontScaling={false} style={[styles.lemma, { fontSize }]}>{label}</Text>
            <Text numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false} style={[styles.meaning, { fontSize: fontSize * 0.9 }]}>{word.meaning}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} allowFontScaling={false} style={[styles.due, { fontSize: fontSize * 0.8 }]}>{due}</Text>
          </View>;
        })}
        <Text numberOfLines={1} allowFontScaling={false} style={styles.total}>{footer}</Text>
      </>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, overflow: 'hidden' },
  sheet: { flex: 1, minHeight: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden', flexShrink: 0 },
  lemma: { flex: 1, minWidth: 0, color: colors.text, fontWeight: '500' },
  meaning: { flex: 1, minWidth: 0, color: colors.secondary },
  due: { width: 82, color: colors.forest, textAlign: 'right', fontVariant: ['tabular-nums'] },
  total: { marginTop: 14, fontSize: 12, lineHeight: 18, color: colors.secondary, textAlign: 'center' },
});
