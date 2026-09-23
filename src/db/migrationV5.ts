import type { Connection } from './connection';

export async function migrateV5(db: Connection): Promise<void> {
  await db.execAsync(`
    ALTER TABLE sessions ADD COLUMN manual_count INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE familiar_marks (
      word_id TEXT PRIMARY KEY NOT NULL REFERENCES words(id),
      previous_card_json TEXT,
      marked_card_json TEXT NOT NULL,
      round_id TEXT NOT NULL,
      restore_json TEXT NOT NULL,
      marked_at TEXT NOT NULL
    );
    CREATE TABLE familiar_actions (
      token TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      word_id TEXT NOT NULL
    );
    CREATE TABLE study_completion (
      round_id TEXT PRIMARY KEY NOT NULL REFERENCES study_rounds(round_id),
      stage TEXT NOT NULL CHECK(stage IN ('choice', 'spelling', 'summary')),
      spelling_json TEXT
    );
    CREATE INDEX idx_review_word_day ON review_logs(word_id, context, reviewed_at);
    DELETE FROM settings WHERE key = 'dev_date_offset_days';
    INSERT OR IGNORE INTO word_books (id, name, description, built_in, created_at)
      VALUES ('my-familiar', '我的熟词本', '已标熟的单词，可撤回标记', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    PRAGMA user_version = 5;
  `);
}
