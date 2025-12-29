
import Database from 'better-sqlite3';

const db = new Database('data/fg-store.db');

console.log('--- Store AME ---');
const store = db.prepare("SELECT * FROM stores WHERE name = 'AME'").get();
console.log(store);
