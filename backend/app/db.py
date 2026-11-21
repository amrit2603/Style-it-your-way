import sqlite3
from contextlib import contextmanager
from pathlib import Path


class Database:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / "vyumi.sqlite3"
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, csrf TEXT NOT NULL,
                    role TEXT NOT NULL, expires INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY, sku TEXT UNIQUE NOT NULL, draft TEXT NOT NULL,
                    published TEXT, updated INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL,
                    product_id TEXT, filename TEXT NOT NULL, mime TEXT NOT NULL,
                    width INTEGER, height INTEGER, expires INTEGER,
                    deleted INTEGER NOT NULL DEFAULT 0, source TEXT, created INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS pdfs (
                    id TEXT PRIMARY KEY REFERENCES assets(id), name TEXT NOT NULL, pages INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, operation TEXT NOT NULL,
                    product_id TEXT NOT NULL, version INTEGER NOT NULL,
                    reference_id TEXT NOT NULL, photo_id TEXT, prompt TEXT NOT NULL,
                    request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
                    status TEXT NOT NULL, prediction_id TEXT, result_id TEXT,
                    error_code TEXT, message TEXT, fixture INTEGER NOT NULL,
                    expires INTEGER, created INTEGER NOT NULL, updated INTEGER NOT NULL,
                    UNIQUE(owner,request_key)
                );
                CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY,value INTEGER NOT NULL);
                INSERT OR IGNORE INTO counters VALUES ('live_submissions',0);
                CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
                CREATE INDEX IF NOT EXISTS assets_expiry ON assets(expires);
            """)
            if "context" not in {
                row[1] for row in db.execute("PRAGMA table_info(jobs)")
            }:
                db.executescript(
                    (
                        Path(__file__).resolve().parents[1]
                        / "migrations/001_job_context.sql"
                    ).read_text()
                )
            if "user_id" not in {
                row[1] for row in db.execute("PRAGMA table_info(sessions)")
            }:
                db.executescript(
                    (
                        Path(__file__).resolve().parents[1]
                        / "migrations/002_commerce.sql"
                    ).read_text()
                )

    @contextmanager
    def connect(self, write=False):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=10000")
        try:
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
