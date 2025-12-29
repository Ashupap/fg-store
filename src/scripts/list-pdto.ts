
import Database from 'better-sqlite3';

const db = new Database('data/fg-store.db');

console.log('--- Master Data for PDTO ---');
const rows = db.prepare("SELECT * FROM master_data WHERE variety = 'PDTO'").all();
console.table(rows);
