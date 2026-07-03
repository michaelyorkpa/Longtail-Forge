ALTER TABLE users
ADD COLUMN theme_auto_source TEXT NOT NULL DEFAULT 'system' CHECK (theme_auto_source IN ('system'));
