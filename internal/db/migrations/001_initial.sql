CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    oidc_issuer TEXT,
    oidc_subject TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_users_oidc
    ON users (oidc_issuer, oidc_subject)
    WHERE oidc_issuer IS NOT NULL AND oidc_subject IS NOT NULL;

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL DEFAULT 'cookie' CHECK (kind IN ('cookie', 'bearer')),
    user_agent TEXT,
    ip_address TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_categories_parent_id ON categories (parent_id);

CREATE TABLE locations (
    id INTEGER PRIMARY KEY,
    legacy_uuid TEXT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    is_freezer INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_locations_parent_id ON locations (parent_id);
CREATE UNIQUE INDEX idx_locations_legacy_uuid
    ON locations (legacy_uuid)
    WHERE legacy_uuid IS NOT NULL;

CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    legacy_uuid TEXT,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    default_location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    default_due_days INTEGER,
    default_due_days_on_open INTEGER,
    default_due_days_on_freeze INTEGER,
    default_due_days_on_thaw INTEGER,
    use_average_for_due_date INTEGER NOT NULL DEFAULT 0,
    label_print_mode TEXT NOT NULL DEFAULT 'per_item' CHECK (label_print_mode IN ('none', 'single', 'per_item')),
    minimum_value INTEGER,
    manually_added_to_shopping_list INTEGER NOT NULL DEFAULT 0,
    volume_value REAL,
    volume_unit TEXT,
    weight_value REAL,
    weight_unit TEXT,
    length_value REAL,
    length_unit TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_products_category_id ON products (category_id);
CREATE INDEX idx_products_default_location_id ON products (default_location_id);
CREATE UNIQUE INDEX idx_products_legacy_uuid
    ON products (legacy_uuid)
    WHERE legacy_uuid IS NOT NULL;

CREATE VIRTUAL TABLE products_fts USING fts5(
    name,
    content='products',
    content_rowid='id',
    tokenize='trigram'
);

CREATE TRIGGER products_ai AFTER INSERT ON products BEGIN
    INSERT INTO products_fts(rowid, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER products_ad AFTER DELETE ON products BEGIN
    INSERT INTO products_fts(products_fts, rowid, name) VALUES ('delete', old.id, old.name);
END;

CREATE TRIGGER products_au AFTER UPDATE OF name ON products BEGIN
    INSERT INTO products_fts(products_fts, rowid, name) VALUES ('delete', old.id, old.name);
    INSERT INTO products_fts(rowid, name) VALUES (new.id, new.name);
END;

CREATE TABLE variants (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    volume_value REAL,
    volume_unit TEXT,
    weight_value REAL,
    weight_unit TEXT,
    length_value REAL,
    length_unit TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_variants_product_id ON variants (product_id);

CREATE TABLE barcodes (
    id INTEGER PRIMARY KEY,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    barcode TEXT NOT NULL UNIQUE,
    default_quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_barcodes_variant_id ON barcodes (variant_id);

CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    legacy_uuid TEXT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES variants(id) ON DELETE SET NULL,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    purchased_on_date TEXT,
    opened_on_date TEXT,
    due_on_date TEXT,
    consumed_on_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_items_product_id ON items (product_id);
CREATE INDEX idx_items_variant_id ON items (variant_id);
CREATE INDEX idx_items_location_id ON items (location_id);
CREATE INDEX idx_items_consumed_due ON items (consumed_on_date, due_on_date);
CREATE UNIQUE INDEX idx_items_legacy_uuid
    ON items (legacy_uuid)
    WHERE legacy_uuid IS NOT NULL;

CREATE TABLE printers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    driver TEXT NOT NULL DEFAULT 'ipp_zpl' CHECK (driver IN ('ipp_zpl', 'raw_tcp_zpl')),
    endpoint TEXT NOT NULL,
    printer_model TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE label_templates (
    entity_type TEXT PRIMARY KEY CHECK (entity_type IN ('item', 'product', 'location')),
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
