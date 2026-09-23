import type { Card } from 'ts-fsrs';

function restoreDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') throw new Error(`Invalid FSRS ${field}`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid FSRS ${field}`);
  return date;
}
export function serializeFsrsCard(card: Card): string {
  // Explicit ISO conversion validates Dates before JSON.stringify can turn NaN into null.
  return JSON.stringify({ ...card, due: card.due.toISOString(), last_review: card.last_review?.toISOString() });
}
export function deserializeFsrsCard(json: string): Card {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid FSRS card');
  const stored = value as Record<string, unknown>;
  const numericFields = ['stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'learning_steps', 'reps', 'lapses', 'state'] as const;
  for (const key of numericFields) {
    if (typeof stored[key] !== 'number' || !Number.isFinite(stored[key]) || stored[key] < 0) throw new Error(`Invalid FSRS ${key}`);
  }
  if (![0, 1, 2, 3].includes(stored.state as number)) throw new Error('Invalid FSRS state');
  for (const key of ['learning_steps', 'reps', 'lapses'] as const) if (!Number.isInteger(stored[key])) throw new Error(`Invalid FSRS ${key}`);
  const due = restoreDate(stored.due, 'due');
  const lastReview = stored.last_review === undefined ? undefined : restoreDate(stored.last_review, 'last_review');
  // Adapt only here; all required v5.4.2 numeric and Date fields have been checked.
  return { ...stored, due, last_review: lastReview } as Card;
}
