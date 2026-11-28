CREATE TABLE notification_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    digest_time TEXT NOT NULL DEFAULT '08:30',
    expiration_enabled INTEGER NOT NULL DEFAULT 0 CHECK (expiration_enabled IN (0, 1)),
    shopping_list_enabled INTEGER NOT NULL DEFAULT 0 CHECK (shopping_list_enabled IN (0, 1)),
    expiration_last_sent_date TEXT,
    shopping_list_last_sent_date TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE notification_targets (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('web_push')),
    label TEXT NOT NULL DEFAULT '',
    config_json TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    last_error TEXT,
    UNIQUE (user_id, channel, dedupe_key)
);

CREATE INDEX idx_notification_targets_user_id ON notification_targets (user_id);
