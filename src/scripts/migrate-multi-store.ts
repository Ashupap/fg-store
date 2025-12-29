
import { getDb } from '../lib/db';

const db = getDb();

function migrateMultiStore() {
    console.log('Starting Multi-Store DB Migration...');

    try {
        // 1. Create 'stores' table
        console.log('Creating table: stores...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS stores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                type TEXT DEFAULT 'Cold Store', -- 'Processing Unit', 'Cold Store', 'Rented'
                location TEXT,
                capacity_tons INTEGER DEFAULT 0,
                has_loading_facility INTEGER DEFAULT 0, -- Boolean using 0/1
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Create 'user_stores' table
        console.log('Creating table: user_stores...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_stores (
                user_id INTEGER,
                store_id INTEGER,
                assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, store_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
            )
        `);

        // 3. Add 'multi_store_mode' to system_settings if it doesn't exist
        // First check if table exists (it should from previous migrations)
        // Check if key exists
        const checkSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'multi_store_mode'").get();
        if (!checkSetting) {
            console.log("Seeding 'multi_store_mode' setting (disabled by default)...");
            db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?)").run('multi_store_mode', 'false');
        } else {
            console.log("'multi_store_mode' setting already exists.");
        }

        // 4. Migrate existing unique 'cold_store' values from 'master_data' to 'stores'
        console.log("Migrating existing cold stores from master_data...");
        const existingStores = db.prepare("SELECT DISTINCT cold_store FROM master_data WHERE cold_store IS NOT NULL AND cold_store != ''").all() as { cold_store: string }[];

        const insertStore = db.prepare(`
            INSERT OR IGNORE INTO stores (name, type, has_loading_facility) 
            VALUES (?, 'Cold Store', 0)
        `);

        let migratedCount = 0;
        for (const store of existingStores) {
            const res = insertStore.run(store.cold_store);
            if (res.changes > 0) migratedCount++;
        }
        console.log(`Migrated ${migratedCount} new stores.`);

        // 5. Ensure 'FG Store' and 'Production' exist and have correct types if possible
        // Update 'Production' to type 'Processing Unit' if it exists
        db.prepare("UPDATE stores SET type = 'Processing Unit' WHERE name = 'Production'").run();

        // Update 'FG Store' to have loading facility (default assumption)
        db.prepare("UPDATE stores SET has_loading_facility = 1 WHERE name = 'FG Store'").run();


        console.log('Multi-Store Migration Completed Successfully.');

    } catch (error) {
        console.error('Migration Failed:', error);
    }
}

migrateMultiStore();
