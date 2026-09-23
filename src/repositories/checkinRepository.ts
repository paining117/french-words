import type { Connection } from '../db/connection';
import { checkinStreak, localDate } from '../utils/date';
import { appNow } from '../utils/appClock';

export async function insertCheckin(db: Connection, now = appNow()): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO checkins (local_date, created_at) VALUES (?, ?)', localDate(now), now.toISOString());
}
export async function getCheckinStatus(db: Connection, now = appNow()) {
  const today = localDate(now);
  const rows = await db.getAllAsync<{ local_date: string }>('SELECT local_date FROM checkins WHERE local_date <= ? ORDER BY local_date DESC', today);
  const dates = rows.map(row => row.local_date);
  return { checkedIn: dates.includes(today), streak: checkinStreak(dates, today) };
}
