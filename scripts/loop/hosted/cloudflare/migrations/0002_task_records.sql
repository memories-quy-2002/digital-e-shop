CREATE TABLE IF NOT EXISTS task_records (
  task_id TEXT PRIMARY KEY NOT NULL CHECK (length(task_id) BETWEEN 1 AND 80),
  repository_id INTEGER NOT NULL CHECK (repository_id > 0),
  issue_number INTEGER NOT NULL CHECK (issue_number > 0),
  generation INTEGER NOT NULL CHECK (generation > 0),
  version INTEGER NOT NULL CHECK (version > 0),
  state TEXT NOT NULL CHECK (length(state) BETWEEN 1 AND 32),
  record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (repository_id, issue_number, generation)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS task_records_state_updated_idx
  ON task_records (state, updated_at, task_id);

CREATE TABLE IF NOT EXISTS task_execution_leases (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES task_records (task_id) ON DELETE CASCADE,
  lease_owner TEXT NOT NULL CHECK (length(lease_owner) BETWEEN 1 AND 120),
  task_version INTEGER NOT NULL CHECK (task_version > 0),
  lease_until INTEGER NOT NULL CHECK (lease_until > 0)
) WITHOUT ROWID;
