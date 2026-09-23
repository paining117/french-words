import { HomeBackground } from '../common/HomeBackground';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HomeData } from '../../services/homeService';
import { colors } from '../../theme/colors';
import { Checkin } from './Checkin';
import { DailyActions } from './DailyActions';
import { BookProgress } from './BookProgress';
interface Props { data: HomeData; now: Date; busy: boolean; error: string | null; onCheckin: () => void }
export function HomeHero({ data, now, busy, error, onCheckin }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dateContent = <><Text style={styles.date}>{String(now.getMonth() + 1).padStart(2, '0')} <Text style={styles.slash}>/</Text> {String(now.getDate()).padStart(2, '0')}</Text><Text style={styles.day}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()]}</Text>
  </>;
  return <View style={[styles.hero, { minHeight: height, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 18) }]}>
    <HomeBackground />
    <View style={styles.top}><Text style={styles.brand}>FRENCH WORDS</Text><Pressable accessibilityRole="button" accessibilityLabel="设置" onPress={() => router.push('/settings')} style={styles.settings}><Text style={styles.settingsText}>设置</Text></Pressable></View>
    <View style={styles.dateBlock}>{dateContent}</View>
    <Checkin {...data.checkin} busy={busy} onCheckin={onCheckin} />
    {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
    <View style={styles.spacer} />
    <DailyActions daily={data.roundPending ? data.remainingToMaster : data.availableNewWords} due={data.due} bookComplete={data.book.learned === data.book.total} roundPending={data.roundPending} />
    <View style={styles.spacer} />
    <BookProgress book={data.book} />
  </View>;
}
const styles = StyleSheet.create({ hero: { paddingHorizontal: 32, overflow: 'hidden' }, shade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(8,22,18,0.12)' }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { color: colors.heroMuted, fontSize: 11, letterSpacing: 3 }, settings: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, settingsText: { fontSize: 14, color: colors.heroText }, dateBlock: { alignItems: 'center', gap: 8, marginTop: 40, marginBottom: 26 }, date: { fontSize: 46, color: colors.heroText, fontWeight: '300', fontVariant: ['tabular-nums'], letterSpacing: 3 }, slash: { color: '#A7BBAF', fontWeight: '200' }, day: { color: colors.heroMuted, fontSize: 13, letterSpacing: 2 }, spacer: { flexGrow: 1, minHeight: 10 }, error: { color: colors.heroText, textAlign: 'center', marginTop: 10 } });
