export const DAILY_OPTIONS = Array.from({ length: 10 }, (_, index) => (index + 1) * 5);
export function isValidRoundSize(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value % 5 === 0;
}
export interface Settings { currentBookId: string; dailyNewWords: number }
