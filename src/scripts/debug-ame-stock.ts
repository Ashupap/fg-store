
import Database from 'better-sqlite3';

const db = new Database('data/fg-store.db');

console.log('--- AME Stock Breakdown ---');
const breakup = db.prepare(`
    SELECT status, grade, variety, packing_code, count(*) as count 
    FROM fg_stock_master 
    WHERE cold_store = 'AME' 
    GROUP BY status, grade, variety, packing_code
`).all();
console.table(breakup);
