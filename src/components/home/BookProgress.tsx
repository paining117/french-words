import { router } from 'expo-router';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import type { BookProgress as Book } from '../../types/word';
import { ProgressBar } from '../common/ProgressBar';
import { colors } from '../../theme/colors';
export function BookProgress({ book }: { book: Book }) {
  return <Pressable accessibilityRole="button" onPress={() => router.push('/books')} style={styles.wrap}>
    <View style={styles.row}><Text style={styles.title}>{book.name}</Text><Text style={styles.count}>{book.learned} / {book.total}</Text></View>
    <ProgressBar value={book.learned} total={book.total} />
  </Pressable>;
}
const styles = StyleSheet.create({ wrap: { gap: 16, paddingVertical: 20, width: '100%', maxWidth: 460, alignSelf: 'center' }, row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }, title: { color: colors.heroText, fontSize: 15 }, count: { color: colors.heroMuted, fontSize: 14, fontVariant: ['tabular-nums'] } });
