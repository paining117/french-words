export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY NOT NULL,

  lemma TEXT NOT NULL,
  normalized_lemma TEXT NOT NULL,

  display_form TEXT,
  normalized_display_form TEXT NOT NULL DEFAULT '',

  part_of_speech TEXT,
  gender TEXT,

  primary_meaning_zh TEXT NOT NULL,

  cefr_level TEXT,

  source TEXT NOT NULL DEFAULT 'local',
  source_ref TEXT,

  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_words_lemma
ON words(normalized_lemma);

CREATE TABLE IF NOT EXISTS meanings (
  id TEXT PRIMARY KEY NOT NULL,

  word_id TEXT NOT NULL,

  meaning_zh TEXT NOT NULL,

  order_index INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY(word_id)
    REFERENCES words(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS examples (
  id TEXT PRIMARY KEY NOT NULL,

  word_id TEXT NOT NULL,

  french TEXT NOT NULL,
  chinese TEXT NOT NULL,

  source TEXT NOT NULL DEFAULT 'local',

  order_index INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY(word_id)
    REFERENCES words(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS word_books (
  id TEXT PRIMARY KEY NOT NULL,

  name TEXT NOT NULL,

  level TEXT,

  description TEXT,

  built_in INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS word_book_words (
  book_id TEXT NOT NULL,

  word_id TEXT NOT NULL,

  order_index INTEGER NOT NULL,

  PRIMARY KEY(book_id, word_id),

  FOREIGN KEY(book_id)
    REFERENCES word_books(id)
    ON DELETE CASCADE,

  FOREIGN KEY(word_id)
    REFERENCES words(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cards (
  word_id TEXT PRIMARY KEY NOT NULL,

  fsrs_card_json TEXT NOT NULL,

  due_at TEXT NOT NULL,

  last_review_at TEXT,

  first_learned_at TEXT,

  origin TEXT NOT NULL,

  suspended INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL,

  FOREIGN KEY(word_id)
    REFERENCES words(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cards_due
ON cards(due_at);

CREATE TABLE IF NOT EXISTS review_logs (
  id TEXT PRIMARY KEY NOT NULL,

  word_id TEXT NOT NULL,

  rating INTEGER NOT NULL,

  context TEXT NOT NULL,

  reviewed_at TEXT NOT NULL,

  fsrs_log_json TEXT NOT NULL,

  FOREIGN KEY(word_id)
    REFERENCES words(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checkins (
  local_date TEXT PRIMARY KEY NOT NULL,

  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,

  type TEXT NOT NULL,

  started_at TEXT NOT NULL,

  ended_at TEXT,

  total_count INTEGER NOT NULL DEFAULT 0,

  good_count INTEGER NOT NULL DEFAULT 0,

  hard_count INTEGER NOT NULL DEFAULT 0,

  again_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY NOT NULL,

  query TEXT NOT NULL,

  direction TEXT NOT NULL,

  searched_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_words_identity ON words(normalized_lemma, COALESCE(part_of_speech, ''));
CREATE INDEX IF NOT EXISTS idx_book_order ON word_book_words(book_id, order_index);
CREATE INDEX IF NOT EXISTS idx_meanings_word ON meanings(word_id);
CREATE INDEX IF NOT EXISTS idx_examples_word ON examples(word_id);
CREATE INDEX IF NOT EXISTS idx_reviews_time ON review_logs(reviewed_at);
`;
