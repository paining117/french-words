import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LearningScreen } from './LearningScreen';
import { colors } from '../../theme/colors';
import type { ReactNode } from 'react';
export function Screen({ children, keyboardAware = false }: { children: ReactNode; keyboardAware?: boolean }) {
  return <LearningScreen><ScrollView style={styles.screen} contentInsetAdjustmentBehavior="never" automaticallyAdjustKeyboardInsets={keyboardAware} keyboardShouldPersistTaps={keyboardAware ? 'handled' : 'never'} contentContainerStyle={styles.content}>{children}</ScrollView></LearningScreen>;
}
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>;
}
export const commonStyles = StyleSheet.create({ text: { color: colors.text, fontSize: 16, lineHeight: 26 }, muted: { color: colors.secondary, fontSize: 15, lineHeight: 25 }, row: { paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 6 } });
const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 28, paddingBottom: 32, gap: 24, flexGrow: 1 }, heading: { gap: 10, marginTop: 12, marginBottom: 12 }, title: { fontSize: 30, fontWeight: '500', color: colors.text }, subtitle: { fontSize: 15, lineHeight: 24, color: colors.secondary } });
