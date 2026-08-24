-- Per-day working hours for a shift.
-- Shape: { "days": [{ "day": 1, "start": "09:00", "end": "17:00" }, ...] }
-- where "day" is 0 (Sunday) .. 6 (Saturday). NULL means "use the shift type's default hours".
ALTER TABLE courses ADD COLUMN IF NOT EXISTS schedule jsonb;

COMMENT ON COLUMN courses.schedule IS
  'Per-weekday working hours: {"days":[{"day":0-6,"start":"HH:MM","end":"HH:MM"}]}. NULL = default hours from level (shift type).';
