PRAGMA foreign_keys = ON;

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
  join_code_hash TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'INR' CHECK(length(currency) = 3),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(household_id, name)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  paid_by_member_id TEXT NOT NULL REFERENCES members(id),
  created_by_member_id TEXT NOT NULL REFERENCES members(id),
  description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 100),
  category TEXT NOT NULL CHECK(category IN ('groceries','rent','utilities','food','transport','home','other')),
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  expense_date TEXT NOT NULL,
  notes TEXT CHECK(notes IS NULL OR length(notes) <= 400),
  client_mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(household_id, client_mutation_id)
);

CREATE TABLE expense_shares (
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id),
  amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
  PRIMARY KEY(expense_id, member_id)
);

CREATE TABLE transfers (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  from_member_id TEXT NOT NULL REFERENCES members(id),
  to_member_id TEXT NOT NULL REFERENCES members(id),
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  transfer_date TEXT NOT NULL,
  note TEXT CHECK(note IS NULL OR length(note) <= 200),
  client_mutation_id TEXT NOT NULL,
  created_by_member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK(from_member_id <> to_member_id),
  UNIQUE(household_id, client_mutation_id)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  actor_member_id TEXT REFERENCES members(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_members_household ON members(household_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash, expires_at);
CREATE INDEX idx_expenses_household_date ON expenses(household_id, expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_shares_member ON expense_shares(member_id);
CREATE INDEX idx_transfers_household_date ON transfers(household_id, transfer_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_audit_household_created ON audit_events(household_id, created_at DESC);
