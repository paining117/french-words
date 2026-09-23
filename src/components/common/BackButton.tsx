import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

export function BackButton({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.button, pressed && { opacity: 0.45 }]}>
    <View style={styles.chevron} /><Text style={styles.label}>返回</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minWidth: 60, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  chevron: { width: 9, height: 9, borderLeftWidth: 1.5, borderBottomWidth: 1.5, borderColor: colors.forest, transform: [{ rotate: '45deg' }] },
  label: { fontSize: 15, color: colors.forest },
});
