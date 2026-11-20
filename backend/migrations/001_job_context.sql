-- Add durable provider/input snapshots without changing existing jobs or products.
ALTER TABLE jobs ADD COLUMN context TEXT NOT NULL DEFAULT '{}';
