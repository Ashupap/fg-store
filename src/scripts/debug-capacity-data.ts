
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('data/fg-store.db');

console.log('--- Stock in AME ---');
const stock = db.prepare(`
    SELECT variety, packing_code, count(*) as c 
    FROM fg_stock_master 
    WHERE cold_store='AME' 
    GROUP BY variety, packing_code
`).all();
console.table(stock);

console.log('\n--- Master Data ---');
const master = db.prepare(`
    SELECT variety, packing, mcs_per_fcl 
    FROM master_data 
    WHERE mcs_per_fcl IS NOT NULL
`).all();
console.table(master);

// Emulate the matching logic
const weightMap = new Map();
master.forEach((md: any) => {
    const pCode = md.packing ? md.packing.replace(/\s+/g, '').toUpperCase() : 'UNKNOWN';
    const key = `${md.variety}|${pCode}`;
    weightMap.set(key, 24 / md.mcs_per_fcl);
    console.log(`Mapping: ${key} -> ${24 / md.mcs_per_fcl} Tons/MC (FCL: ${md.mcs_per_fcl})`);
});
