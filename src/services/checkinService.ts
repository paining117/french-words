import type { Connection } from '../db/connection';
import { getCheckinStatus, insertCheckin } from '../repositories/checkinRepository';
import { appNow } from '../utils/appClock';
export async function checkIn(db: Connection, now = appNow()) {
  await insertCheckin(db, now);
  return getCheckinStatus(db, now);
}
