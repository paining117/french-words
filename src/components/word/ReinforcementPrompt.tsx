import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { StudyQueueItem } from '../../types/study';
import { studyPhase } from '../../services/studyQueue';
import { WordPrompt } from './WordPrompt';
import { colors } from '../../theme/colors';
import { usageHint } from '../../utils/meaningHints';

export function ReinforcementPrompt({ item, disabled, onChoose, selectedChoiceId }: { item: StudyQueueItem; disabled: boolean; onChoose: (id: string) => void; selectedChoiceId?: string }) {
  const { height } = useWindowDimensions();
  const phase = studyPhase(item);
  const answered = selectedChoiceId !== undefined;
  const wrong = answered && selectedChoiceId !== item.word.wordId;
  if (phase === 'meaning') return <View style={styles.meaningPrompt}>
    {item.word.meaningsZh.map((meaning, index) => <Text key={index} selectable style={styles.meaning}>{meaning}</Text>)}
    {!!usageHint(item.word) && <Text style={styles.hint}>{usageHint(item.word)}</Text>}
  </View>;
  return <View style={[styles.wrap, phase === 'choice' && { paddingBottom: Math.min(48, height * 0.04) }]}><WordPrompt lemma={item.word.lemma} compact={phase === 'choice'} />
    {phase === 'choice' && <>
      <View style={styles.spacer} />
      <View style={styles.options}>{item.word.meaningChoices?.map(choice => <Pressable key={choice.id} accessibilityRole="button" accessibilityLabel={`${choice.meaning}${wrong && choice.lemma ? `，${choice.lemma}` : ''}${answered && choice.id === item.word.wordId ? '，正确答案' : wrong && selectedChoiceId === choice.id ? '，回答错误' : ''}`} accessibilityState={{ disabled: disabled || answered, selected: selectedChoiceId === choice.id }} disabled={disabled || answered} onPress={() => onChoose(choice.id)} style={({ pressed }) => [styles.option, { minHeight: Math.max(64, Math.min(92, height * 0.087)) }, answered && choice.id === item.word.wordId && styles.correctOption, wrong && selectedChoiceId === choice.id && styles.wrongOption, !answered && (pressed || disabled) && { opacity: 0.5 }]}>
        <Text style={styles.optionMeaning}>{choice.meaning}{wrong && choice.lemma && <Text style={styles.optionFrench}>{'  '}{choice.lemma}</Text>}</Text>
      </Pressable>)}
      </View>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  wrap: { flexGrow: 1 },
  spacer: { flexGrow: 1, minHeight: 24 },
  options: { gap: 8 },
  option: { borderWidth: 2, borderColor: 'transparent', borderRadius: 12, flexDirection: 'row', gap: 14, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.65)' },
  correctOption: { borderColor: colors.success, backgroundColor: '#E4ECE3' },
  wrongOption: { borderColor: colors.error, backgroundColor: '#F2E3E0' },
  optionMeaning: { color: colors.text, fontSize: 18, lineHeight: 27, flex: 1 },
  optionFrench: { color: colors.forest, fontSize: 17 },
  meaningPrompt: { flexGrow: 1, minHeight: 260, paddingVertical: 40, gap: 24, alignItems: 'center', justifyContent: 'center' },
  meaning: { color: colors.text, fontSize: 30, lineHeight: 44, textAlign: 'center' },
  hint: { color: colors.secondary, fontSize: 15, lineHeight: 24, textAlign: 'center' },
});
