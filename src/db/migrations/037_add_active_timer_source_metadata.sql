ALTER TABLE active_work_timers
ADD COLUMN source_metadata_json TEXT NOT NULL DEFAULT '{}';
