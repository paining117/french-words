import { StyleSheet, Text, View } from 'react-native';
import type { StudyWord } from '../../types/study';
import { colors } from '../../theme/colors';
import { partOfSpeechLabel } from '../../utils/wordLabel';
import { NounArticle } from './NounArticle';
import { ExampleSentence } from './ExampleSentence';
import { usageHint } from '../../utils/meaningHints';
import { PronunciationButton } from './PronunciationButton';
export function WordAnswer({ word }: { word: StudyWord }) {
  const label = partOfSpeechLabel(word.partOfSpeech, word.gender);
  const example = word.examples[0];
  return <View style={styles.answer}>
    <View style={{ gap: 6 }}><Text selectable style={styles.word}>{word.lemma}</Text><NounArticle partOfSpeech={word.partOfSpeech} gender={word.gender} /></View>
    <PronunciationButton key={word.wordId} lemma={word.lemma} />
    {(word.displayForm || label) && <View style={styles.grammar}>{word.displayForm && <Text style={styles.display}>{word.displayForm}</Text>}{label && <Text style={styles.label}>{label}</Text>}</View>}
    <View style={styles.meanings}>{word.meaningsZh.map((meaning, index) => <Text key={`${index}:${meaning}`} style={styles.meaning}>{meaning}</Text>)}</View>
    {!!usageHint(word) && <Text style={styles.label}>{usageHint(word)}</Text>}
    {example && <ExampleSentence {...example} />}
  </View>;
}
const styles = StyleSheet.create({ answer: { paddingVertical: 30, gap: 22 }, word: { fontSize: 38, fontWeight: '500', color: colors.text, lineHeight: 52 }, grammar: { gap: 8 }, display: { fontSize: 20, lineHeight: 28, color: colors.secondary }, label: { fontSize: 15, color: colors.secondary }, meanings: { gap: 10 }, meaning: { fontSize: 22, lineHeight: 32, color: colors.text } });
