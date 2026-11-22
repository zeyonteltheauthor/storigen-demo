-- Grade Along school accounts (Phase 1). No story text, photos or PDFs are stored.
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  paper_allowance INTEGER NOT NULL DEFAULT 0,
  papers_used INTEGER NOT NULL DEFAULT 0,
  license_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  teachers_own_rubrics INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(school_id, email)
);
CREATE INDEX IF NOT EXISTS teachers_school ON teachers(school_id);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS invites_teacher ON invites(teacher_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  school_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_teacher ON sessions(teacher_id);
CREATE INDEX IF NOT EXISTS sessions_school ON sessions(school_id);

CREATE TABLE IF NOT EXISTS rubrics (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  name TEXT NOT NULL,
  min INTEGER NOT NULL,
  max INTEGER NOT NULL,
  rows_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rubrics_school ON rubrics(school_id);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  papers INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_school ON usage_events(school_id, created_at);

CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  facilitator TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  assessment TEXT NOT NULL,
  rubric_id TEXT NOT NULL DEFAULT '',
  rubric_name TEXT NOT NULL DEFAULT '',
  scores_json TEXT NOT NULL,
  total REAL,
  out_of REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_school ON scores(school_id);
CREATE INDEX IF NOT EXISTS scores_lookup ON scores(school_id, teacher_id, first_name, grade, date, assessment, rubric_id);
