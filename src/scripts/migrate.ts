// Migration script to add type and variety columns to po_line_items table
import Database from 'better-sqlite3';

const db = new Database('./data/fg-store.db');

console.log('Starting migration...');

// Check if columns exist
const tableInfo = db.prepare('PRAGMA table_info(po_line_items)').all() as { name: string }[];
const columnNames = tableInfo.map(col => col.name);

if (!columnNames.includes('type')) {
    console.log('Adding type column...');
    db.exec("ALTER TABLE po_line_items ADD COLUMN type TEXT NOT NULL DEFAULT ''");
    console.log('type column added');
} else {
    console.log('type column already exists');
}

if (!columnNames.includes('variety')) {
    console.log('Adding variety column...');
    db.exec("ALTER TABLE po_line_items ADD COLUMN variety TEXT NOT NULL DEFAULT ''");
    console.log('variety column added');
} else {
    console.log('variety column already exists');
}

console.log('Migration complete!');
console.log('Updated schema:', db.prepare('PRAGMA table_info(po_line_items)').all());

db.close();
