import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
export function ExampleSentence({ french, chinese }: { french: string; chinese: string }) {
  return <View style={styles.example}><Text style={styles.french}>{french}</Text><Text style={styles.chinese}>{chinese}</Text></View>;
}
const styles = StyleSheet.create({ example: { gap: 12, borderTopWidth: 1, borderColor: colors.border, paddingTop: 26, marginTop: 12 }, french: { fontSize: 18, lineHeight: 28, color: colors.text }, chinese: { fontSize: 16, lineHeight: 25, color: colors.secondary } });
