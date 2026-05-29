ALTER TABLE sessions ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/New_York';

UPDATE sessions
SET timezone = COALESCE((
  SELECT users.timezone
  FROM users
  WHERE users.organization_id = sessions.organization_id
    AND users.user_id = sessions.user_id
  LIMIT 1
), 'America/New_York');
