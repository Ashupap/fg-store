import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'fg-store.db');
const db = new Database(dbPath);

console.log('🔄 Starting FCL Migration (Packing -> Variety)...');

try {
    // 1. Get all varieties
    const varieties = db.prepare("SELECT DISTINCT variety FROM master_data WHERE variety IS NOT NULL AND variety != ''").all() as { variety: string }[];
    
    console.log(`Found ${varieties.length} varieties to update.`);

    // 2. Transaction to update data
    const update = db.transaction(() => {
        // Set default FCL (100) for all varieties
        // In a real scenario, we might want to map specific values, but we'll start with a safe default
        const resultVariety = db.prepare(`
            UPDATE master_data 
            SET mcs_per_fcl = 100 
            WHERE variety IS NOT NULL AND variety != ''
        `).run();
        
        console.log(`✅ Updated ${resultVariety.changes} variety records with default FCL (100).`);

        // Clear FCL from packing/grade/type/cold_store combinations
        const resultPacking = db.prepare(`
            UPDATE master_data 
            SET mcs_per_fcl = NULL 
            WHERE packing IS NOT NULL
        `).run();

        console.log(`✅ Cleared FCL from ${resultPacking.changes} packing/other records.`);
    });

    update();
    console.log('✨ Migration completed successfully.');

} catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
}
