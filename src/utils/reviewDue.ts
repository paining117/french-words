import { appNow } from './appClock';
/** Calendar days in the device timezone; never round a ten-minute due to a day. */
export function reviewDueLabel(dueAt: string, now = appNow(), suspended = false, precision: 'time' | 'day' = 'time'): string {
  if (suspended) return '已暂停复习';
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime())) return precision === 'day' ? '待安排' : '复习时间暂不可用';
  const remaining = due.getTime() - now.getTime();
  if (remaining <= 0) return precision === 'day' ? '待复习' : '已到复习时间';
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  const days = day(due) - day(now);
  if (days > 0) return `${days} 天后复习`;
  if (precision === 'day') return '今天复习';
  const minutes = Math.ceil(remaining / 60000);
  return minutes < 60 ? `今天复习 · 约 ${minutes} 分钟后` : `今天复习 · 约 ${Math.ceil(minutes / 60)} 小时后`;
}
