CREATE TABLE product_merges (
    source_product_id INTEGER PRIMARY KEY,
    source_legacy_uuid TEXT,
    target_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    merged_at TEXT NOT NULL
);

CREATE INDEX idx_product_merges_target_product_id ON product_merges (target_product_id);
CREATE UNIQUE INDEX idx_product_merges_source_legacy_uuid
    ON product_merges (source_legacy_uuid)
    WHERE source_legacy_uuid IS NOT NULL;
