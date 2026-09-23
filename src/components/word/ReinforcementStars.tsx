import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

/** Four-point stars have the requested inward-notched diamond shape. */
export function ReinforcementStars({ filled }: { filled: number }) {
  return <View accessible accessibilityRole="progressbar" accessibilityLabel="强化进度" accessibilityValue={{ min: 0, max: 3, now: filled, text: `${filled} / 3 颗星` }} style={styles.row}>
    {[0, 1, 2].map(index => <Text key={index} accessible={false} style={[styles.star, index < filled && styles.filled]}>{index < filled ? '✦' : '✧'}</Text>)}
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 6 }, star: { fontSize: 27, lineHeight: 32, color: colors.secondary }, filled: { color: colors.forest } });
