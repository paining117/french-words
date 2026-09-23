import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { LearningScreen } from '../src/components/common/LearningScreen';
import { DictionarySearch } from '../src/components/dictionary/DictionarySearch';

export default function SearchScreen() {
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let disposed = false;
    const reveal = (reduceMotion: boolean) => {
      if (disposed) return;
      if (reduceMotion) entrance.setValue(1);
      else Animated.timing(entrance, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(reveal, () => reveal(false));
    return () => { disposed = true; entrance.stopAnimation(); };
  }, [entrance]);
  useFocusEffect(useCallback(() => { setStatusBarStyle('dark'); }, []));
  return <LearningScreen headerless><Animated.View style={[styles.content, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) }] }]}><DictionarySearch /></Animated.View></LearningScreen>;
}
const styles = StyleSheet.create({ content: { flex: 1 } });
