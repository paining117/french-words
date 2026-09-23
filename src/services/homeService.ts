import type { Connection } from '../db/connection';
import { getSettings } from '../repositories/settingsRepository';
import { getBookProgress } from '../repositories/wordBookRepository';
import { getCheckinStatus } from '../repositories/checkinRepository';
import { countDueCards } from '../repositories/cardRepository';
import { getStudyQuota } from './studyQuota';
import { getPendingStudyRound, getStudyRound } from '../repositories/studyRoundRepository';
import { localDate } from '../utils/date';
import { filterUnavailableNewWords } from './studyService';
import { appNow } from '../utils/appClock';

export async function getHomeData(db: Connection, now = appNow()) {
  const settings = await getSettings(db);
  const [book, checkin, due, quota] = await Promise.all([getBookProgress(db, settings.currentBookId), getCheckinStatus(db, now), countDueCards(db, now), getStudyQuota(db, settings.dailyNewWords, now)]);
  if (!book) throw new Error('Current book missing');
  let round = await getPendingStudyRound(db);
  if (round) {
    round = { ...round, state: await filterUnavailableNewWords(db, round.state, settings.currentBookId) };
    if (!round.state.words.length) round = null;
  }
  const latest = round ?? await getStudyRound(db, localDate(now));
  const availableNewWords = round ? Math.max(0, round.state.words.length - round.state.snapshot.summary.total_count) : Math.min(settings.dailyNewWords, book.total - book.learned);
  return { book, checkin, due, dailyNewWords: settings.dailyNewWords, ...quota, availableNewWords,
    roundComplete: latest?.state.snapshot.status === 'completed', roundPending: !!round,
    remainingToMaster: round ? Math.max(0, round.state.words.length - round.state.masteredIds.length) : 0 };
}
export type HomeData = Awaited<ReturnType<typeof getHomeData>>;
