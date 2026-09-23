import { StudyCompletion } from '../src/components/word/StudyCompletion';
import { useState } from 'react';
import { WordActionHeader } from '../src/components/word/WordActions';
import { useFamiliarAdvance } from '../src/hooks/useFamiliarAdvance';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LearningScreen } from '../src/components/common/LearningScreen';
import { useStudySession } from '../src/hooks/useStudySession';
import { AppButton } from '../src/components/common/AppButton';
import { ReinforcementPrompt } from '../src/components/word/ReinforcementPrompt';
import { ReinforcementStars } from '../src/components/word/ReinforcementStars';
import { isReinforcement, studyPhase } from '../src/services/studyQueue';
import { WordAnswer } from '../src/components/word/WordAnswer';
import { RatingButtons } from '../src/components/word/RatingButtons';
import { StudySummary } from '../src/components/word/StudySummary';
import { colors } from '../src/theme/colors';
import { useChoiceFeedback } from '../src/hooks/useChoiceFeedback';

export default function StudyScreen() {
  const { view, pending, feedback, retry, rate, choose, next, familiar, sessionId } = useStudySession();
  const [adding, setAdding] = useState(false);
  const active = view.status === 'prompt' || view.status === 'answer';
  useFamiliarAdvance(view.status === 'answer' && view.familiar ? view.token : null, next);
  const choiceFeedback = useChoiceFeedback(view.status === 'answer' && !view.familiar ? view : null);
  const showingChoices = active && !view.familiar && studyPhase(view.item) === 'choice' && (view.status === 'prompt' || choiceFeedback.visible);
  const actions = <WordActionHeader wordId={active ? view.item.word.wordId : undefined} familiar={active ? view.familiar : undefined}
    disabled={!active || pending || adding || !!view.familiar} onBusyChange={setAdding}
    onFamiliar={() => { if (active) void familiar(view.token); }} />;
  if (view.status === 'completed' && sessionId) return <>{actions}<StudyCompletion key={sessionId} roundId={sessionId} result={view} onContinue={retry} /></>;
  return <LearningScreen>
    {actions}
    {active && <View style={styles.progress}><Text accessibilityLabel={`本轮已掌握 ${view.masteredCount} 个，共 ${view.total} 个新词`} style={styles.progressText}>{view.masteredCount} / {view.total}</Text>{isReinforcement(view.item) && <ReinforcementStars filled={view.item.stars ?? 0} />}</View>}
    {view.status === 'completed' ? <StudySummary result={view} /> : <ScrollView key={active ? `${view.token}:${choiceFeedback.visible ? 'prompt' : view.status}` : view.status} contentContainerStyle={[styles.content, showingChoices && { paddingHorizontal: 16 }]}>
      {view.status === 'loading' && <View style={styles.center}><ActivityIndicator color={colors.forest} /><Text style={styles.muted}>正在准备学习内容…</Text></View>}
      {active && (view.status === 'prompt' || choiceFeedback.visible) && <ReinforcementPrompt item={view.item} disabled={pending || adding} selectedChoiceId={view.status === 'answer' ? view.selectedChoiceId : undefined} onChoose={id => { void choose(view.token, id); }} />}
      {view.status === 'answer' && !choiceFeedback.visible && <WordAnswer word={view.item.word} />}
      {view.status === 'empty' && <View style={styles.center}><Text accessibilityRole="header" style={styles.title}>{view.reason === 'quota-complete' ? '今日学习已完成' : '当前词书已学完'}</Text></View>}
      {view.status === 'error' && <View style={styles.center}><Text style={styles.title}>{view.message}</Text></View>}
    </ScrollView>}
    <View style={[styles.footer, showingChoices && { minHeight: 84 }]}>
      {feedback && <Text accessibilityLiveRegion="polite" style={styles.error}>{feedback}</Text>}
      {view.status === 'prompt' && <>{studyPhase(view.item) !== 'choice' && <RatingButtons binary disabled={pending || adding} onRate={rating => { void rate(view.token, rating); }} />}{pending && <Text style={styles.saving}>正在保存…</Text>}</>}
      {view.status === 'answer' && <AppButton title={pending && !choiceFeedback.visible ? '正在保存…' : '继续'} disabled={pending || adding} onPress={choiceFeedback.visible ? choiceFeedback.reveal : () => { void next(view.token); }} />}
      {view.status === 'error' && <AppButton title="重试" onPress={retry} />}
      {view.status === 'completed' && <AppButton title="继续学习" onPress={retry} />}
      {(view.status === 'completed' || view.status === 'empty' || view.status === 'error') && <AppButton title="返回首页" subtle={view.status === 'error'} onPress={() => router.dismissTo('/')} />}
    </View>
  </LearningScreen>;
}
const styles = StyleSheet.create({ progress: { paddingHorizontal: 28, paddingTop: 18, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }, progressText: { color: colors.secondary, fontSize: 15, fontVariant: ['tabular-nums'] }, content: { paddingHorizontal: 28, paddingBottom: 24, flexGrow: 1 }, center: { flexGrow: 1, minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: 20 }, title: { fontSize: 26, lineHeight: 38, color: colors.text, fontWeight: '500', textAlign: 'center' }, muted: { color: colors.secondary, fontSize: 15, lineHeight: 25, textAlign: 'center' }, footer: { gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }, error: { color: colors.error, fontSize: 14, lineHeight: 22, textAlign: 'center' }, saving: { color: colors.secondary, textAlign: 'center', fontSize: 12 } });
