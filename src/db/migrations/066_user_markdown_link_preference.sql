ALTER TABLE users
ADD COLUMN open_external_links_new_tab INTEGER NOT NULL DEFAULT 0 CHECK (open_external_links_new_tab IN (0, 1));
