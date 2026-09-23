import { Pressable, StyleSheet, Text, View } from 'react-native';
import { USER_RATINGS, type UserRating } from '../../types/study';
import { colors } from '../../theme/colors';
const palette = { known: { text: colors.success, background: '#E4ECE3' }, uncertain: { text: colors.warning, background: '#F2EADC' }, unknown: { text: colors.error, background: '#F2E3E0' } };
export function RatingButtons({ disabled, onRate, binary = false, choice = false }: { disabled: boolean; onRate: (rating: UserRating) => void; binary?: boolean; choice?: boolean }) {
  return <View style={styles.row}>{USER_RATINGS.filter(rating => (!binary || rating.value !== 'uncertain') && (!choice || rating.value !== 'known')).map(rating => <Pressable key={rating.value} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => onRate(rating.value)} style={({ pressed }) => [styles.button, { backgroundColor: palette[rating.value].background }, (pressed || disabled) && { opacity: 0.5 }]}><Text style={[styles.label, { color: palette[rating.value].text }]}>{rating.label}</Text></Pressable>)}</View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 10 }, button: { flex: 1, minWidth: 0, minHeight: 56, paddingHorizontal: 4, paddingVertical: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 12 }, label: { fontSize: 16, fontWeight: '500', textAlign: 'center' } });
