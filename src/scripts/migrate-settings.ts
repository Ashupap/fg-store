
import { getDb } from '../lib/db';

const db = getDb();

console.log('Migrating system_settings table...');

try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Insert default setting if not exists
    const check = db.prepare("SELECT key FROM system_settings WHERE key = 'enable_barcode_scan'").get();
    if (!check) {
        db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?)").run('enable_barcode_scan', 'false');
        console.log('Inserted default setting: enable_barcode_scan = false');
    } else {
        console.log('Setting enable_barcode_scan already exists.');
    }

    console.log('Migration completed successfully.');
} catch (error) {
    console.error('Migration failed:', error);
}
