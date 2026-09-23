import { View, StyleSheet } from 'react-native';
export function ProgressBar({ value, total }: { value: number; total: number }) {
  const progress = total > 0 ? Math.min(100, Math.max(0, value / total * 100)) : 0;
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: value }} style={styles.track}>
    <View style={[styles.fill, { width: `${progress}%` }]} />
  </View>;
}
const styles = StyleSheet.create({ track: { height: 3, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 2, overflow: 'hidden' }, fill: { height: 3, backgroundColor: '#E2E9D9' } });
