import { Component, Fragment, useCallback, useState, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeDatabase } from '../src/db/database';
import { LoadState } from '../src/components/common/LoadState';
import { BackButton } from '../src/components/common/BackButton';
import { colors } from '../src/theme/colors';
import { logError } from '../src/utils/logger';

class DatabaseBoundary extends Component<{ children: ReactNode }, { failed: boolean; generation: number }> {
  state = { failed: false, generation: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { logError(error); }
  render() {
    if (this.state.failed) return <LoadState error retry={() => this.setState(state => ({ failed: false, generation: state.generation + 1 }))} />;
    return <Fragment key={this.state.generation}>{this.props.children}</Fragment>;
  }
}
export default function RootLayout() {
  return <SafeAreaProvider><StatusBar style="dark" /><DatabaseBoundary><DatabaseContent /></DatabaseBoundary></SafeAreaProvider>;
}
function DatabaseContent() {
  const [ready, setReady] = useState(false);
  const initialize = useCallback(async (db: SQLiteDatabase) => {
    await initializeDatabase(db);
    setReady(true);
  }, []);
  // Non-Suspense provider avoids retaining a rejected startup promise on retry.
  return <>{!ready && <LoadState message="正在准备词库…" />}
    <SQLiteProvider databaseName="french_words.db" onInit={initialize}>
      <Stack screenOptions={({ navigation }) => ({
        headerTitle: '',
        headerBackVisible: false,
        headerLeft: ({ canGoBack }) => canGoBack ? <BackButton onPress={() => navigation.goBack()} /> : null,
        // iOS 26 otherwise adds a glass capsule around custom header controls.
        unstable_headerLeftItems: ({ canGoBack }) => canGoBack ? [{ type: 'custom', element: <BackButton onPress={() => navigation.goBack()} />, hidesSharedBackground: true }] : [],
        headerTransparent: true,
        headerStyle: { backgroundColor: 'transparent' },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        gestureEnabled: true,
        contentStyle: { backgroundColor: colors.pageBackground },
      })}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true, gestureDirection: 'horizontal', animation: 'fade', animationDuration: 260, animationMatchesGesture: false }} />
        <Stack.Screen name="study" options={{ title: '学习' }} />
        <Stack.Screen name="review" options={{ title: '复习' }} />
        <Stack.Screen name="books/index" options={{ title: '词书' }} />
        <Stack.Screen name="books/[id]" options={{ title: '词书详情' }} />
        <Stack.Screen name="settings" options={{ title: '设置' }} />
        <Stack.Screen name="about" options={{ title: '关于' }} />
        <Stack.Screen name="stats" options={{ title: '学习记录' }} />
        <Stack.Screen name="word/[id]" options={{ title: '单词' }} />
      </Stack>
    </SQLiteProvider>
  </>;
}
