ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN alt_email TEXT;
ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/New_York';

UPDATE users
SET username = '[REDACTED]',
    display_name = 'Super Admin',
    alt_email = NULL,
    timezone = 'America/New_York'
WHERE username = 'sadmin';

UPDATE users
SET display_name = 'Super Admin',
    timezone = 'America/New_York'
WHERE username = '[REDACTED]'
  AND (display_name = '' OR timezone = '');

UPDATE sessions
SET username = '[REDACTED]'
WHERE username = 'sadmin';

UPDATE users
SET username = '[REDACTED]',
    display_name = 'Mike York',
    alt_email = '[REDACTED]',
    timezone = 'America/New_York'
WHERE username = 'Mike';

UPDATE users
SET display_name = 'Mike York',
    alt_email = '[REDACTED]',
    timezone = 'America/New_York'
WHERE username = '[REDACTED]'
  AND (display_name = '' OR timezone = '' OR alt_email IS NULL);

UPDATE sessions
SET username = '[REDACTED]'
WHERE username = 'Mike';
