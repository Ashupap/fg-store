import Database from 'better-sqlite3';
import path from 'path';
import { handleInward, handleTransfer } from '../lib/stock-logic';

const dbPath = path.join(process.cwd(), 'data', 'fg-store.db');
const db = new Database(dbPath);
const SUFFIX = Math.floor(Date.now() / 1000);

async function main() {
    console.log('🐞 Starting Stick Transfer Debug...');

    // 1. Inward Stock to A
    console.log('   Inwarding to debug_A...');
    await handleInward({
        toStore: 'debug_A',
        type: 'IQF',
        variety: 'PDTO',
        packing: '5 X 2 LBS',
        grade: '13/15',
        qty: 10,
        remarks: 'Debug Init'
    }, 1);

    // 2. Transfer A -> B
    console.log('   Transferring debug_A -> debug_B...');
    const res = await handleTransfer({
        fromStore: 'debug_A',
        toStore: 'debug_B',
        type: 'IQF',
        variety: 'PDTO',
        packing: '5 X 2 LBS',
        grade: '13/15',
        qty: 10
    }, 1);

    if (!res.success) {
        console.error('Transfer failed:', res.error);
        process.exit(1);
    }

    const moveId = res.moveId;
    console.log(`   Transfer Move ID: ${moveId}`);

    // Check Status
    const logBefore = db.prepare('SELECT status FROM stock_movement_log WHERE movement_id = ?').get(moveId) as any;
    console.log(`   Status Before Accept: ${logBefore.status} (Expected 'In Transit')`);

    // 3. Simulate Accept Logic (Direct DB manipulation mirroring the API)
    // We cannot call NextRequest API easily here, so we copy the implementation logic
    console.log('   Simulating Accept...');
    const movement = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(moveId) as any;
    if (movement.status === 'In Transit') {
        const mcNumbers = movement.mc_numbers.split(',');
        const updateStock = db.prepare(`UPDATE fg_stock_master SET cold_store = ?, status = 'Available' WHERE mc_number = ?`);
        const updateLog = db.prepare(`UPDATE stock_movement_log SET status = 'Completed' WHERE movement_id = ?`);

        db.transaction(() => {
            for (const mc of mcNumbers) {
                updateStock.run(movement.to_location, mc);
            }
            updateLog.run(moveId);
        })();
    }

    // Check Status Final
    const logAfter = db.prepare('SELECT status FROM stock_movement_log WHERE movement_id = ?').get(moveId) as any;
    console.log(`   Status After Accept: ${logAfter.status} (Expected 'Completed')`);

    const stockCheck = db.prepare('SELECT cold_store, status FROM fg_stock_master WHERE cold_store = ? LIMIT 1').get('debug_B') as any;
    console.log(`   Stock in B: Status=${stockCheck.status}, Store=${stockCheck.cold_store}`);
}

main();
