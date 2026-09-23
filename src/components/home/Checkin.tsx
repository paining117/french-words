import { Pressable, Text, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';
export function Checkin({ checkedIn, streak, busy, onCheckin }: { checkedIn: boolean; streak: number; busy: boolean; onCheckin: () => void }) {
  return <View style={styles.wrap}>
    <Pressable onPress={onCheckin} disabled={checkedIn || busy} accessibilityRole="button" accessibilityState={{ disabled: checkedIn || busy }} style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}>
      <Text style={styles.label}>{checkedIn ? '今日已签到' : busy ? '正在签到…' : '签到'}</Text>
    </Pressable>
    <Text style={styles.streak}>连续学习 {streak} 天</Text>
  </View>;
}
const styles = StyleSheet.create({ wrap: { alignItems: 'center', gap: 10 }, button: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 24 }, label: { fontSize: 15, color: colors.heroText }, streak: { color: colors.heroMuted, fontSize: 13 } });
