import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';

export function SearchIcon() {
  return <View accessible={false} style={styles.icon}><View style={styles.lens} /><View style={styles.handle} /></View>;
}
const styles = StyleSheet.create({
  icon: { width: 24, height: 24 },
  lens: { position: 'absolute', width: 16, height: 16, borderWidth: 1.8, borderColor: colors.forest, borderRadius: 8, left: 1, top: 1 },
  handle: { position: 'absolute', width: 9, height: 2, borderRadius: 1, backgroundColor: colors.forest, left: 13, top: 17, transform: [{ rotate: '45deg' }] },
});
