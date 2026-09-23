import type { Connection } from '../db/connection';
import type { DailyStudyRound } from '../types/study';

function decodeRound(row: { state_json: string; revision: number } | null) {
  if (!row || row.state_json === 'null') return null;
  const state = JSON.parse(row.state_json) as DailyStudyRound;
  if (!state.date || !state.sessionId || !Array.isArray(state.words) || !Array.isArray(state.queue) || !Array.isArray(state.masteredIds) || !state.snapshot || !state.baseSummary) throw new Error('Invalid study round');
  return { state, revision: row.revision };
}
export async function getStudyRound(db: Connection, date: string) {
  return decodeRound(await db.getFirstAsync('SELECT state_json, revision FROM study_rounds WHERE local_date = ? ORDER BY rowid DESC LIMIT 1', date));
}
export async function getStudyRoundById(db: Connection, id: string) {
  return decodeRound(await db.getFirstAsync('SELECT state_json, revision FROM study_rounds WHERE round_id = ?', id));
}
export async function getPendingStudyRound(db: Connection) {
  return decodeRound(await db.getFirstAsync("SELECT state_json, revision FROM study_rounds WHERE json_extract(state_json, '$.snapshot.status') <> 'completed' AND (json_extract(state_json, '$.bookId') IS NULL OR json_extract(state_json, '$.bookId') = (SELECT value FROM settings WHERE key = 'current_book_id')) ORDER BY rowid LIMIT 1"));
}
export async function saveStudyRound(db: Connection, state: DailyStudyRound, revision: number): Promise<void> {
  const result = await db.runAsync('UPDATE study_rounds SET state_json = ?, revision = revision + 1 WHERE round_id = ? AND revision = ?', JSON.stringify(state), state.sessionId, revision);
  if (result.changes !== 1) throw new Error('Daily round changed concurrently');
}
