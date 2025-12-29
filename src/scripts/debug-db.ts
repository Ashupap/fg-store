import Database from 'better-sqlite3';

const db = new Database('./data/fg-store.db');

console.log('Tables:', db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all());
console.log('Master data count:', db.prepare('SELECT COUNT(*) as c FROM master_data').get());
console.log('Sample ALL:', db.prepare('SELECT * FROM master_data LIMIT 3').all());
console.log('Distinct grades:', db.prepare('SELECT DISTINCT grade FROM master_data').all());
console.log('Distinct types:', db.prepare('SELECT DISTINCT type FROM master_data').all());
console.log('Distinct varieties:', db.prepare('SELECT DISTINCT variety FROM master_data').all());

db.close();
