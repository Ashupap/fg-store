import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'fg-store.db');
const db = new Database(dbPath);

console.log('🧹 Starting Test Data Setup...');

// 1. Clear Transaction Tables
console.log('Deleting transaction data...');
db.pragma('foreign_keys = OFF'); // Disable FKs to allow clearing
db.exec('DELETE FROM stock_movement_log');
db.exec('DELETE FROM fg_stock_master');
db.exec('DELETE FROM po_line_items');
db.exec('DELETE FROM purchase_orders');
db.pragma('foreign_keys = ON'); // Re-enable

// Reset Sequences (Optional but cleaner)
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('stock_movement_log', 'fg_stock_master', 'po_line_items', 'purchase_orders')");

console.log('✅ Transaction tables cleared.');

// 2. Add Grades
const gradesToAdd = [
    '13/15',
    '16/20',
    '21/25',
    '26/30',
    '31/40',
    '41/50',
    '51/60',
    '61/70',
    '71/90',
    '91/110'
];

console.log('Adding specific grades...');

const insertGrade = db.prepare(`
    INSERT INTO master_data (grade) 
    SELECT ? 
    WHERE NOT EXISTS (SELECT 1 FROM master_data WHERE grade = ?)
`);

let addedCount = 0;
for (const grade of gradesToAdd) {
    const result = insertGrade.run(grade, grade);
    if (result.changes > 0) {
        addedCount++;
    }
}

console.log(`✅ Added ${addedCount} new grades.`);
console.log(`ℹ️  Total target grades confirmed: ${gradesToAdd.length}`);

console.log('🎉 Test Data Setup Complete!');
