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

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id),
  UNIQUE (organization_id, username),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  billing_rate TEXT,
  billing_period_type TEXT,
  billing_period_start_day INTEGER,
  billing_rounding_enabled INTEGER,
  billing_rounding_increment TEXT,
  billing_contact_name TEXT NOT NULL,
  billing_contact_email TEXT NOT NULL,
  billing_contact_alternate_name TEXT NOT NULL,
  billing_contact_alternate_email TEXT NOT NULL,
  billing_contact_phone_number TEXT NOT NULL,
  billing_contact_alternate_phone_number TEXT NOT NULL,
  billing_contact_street_address_1 TEXT NOT NULL,
  billing_contact_street_address_2 TEXT NOT NULL,
  billing_contact_city TEXT NOT NULL,
  billing_contact_state TEXT NOT NULL,
  billing_contact_zip_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  billing_rate TEXT,
  billing_period_type TEXT,
  billing_period_start_day INTEGER,
  billing_rounding_enabled INTEGER,
  billing_rounding_increment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (organization_id, client_id) REFERENCES clients(organization_id, id)
);

CREATE TABLE IF NOT EXISTS time_entries (
  entry_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  description TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  duration_hours TEXT NOT NULL,
  invoice_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, entry_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
