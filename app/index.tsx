import { useCallback, useRef, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useSQLiteContext } from 'expo-sqlite';
import { getHomeData } from '../src/services/homeService';
import { checkIn } from '../src/services/checkinService';
import { HomeHero } from '../src/components/home/HomeHero';
import { usePullDownSearch } from '../src/hooks/usePullDownSearch';
import { LoadState } from '../src/components/common/LoadState';
import { useResource } from '../src/hooks/useResource';
import { logError } from '../src/utils/logger';
import { appNow } from '../src/utils/appClock';


export default function HomeScreen() {
  const db = useSQLiteContext();
  const [now, setNow] = useState(appNow);
  const load = useCallback(() => getHomeData(db), [db]);
  const { state, refresh } = useResource(load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signing = useRef(false);
  const openingSearch = useRef(false);
  const openSearch = () => {
    if (openingSearch.current) return;
    openingSearch.current = true;
    router.push('/search');
  };
  const pullDownHandlers = usePullDownSearch(openSearch, state.status === 'ready');
  useFocusEffect(useCallback(() => {
    setStatusBarStyle('light');
    openingSearch.current = false;
    const tick = () => { setNow(appNow()); void refresh(); };
    const interval = setInterval(tick, 30_000);
    const subscription = AppState.addEventListener('change', value => { if (value === 'active') tick(); });
    tick();
    return () => { clearInterval(interval); subscription.remove(); setStatusBarStyle('dark'); };
  }, [refresh]));
  const onCheckin = async () => {
    if (signing.current) return;
    signing.current = true;
    setBusy(true); setError(null);
    try { await checkIn(db); await refresh(); } catch (reason) { logError(reason); setError('加载失败，请重试'); }
    finally { signing.current = false; setBusy(false); }
  };
  if (state.status !== 'ready') return <LoadState error={state.status === 'error'} retry={() => void refresh()} />;
  return <View style={{ flex: 1 }} {...pullDownHandlers}><ScrollView style={{ flex: 1 }} bounces={false} contentInsetAdjustmentBehavior="never">
    <HomeHero data={state.data} now={now} busy={busy} error={error} onCheckin={() => void onCheckin()} />
  </ScrollView></View>;
}
