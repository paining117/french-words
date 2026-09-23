import { useState } from 'react';
import { WordActionHeader } from '../src/components/word/WordActions';
import { useFamiliarAdvance } from '../src/hooks/useFamiliarAdvance';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../src/components/common/AppButton';
import { LearningScreen } from '../src/components/common/LearningScreen';
import { ReinforcementPrompt } from '../src/components/word/ReinforcementPrompt';
import { ReinforcementStars } from '../src/components/word/ReinforcementStars';
import { useChoiceFeedback } from '../src/hooks/useChoiceFeedback';
import { studyPhase } from '../src/services/studyQueue';
import { WordAnswer } from '../src/components/word/WordAnswer';
import { RatingButtons } from '../src/components/word/RatingButtons';
import { useReviewSession } from '../src/hooks/useReviewSession';
import { colors } from '../src/theme/colors';
import { SessionWordSummary } from '../src/components/word/StudySummary';

export default function ReviewScreen() {
  const { view, pending, feedback, retry, rate, choose, next, familiar } = useReviewSession();
  const [adding, setAdding] = useState(false);
  const active = view.status === 'prompt' || view.status === 'answer';
  useFamiliarAdvance(view.status === 'answer' && view.familiar ? view.token : null, next);
  const choiceFeedback = useChoiceFeedback(view.status === 'answer' && !view.familiar ? view : null);
  const showingChoices = active && !view.familiar && studyPhase(view.item) === 'choice' && (view.status === 'prompt' || choiceFeedback.visible);
  const actions = <WordActionHeader wordId={active ? view.item.word.wordId : undefined} familiar={active ? view.familiar : undefined}
    disabled={!active || pending || adding || !!view.familiar} onBusyChange={setAdding}
    onFamiliar={() => { if (active) void familiar(view.token); }} />;
  return <LearningScreen>
    {actions}
    {active && <View style={styles.progress}><Text style={styles.muted}>{view.reviewedCount} / {view.total}</Text><ReinforcementStars filled={view.item.stars ?? 0} /></View>}
    {view.status === 'completed' ? <SessionWordSummary words={view.words} footer={`今日复习 ${view.reviewedToday} 次`} /> : <ScrollView key={active ? `${view.token}:${choiceFeedback.visible ? 'prompt' : view.status}` : view.status} contentContainerStyle={[styles.content, showingChoices && { paddingHorizontal: 16 }]}>
      {view.status === 'loading' && <View style={styles.center}><ActivityIndicator color={colors.forest} /></View>}
      {active && (view.status === 'prompt' || choiceFeedback.visible) && <ReinforcementPrompt item={view.item} disabled={pending || adding} selectedChoiceId={view.status === 'answer' ? view.selectedChoiceId : undefined} onChoose={id => { void choose(view.token, id); }} />}
      {view.status === 'answer' && !choiceFeedback.visible && <WordAnswer word={view.item.word} />}
      {view.status === 'empty' && <View style={styles.center}><Text style={styles.title}>{view.skipped ? '部分复习内容暂时无法读取' : '当前暂无待复习单词'}</Text>{view.skipped > 0 && <Text style={styles.muted}>已有学习记录已保留</Text>}</View>}
      {view.status === 'error' && <View style={styles.center}><Text style={styles.title}>{view.message}</Text></View>}
    </ScrollView>}
    <View style={[styles.footer, showingChoices && { minHeight: 84 }]}>
      {feedback && <Text accessibilityLiveRegion="polite" style={styles.error}>{feedback}</Text>}
      {view.status === 'prompt' && studyPhase(view.item) !== 'choice' && <RatingButtons binary disabled={pending || adding} onRate={rating => { void rate(view.token, rating); }} />}
      {view.status === 'answer' && <AppButton title={pending && !choiceFeedback.visible ? '正在保存…' : '继续'} disabled={pending || adding} onPress={choiceFeedback.visible ? choiceFeedback.reveal : () => { void next(view.token); }} />}
      {view.status === 'error' && <AppButton title="重试" onPress={retry} />}
      {view.status === 'completed' && <AppButton title="继续复习" onPress={retry} />}
      {(view.status === 'completed' || view.status === 'empty' || view.status === 'error') && <AppButton title="返回首页" onPress={() => router.dismissTo('/')} />}
    </View>
  </LearningScreen>;
}
const styles = StyleSheet.create({
  progress: { paddingHorizontal: 28, paddingTop: 18, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  content: { paddingHorizontal: 28, paddingBottom: 24, flexGrow: 1 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  title: { fontSize: 26, color: colors.text, textAlign: 'center' },
  muted: { fontSize: 15, color: colors.secondary }, footer: { gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  error: { color: colors.error, textAlign: 'center' },
});
