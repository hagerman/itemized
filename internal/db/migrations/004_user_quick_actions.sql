ALTER TABLE users
    ADD COLUMN quick_actions_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (quick_actions_enabled IN (0, 1));
