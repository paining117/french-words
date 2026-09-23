import { StyleSheet, Text } from 'react-native';
import { definiteArticle } from '../../utils/wordLabel';
import { colors } from '../../theme/colors';

export function NounArticle({ partOfSpeech, gender }: { partOfSpeech?: string; gender?: 'm' | 'f' }) {
  const article = definiteArticle(partOfSpeech, gender);
  return article ? <Text style={styles.article}>{article}</Text> : null;
}
const styles = StyleSheet.create({ article: { fontSize: 14, lineHeight: 20, color: colors.secondary } });
