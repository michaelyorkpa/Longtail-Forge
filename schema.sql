CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_settings (
  organization_id TEXT PRIMARY KEY,
  fiscal_year_start_month INTEGER NOT NULL,
  fiscal_year_start_day INTEGER NOT NULL,
  default_billing_rate TEXT NOT NULL,
  billing_period_type TEXT NOT NULL,
  billing_period_start_day INTEGER NOT NULL,
  rounding_enabled INTEGER NOT NULL,
  rounding_increment TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
