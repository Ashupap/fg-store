import { getDb } from '../lib/db';
import { handleInward, handleTransfer } from '../lib/stock-logic';

const ADMIN_ID = 1;

async function verifyFifoLifoTransfer() {
    const db = getDb();
    console.log('--- Starting FIFO vs LIFO Transfer Verification ---');

    const storeA = 'Store_FifoLifo_Test_A';
    const storeB = 'Store_FifoLifo_Test_B';
    const sku = { type: 'FifoLifoType', variety: 'FifoLifoVar', packing: '10kg', grade: 'A' };

    try {
        // Cleanup existing test stock/stores if any
        db.prepare("DELETE FROM fg_stock_master WHERE type = 'FifoLifoType'").run();
        db.prepare("DELETE FROM stock_movement_log WHERE type = 'FifoLifoType'").run();
        db.prepare("DELETE FROM stores WHERE name IN (?, ?)").run(storeA, storeB);
        db.prepare("DELETE FROM store_sections WHERE store_name IN (?, ?)").run(storeA, storeB);

        // Setup test stores
        db.prepare("INSERT INTO stores (name) VALUES (?)").run(storeA);
        db.prepare("INSERT INTO stores (name) VALUES (?)").run(storeB);

        // 1. Inward 3 cartons with different packing dates
        console.log('1. Inwarding 3 cartons with distinct packing dates...');
        
        const in1 = await handleInward({
            toStore: storeA,
            qty: 1,
            packingDate: '2026-06-01',
            ...sku
        }, ADMIN_ID);
        if (!in1.success) throw new Error(`Inward 1 failed: ${in1.error}`);
        
        const in2 = await handleInward({
            toStore: storeA,
            qty: 1,
            packingDate: '2026-06-02',
            ...sku
        }, ADMIN_ID);
        if (!in2.success) throw new Error(`Inward 2 failed: ${in2.error}`);

        const in3 = await handleInward({
            toStore: storeA,
            qty: 1,
            packingDate: '2026-06-03',
            ...sku
        }, ADMIN_ID);
        if (!in3.success) throw new Error(`Inward 3 failed: ${in3.error}`);

        // Fetch all 3 available cartons to inspect MC numbers
        const stockItems = db.prepare(`
            SELECT mc_number, packing_date 
            FROM fg_stock_master 
            WHERE cold_store = ? AND type = ? AND status = 'Available'
            ORDER BY packing_date ASC
        `).all(storeA, sku.type) as any[];

        console.log('Available Cartons in Store A:');
        stockItems.forEach(item => {
            console.log(`  - MC: ${item.mc_number}, Packed: ${item.packing_date}`);
        });

        const oldestMC = stockItems[0].mc_number;
        const newestMC = stockItems[2].mc_number;

        // 2. Perform a FIFO Transfer of 1 carton
        console.log('\n2. Testing FIFO Transfer...');
        const fifoRes = await handleTransfer({
            fromStore: storeA,
            toStore: storeB,
            qty: 1,
            allocationStrategy: 'FIFO',
            ...sku
        }, ADMIN_ID);

        if (!fifoRes.success) throw new Error(`FIFO Transfer failed: ${fifoRes.error}`);
        const fifoLog = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(fifoRes.moveId) as any;
        console.log(`  - FIFO Moved MC: ${fifoLog.mc_numbers}`);
        if (fifoLog.mc_numbers !== oldestMC) {
            throw new Error(`Expected FIFO to move oldest MC (${oldestMC}), but it moved: ${fifoLog.mc_numbers}`);
        }
        console.log('  ➔ FIFO Strategy Verified Successfully!');

        // Revert FIFO moved carton back to Available in Store A for LIFO test
        db.prepare("UPDATE fg_stock_master SET cold_store = ?, status = 'Available' WHERE mc_number = ?").run(storeA, oldestMC);

        // 3. Perform a LIFO Transfer of 1 carton
        console.log('\n3. Testing LIFO Transfer...');
        const lifoRes = await handleTransfer({
            fromStore: storeA,
            toStore: storeB,
            qty: 1,
            allocationStrategy: 'LIFO',
            ...sku
        }, ADMIN_ID);

        if (!lifoRes.success) throw new Error(`LIFO Transfer failed: ${lifoRes.error}`);
        const lifoLog = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(lifoRes.moveId) as any;
        console.log(`  - LIFO Moved MC: ${lifoLog.mc_numbers}`);
        if (lifoLog.mc_numbers !== newestMC) {
            throw new Error(`Expected LIFO to move newest MC (${newestMC}), but it moved: ${lifoLog.mc_numbers}`);
        }
        console.log('  ➔ LIFO Strategy Verified Successfully!');

        // Cleanup
        db.prepare("DELETE FROM fg_stock_master WHERE type = 'FifoLifoType'").run();
        db.prepare("DELETE FROM stock_movement_log WHERE type = 'FifoLifoType'").run();
        db.prepare("DELETE FROM store_sections WHERE store_name IN (?, ?)").run(storeA, storeB);
        db.prepare("DELETE FROM stores WHERE name IN (?, ?)").run(storeA, storeB);

        console.log('\n--- FIFO vs LIFO Verification Completed Successfully ---');
    } catch (err) {
        // Cleanup on error too
        try {
            db.prepare("DELETE FROM fg_stock_master WHERE type = 'FifoLifoType'").run();
            db.prepare("DELETE FROM stock_movement_log WHERE type = 'FifoLifoType'").run();
            db.prepare("DELETE FROM store_sections WHERE store_name IN (?, ?)").run(storeA, storeB);
            db.prepare("DELETE FROM stores WHERE name IN (?, ?)").run(storeA, storeB);
        } catch (_) {}
        console.error('\nVerification Failed:', err);
        process.exit(1);
    }
}

verifyFifoLifoTransfer();
