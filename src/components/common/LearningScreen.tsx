import type { ReactNode } from 'react';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurredHomeBackground } from './BlurredHomeBackground';
import { colors } from '../../theme/colors';

export function LearningScreen({ children, headerless = false }: { children: ReactNode; headerless?: boolean }) {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  return <View style={styles.screen}>
    <BlurredHomeBackground />
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.content, { paddingTop: headerless ? insets.top : headerHeight }]}>{children}</SafeAreaView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pageBackground },
  content: { flex: 1 },
});
