
import { getDb } from '../lib/db';

const db = getDb();

console.log('Migrating store settings...');

try {
    // 1. Set Default Store Setting
    const defaultStoreKey = 'default_store';
    const defaultStoreValue = 'FG Store';

    const checkSetting = db.prepare("SELECT key FROM system_settings WHERE key = ?").get(defaultStoreKey);

    if (!checkSetting) {
        db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?)").run(defaultStoreKey, defaultStoreValue);
        console.log(`Inserted setting: ${defaultStoreKey} = ${defaultStoreValue}`);
    } else {
        console.log(`Setting ${defaultStoreKey} already exists.`);
    }

    // 2. Add 'Production' to master_data if not exists
    // We treat 'Production' as a cold_store for dropdown purposes
    const productionStore = 'Production';
    const checkStore = db.prepare("SELECT cold_store FROM master_data WHERE cold_store = ?").get(productionStore);

    if (!checkStore) {
        // We need to insert a row with distinct cold_store. 
        // We can leave other fields null or generic since we only query DISTINCT cold_store.
        // However, to be safe, let's just make sure it's available.
        // Actually, if we just want it in the list, we can add a dummy entry or just rely on the API injecting it.
        // But the user said "I also added 'Production' to cold store list", so let's add it to DB.
        db.prepare("INSERT INTO master_data (cold_store) VALUES (?)").run(productionStore);
        console.log(`Added '${productionStore}' to master_data cold_stores.`);
    } else {
        console.log(`Store '${productionStore}' already exists.`);
    }

    // 3. Ensure 'FG Store' exists
    const fgStore = 'FG Store';
    const checkFg = db.prepare("SELECT cold_store FROM master_data WHERE cold_store = ?").get(fgStore);
    if (!checkFg) {
        db.prepare("INSERT INTO master_data (cold_store) VALUES (?)").run(fgStore);
        console.log(`Added '${fgStore}' to master_data cold_stores.`);
    }

    console.log('Store settings migration completed.');

} catch (error) {
    console.error('Migration failed:', error);
}
