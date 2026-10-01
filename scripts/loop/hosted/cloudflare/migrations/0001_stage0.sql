CREATE TABLE IF NOT EXISTS delivery_records (
  delivery_id TEXT PRIMARY KEY NOT NULL CHECK (length(delivery_id) BETWEEN 1 AND 128),
  repository_id INTEGER NOT NULL CHECK (repository_id > 0),
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  event TEXT NOT NULL CHECK (length(event) BETWEEN 1 AND 50),
  action TEXT CHECK (action IS NULL OR length(action) BETWEEN 1 AND 50),
  received_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'processed', 'retry')),
  reason_code TEXT,
  updated_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS delivery_records_expiry_idx
  ON delivery_records (expires_at, delivery_id);

CREATE TABLE IF NOT EXISTS pr_states (
  repository_id INTEGER NOT NULL CHECK (repository_id > 0),
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  base_sha TEXT NOT NULL CHECK (length(base_sha) IN (40, 64)),
  head_sha TEXT NOT NULL CHECK (length(head_sha) IN (40, 64)),
  merge_sha TEXT CHECK (merge_sha IS NULL OR length(merge_sha) IN (40, 64)),
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repository_id, pr_number)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS check_run_mappings (
  repository_id INTEGER NOT NULL CHECK (repository_id > 0),
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  head_sha TEXT NOT NULL CHECK (length(head_sha) IN (40, 64)),
  check_run_id INTEGER NOT NULL CHECK (check_run_id > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repository_id, pr_number, head_sha)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS processing_leases (
  repository_id INTEGER NOT NULL CHECK (repository_id > 0),
  pr_number INTEGER NOT NULL CHECK (pr_number >= 0),
  lease_owner TEXT NOT NULL CHECK (length(lease_owner) BETWEEN 1 AND 128),
  lease_until INTEGER NOT NULL,
  PRIMARY KEY (repository_id, pr_number)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS reconciliation_state (
  repository_id INTEGER PRIMARY KEY NOT NULL CHECK (repository_id > 0),
  cursor_page INTEGER NOT NULL CHECK (cursor_page BETWEEN 1 AND 1000000),
  sweep_id TEXT,
  last_completed_at TEXT,
  updated_at TEXT NOT NULL
);
