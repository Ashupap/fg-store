
import { getDb } from '../lib/db';

const db = getDb();

function checkStock() {
    console.log('--- Checking Database Stock ---');

    // Check Stores
    const stores = db.prepare('SELECT * FROM stores').all();
    console.log(`\nFound ${stores.length} Stores:`);
    stores.forEach((s: any) => console.log(` - ${s.name} (ID: ${s.id}, Active: ${s.is_active})`));

    // Check Stock
    const stockCount = db.prepare('SELECT COUNT(*) as c FROM fg_stock_master').get() as any;
    console.log(`\nTotal Stock Entries: ${stockCount.c}`);

    if (stockCount.c > 0) {
        const sample = db.prepare('SELECT * FROM fg_stock_master LIMIT 5').all();
        console.log('\nSample Stock (First 5):');
        console.table(sample);

        // Group by Store
        const byStore = db.prepare('SELECT cold_store, COUNT(*) as c FROM fg_stock_master GROUP BY cold_store').all();
        console.log('\nStock by Store:');
        console.table(byStore);
    } else {
        console.log('No stock found in fg_stock_master.');
    }

    // Check Stock Movement Log
    const movements = db.prepare('SELECT COUNT(*) as c FROM stock_movement_log').get() as any;
    console.log(`\nTotal Stock Movements Logged: ${movements.c}`);
}

checkStock();
