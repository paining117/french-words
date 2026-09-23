import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

/** Shared backdrop keeps the home and learning screens on the same palette. */
export function HomeBackground() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <LinearGradient colors={['#58766B', '#31554E', '#203E38']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,22,18,0.12)' }]} />
  </View>;
}
