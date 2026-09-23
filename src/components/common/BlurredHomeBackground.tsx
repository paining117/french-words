import { useRef } from 'react';
import { BlurTargetView, BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';
import { HomeBackground } from './HomeBackground';

export function BlurredHomeBackground() {
  const target = useRef<View | null>(null);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <BlurTargetView ref={target} style={StyleSheet.absoluteFill}><HomeBackground /></BlurTargetView>
    <BlurView blurTarget={target} blurMethod="dimezisBlurView" intensity={65} tint="light" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, styles.veil]} />
  </View>;
}
const styles = StyleSheet.create({ veil: { backgroundColor: 'rgba(246,245,242,0.48)' } });
