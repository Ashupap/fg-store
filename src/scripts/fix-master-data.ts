
import Database from 'better-sqlite3';

const db = new Database('data/fg-store.db');

console.log('--- Updating Master Data ---');

// Check existing value
const before = db.prepare("SELECT * FROM master_data WHERE variety = 'PDTO' AND packing = '5 X 2 LBS'").get();
console.log('Before:', before);

// Update to realistic value (5280 MCs per FCL for 10lbs cases)
const info = db.prepare("UPDATE master_data SET mcs_per_fcl = 5280 WHERE variety = 'PDTO' AND packing = '5 X 2 LBS'").run();
console.log('Updated rows:', info.changes);

const after = db.prepare("SELECT * FROM master_data WHERE variety = 'PDTO' AND packing = '5 X 2 LBS'").get();
console.log('After:', after);
