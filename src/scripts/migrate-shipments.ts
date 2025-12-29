
import { getDb } from '../lib/db';

const db = getDb();

console.log('Migrating shipments tables...');

try {
    // Shipments Table
    db.exec(`
    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL UNIQUE,
      shipment_no TEXT NOT NULL,
      container_no TEXT NOT NULL,
      seal_no TEXT NOT NULL,
      status TEXT DEFAULT 'Created', -- Created, Loading, Shipped
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(po_id) REFERENCES purchase_orders(id)
    )
  `);

    // Shipment Items Table (Links specific MCs to a shipment)
    db.exec(`
    CREATE TABLE IF NOT EXISTS shipment_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shipment_id INTEGER NOT NULL,
        mc_number TEXT NOT NULL,
        is_loaded INTEGER DEFAULT 0, -- Boolean 0/1
        loaded_at TEXT,
        FOREIGN KEY(shipment_id) REFERENCES shipments(id),
        FOREIGN KEY(mc_number) REFERENCES fg_stock_master(mc_number)
    )
  `);

    // Add configuration setting
    const check = db.prepare("SELECT key FROM system_settings WHERE key = 'enable_container_planning'").get();
    if (!check) {
        db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?)").run('enable_container_planning', 'false');
        console.log('Inserted default setting: enable_container_planning = false');
    } else {
        console.log('Setting enable_container_planning already exists.');
    }

    console.log('Migration completed successfully.');
} catch (error) {
    console.error('Migration failed:', error);
}
