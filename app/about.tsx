import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { PageTitle, Screen, commonStyles } from '../src/components/common/Screen';
import manifest from '../data/generated/manifest.json';
export default function AboutScreen() {
  return <Screen><PageTitle title="French Words" />
    <Text style={commonStyles.text}>离线法语词典、学习与复习</Text>
    <View style={{ gap: 12 }}><Text style={commonStyles.text}>数据来源</Text>
      <Text selectable style={commonStyles.muted}>FreeDict / WikDict fra-zho · {manifest.sources.freedict.version}{'\n'}Karl Bartel；基于 Wiktionary / DBnary。CC BY-SA 3.0 Unported。已整理词性、合并释义并建立检索索引。{'\n'}https://freedict.org/</Text>
      <Text selectable style={commonStyles.muted}>FLELex / Beacco · TreeTagger{'\n'}{manifest.sources.flelex.available ? 'CEFR 分级来自官方数据。' : '分级文件暂未导入，当前不推测词汇等级。'}{'\n'}François、Gala、Watrin、Fairon（2014）；Pintard、François（2020）。CC BY-NC-SA 4.0。{'\n'}https://cental.uclouvain.be/cefrlex/flelex/</Text>
      <Text style={commonStyles.muted}>{manifest.sources.tatoeba.available ? '补充例句来自 Tatoeba，采用 CC BY 2.0 FR 许可。' : '暂未导入 Tatoeba 补充例句；已有本地例句保留。'}</Text>
      <Pressable accessibilityRole="button" style={commonStyles.row} onPress={() => router.push('/credits')}><Text style={commonStyles.text}>例句来源与署名　›</Text></Pressable>
      <Text style={commonStyles.muted}>分级资源含非商业许可限制。公开或商业发布前须复核数据许可、署名及相同方式共享要求。</Text>
    </View>
    <Text selectable style={commonStyles.muted}>词库版本：{manifest.version}{'\n'}离线词条：{manifest.counts.dictionaryEntries}</Text>
  </Screen>;
}
