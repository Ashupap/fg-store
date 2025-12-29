
import Database from 'better-sqlite3';

const db = new Database('data/fg-store.db');

console.log('--- Checking for mcs_per_fcl = 100 ---');
const rows = db.prepare("SELECT * FROM master_data WHERE mcs_per_fcl = 100").all();
console.table(rows);

console.log('\n--- Checking for mcs_per_fcl = 500 ---');
// BME calculation: 200 MCs used. 48 Tons Used.
// 48/200 = 0.24. Same weight!
// So BME stock (which might be 'V2' or something) ALSO resolves to 0.24.
// BBSR: 120 MCs. 28.8 Tons.
// 28.8/120 = 0.24.

// IT SEEMS ALL VARITIES ARE RESOLVING TO 0.24 Tons/MC.
// This means weightMap.get() is RETURNING 0.24 for EVERY KEY?
// Or DEFAULT_WEIGHT_PER_MC is 0.24?

// Let's check the source code again via view_file.
