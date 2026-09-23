import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
// Only lemma is accepted: meanings/display form cannot leak into prompt content.
export function WordPrompt({ lemma, compact = false }: { lemma: string; compact?: boolean }) {
  return <View style={[styles.prompt, compact && { flexGrow: 0, minHeight: 120, paddingVertical: 20, paddingHorizontal: 16 }]}><Text selectable style={[styles.word, compact && { textAlign: 'left' }]}>{lemma}</Text></View>;
}
const styles = StyleSheet.create({ prompt: { flexGrow: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingVertical: 36 }, word: { fontSize: 38, lineHeight: 52, fontWeight: '500', color: colors.text, textAlign: 'center', flexShrink: 1, width: '100%' } });
