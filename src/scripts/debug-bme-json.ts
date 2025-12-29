
import Database from 'better-sqlite3';

const db = new Database('data/fg-store.db');

console.log('--- Stock in BME ---');
const stock = db.prepare(`
    SELECT variety, packing_code, count(*) as c 
    FROM fg_stock_master 
    WHERE cold_store='BME' 
    GROUP BY variety, packing_code
`).all();
console.log(JSON.stringify(stock, null, 2));

console.log('\n--- Master Data for these Varieties ---');
stock.forEach((s: any) => {
    const rows = db.prepare("SELECT * FROM master_data WHERE variety = ?").all(s.variety);
    console.log(`Variety: ${s.variety}`);
    console.log(JSON.stringify(rows, null, 2));
});
