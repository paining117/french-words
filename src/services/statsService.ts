import type { Connection } from '../db/connection';
import { localDayBounds } from '../utils/date';
import { appNow } from '../utils/appClock';

export async function getReviewStats(db: Connection, now = appNow()) {
  const { start, end } = localDayBounds(now);
  const row = await db.getFirstAsync<{ today: number; total: number }>(`SELECT COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN reviewed_at >= ? AND reviewed_at < ? THEN 1 ELSE 0 END), 0) AS today
    FROM review_logs WHERE context = 'review'`, start, end);
  return { today: row?.today ?? 0, total: row?.total ?? 0 };
}
