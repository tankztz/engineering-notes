CREATE TABLE web_sessions (
  token_hash TEXT PRIMARY KEY,
  auth_cookie TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE shares (
  slug TEXT NOT NULL REFERENCES lessons(slug) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (slug, user_id)
);
