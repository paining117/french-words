import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
export function ExampleSentence({ french, chinese, source, source_ref, attribution }: { french: string; chinese: string; source?: string; source_ref?: string | null; attribution?: string | null }) {
  return <View style={styles.example}><Text style={styles.french}>{french}</Text><Text style={styles.chinese}>{chinese}</Text>{source === 'tatoeba' && <Text selectable style={{ fontSize: 11, color: colors.secondary }}>{attribution ?? 'Tatoeba contributors · CC BY 2.0 FR'}{'\n'}{source_ref?.replace(/\|/g, '\n')}</Text>}</View>;
}
const styles = StyleSheet.create({ example: { gap: 12, borderTopWidth: 1, borderColor: colors.border, paddingTop: 26, marginTop: 12 }, french: { fontSize: 18, lineHeight: 28, color: colors.text }, chinese: { fontSize: 16, lineHeight: 25, color: colors.secondary } });
