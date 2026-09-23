import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../../theme/colors';
interface Props { title: string; onPress: () => void; disabled?: boolean; subtle?: boolean }
export function AppButton({ title, onPress, disabled, subtle }: Props) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, subtle && styles.subtle, (pressed || disabled) && { opacity: 0.55 }]}>
    <Text style={[styles.label, subtle && { color: colors.forest }]}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: 52, paddingHorizontal: 22, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest, borderRadius: 12 }, subtle: { backgroundColor: '#E7ECE7' }, label: { fontSize: 16, color: colors.heroText, fontWeight: '500' } });
