import type { Connection } from '../db/connection';
import { countFirstLearned } from '../repositories/cardRepository';
import { localDayBounds } from '../utils/date';
import { appNow } from '../utils/appClock';
export function remainingDailyQuota(daily: number, learned: number): number {
  return Math.max(0, daily - learned);
}
export async function getStudyQuota(db: Connection, daily: number, now = appNow()) {
  const { start, end } = localDayBounds(now);
  const learnedToday = await countFirstLearned(db, start, end);
  return { learnedToday, remainingToday: remainingDailyQuota(daily, learnedToday) };
}
