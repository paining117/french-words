import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Screen, commonStyles } from '../src/components/common/Screen';
import { LoadState } from '../src/components/common/LoadState';
import { useResource } from '../src/hooks/useResource';
import { getReviewStats } from '../src/services/statsService';

export default function StatsScreen() {
  const db = useSQLiteContext();
  const { state, refresh } = useResource(useCallback(() => getReviewStats(db), [db]));
  return <Screen>{state.status === 'ready' ? <>
    <View style={commonStyles.row}><Text style={commonStyles.text}>今日复习</Text><Text style={commonStyles.text}>{state.data.today} 次</Text></View>
    <View style={commonStyles.row}><Text style={commonStyles.text}>累计复习</Text><Text style={commonStyles.text}>{state.data.total} 次</Text></View>
  </> : <LoadState inline error={state.status === 'error'} retry={() => void refresh()} />}</Screen>;
}
