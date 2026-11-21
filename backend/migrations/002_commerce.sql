BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('customer','admin')),
    created INTEGER NOT NULL
);
ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id);
CREATE TABLE IF NOT EXISTS login_attempts (email TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS login_attempts_email ON login_attempts(email,created);
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, total INTEGER NOT NULL,
    currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    name TEXT NOT NULL, address TEXT NOT NULL, phone TEXT NOT NULL,
    created INTEGER NOT NULL, UNIQUE(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
    product_id TEXT NOT NULL, name TEXT NOT NULL, sku TEXT NOT NULL,
    quantity INTEGER NOT NULL, price INTEGER NOT NULL, size TEXT NOT NULL, color TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS library_images (
    id TEXT PRIMARY KEY, asset_id TEXT UNIQUE NOT NULL REFERENCES assets(id),
    kind TEXT NOT NULL CHECK(kind IN ('stock_model','room_template')),
    label TEXT NOT NULL, gender TEXT NOT NULL DEFAULT 'unisex',
    body_type TEXT NOT NULL DEFAULT '', room_type TEXT NOT NULL DEFAULT '',
    created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS multipart_requests (
    owner TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
    photo_id TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(owner,request_key)
);
COMMIT;
