import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { PageTitle, Screen, commonStyles } from '../src/components/common/Screen';
import { AppButton } from '../src/components/common/AppButton';
import { LoadState } from '../src/components/common/LoadState';
import { getExampleCredits } from '../src/repositories/wordRepository';
import { useResource } from '../src/hooks/useResource';

export default function CreditsScreen() {
  const db = useSQLiteContext();
  const [page, setPage] = useState(0);
  const { state, refresh } = useResource(useCallback(async () => ({ page, entries: await getExampleCredits(db, page) }), [db, page]));
  const ready = state.status === 'ready' && state.data.page === page;
  return <Screen key={page}><PageTitle title="例句来源与署名" />
    <Text selectable style={commonStyles.muted}>Tatoeba contributors · CC BY 2.0 FR{'\n'}https://creativecommons.org/licenses/by/2.0/fr/{'\n'}例句按原文保留，整理了中法配对和单词关联。</Text>
    {ready ? <>
      {state.data.entries.map((example, index) => <View key={`${page}:${index}`} style={commonStyles.row}>
        <Text selectable style={commonStyles.text}>{example.french}{'\n'}{example.chinese}</Text>
        <Text selectable style={commonStyles.muted}>{example.attribution ?? 'Tatoeba contributors'}{'\n'}{example.source_ref?.replace(/\|/g, '\n')}</Text>
      </View>)}
      {!state.data.entries.length && <Text style={commonStyles.muted}>没有更多例句</Text>}
    </> : <LoadState inline error={state.status === 'error'} retry={() => void refresh()} />}
    <View style={{ gap: 12 }}>
      <AppButton title="上一页" disabled={!ready || page === 0} onPress={() => setPage(value => value - 1)} />
      <Text style={commonStyles.muted}>第 {page + 1} 页</Text>
      <AppButton title="下一页" disabled={!ready || state.data.entries.length < 50} onPress={() => setPage(value => value + 1)} />
    </View>
  </Screen>;
}
