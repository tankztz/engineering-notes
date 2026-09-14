CREATE TABLE IF NOT EXISTS lessons (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  repo TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  document TEXT NOT NULL,
  search_text TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  document TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sources (
  repo TEXT PRIMARY KEY,
  branch TEXT NOT NULL DEFAULT 'main',
  cursor TEXT NOT NULL,
  checked_at TEXT,
  error TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  commits INTEGER NOT NULL,
  lessons INTEGER NOT NULL,
  finished_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS lessons_fts USING fts5(slug UNINDEXED, title, summary, search_text);
CREATE TRIGGER IF NOT EXISTS lessons_ai AFTER INSERT ON lessons BEGIN
  INSERT INTO lessons_fts(slug, title, summary, search_text) VALUES(new.slug, new.title, new.summary, new.search_text);
END;
CREATE TRIGGER IF NOT EXISTS lessons_au AFTER UPDATE ON lessons BEGIN
  DELETE FROM lessons_fts WHERE slug = old.slug;
  INSERT INTO lessons_fts(slug, title, summary, search_text) VALUES(new.slug, new.title, new.summary, new.search_text);
END;
