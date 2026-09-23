import type { Direction } from '../types/dictionary';

export function normalizeFrench(value: string): string {
  return value.trim().normalize('NFC').toLocaleLowerCase('fr');
}
// Search only: do not use this lossy form for word IDs or deduplication (ou ≠ où).
export function foldFrenchSearch(value: string): string {
  return normalizeFrench(value).normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’‘ʼ]/g, "'").replace(/\s+/g, ' ');
}
export function detectDirection(query: string): Direction {
  return /\p{Script=Han}/u.test(query) ? 'zh-fr' : 'fr-zh';
}
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}
