import { appNow } from './appClock';
export function localDate(date = appNow()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localDayBounds(now = appNow()): { start: string; end: string } {
  // Local calendar midnights converted to UTC; a DST day can be 23 or 25 hours.
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  return { start: new Date(year, month, day).toISOString(), end: new Date(year, month, day + 1).toISOString() };
}
export function previousLocalDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  // Calendar arithmetic, deliberately not subtraction of 24 hours (DST).
  return localDate(new Date(year, month - 1, day - 1, 12));
}
export function checkinStreak(dates: string[], today = localDate()): number {
  const checked = new Set(dates);
  let cursor = checked.has(today) ? today : previousLocalDate(today);
  let count = 0;
  while (checked.has(cursor)) {
    count += 1;
    cursor = previousLocalDate(cursor);
  }
  return count;
}
