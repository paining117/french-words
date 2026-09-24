import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePronunciation } from '../../hooks/usePronunciation';
import { colors } from '../../theme/colors';

export function PronunciationButton({ lemma }: { lemma: string }) {
  const { state, play } = usePronunciation(lemma);
  const playing = state === 'speaking';
  return <View style={styles.wrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={`播放 ${lemma} 的法语发音`} accessibilityState={{ busy: state === 'loading' }}
      onPress={play} style={({ pressed }) => [styles.button, playing && styles.playing, pressed && { opacity: 0.55 }]}>
      <View accessible={false} style={styles.icon}><View style={styles.speaker} /><View style={styles.cone} /><View style={styles.wave} /></View>
      <Text style={[styles.label, playing && { color: colors.forest }]}>{state === 'loading' ? '准备发音…' : playing ? '正在发音' : '发音'}</Text>
    </Pressable>
    {state === 'unavailable' && <Text accessibilityLiveRegion="polite" style={styles.hint}>请在手机系统设置中下载法语语音，再点击发音重试。</Text>}
    {state === 'error' && <Text accessibilityLiveRegion="polite" style={styles.hint}>暂时无法播放，请点击发音重试。</Text>}
  </View>;
}
const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start', gap: 6 },
  button: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.35)' },
  playing: { backgroundColor: 'rgba(80,140,105,0.16)' },
  label: { color: colors.secondary, fontSize: 14 },
  hint: { color: colors.secondary, fontSize: 13, lineHeight: 20 },
  icon: { width: 22, height: 22 },
  speaker: { position: 'absolute', left: 1, top: 8, width: 5, height: 7, backgroundColor: colors.secondary, borderRadius: 1 },
  cone: { position: 'absolute', left: 4, top: 4, borderTopWidth: 7.5, borderBottomWidth: 7.5, borderRightWidth: 7, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: colors.secondary },
  wave: { position: 'absolute', top: 5, left: 12, width: 7, height: 13, borderRightWidth: 1.5, borderRightColor: colors.secondary, borderRadius: 7 },
});
