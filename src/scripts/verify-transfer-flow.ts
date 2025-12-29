
import { getDb } from '@/lib/db';
import { handleInward, handleTransfer } from '@/lib/stock-logic';
import { generateMovementId } from '@/lib/utils'; // Assuming this is exported or I can mock it

// Mock User IDs (Ensure these exist in your DB or handle errors)
const ADMIN_ID = 1; // Assuming 1 is admin/manager

async function verifyTransferFlow() {
    const db = getDb();
    console.log('--- Starting Transfer Flow Verification ---');

    const storeA = 'Store_Transfer_Test_A';
    const storeB = 'Store_Transfer_Test_B';
    const sku = { type: 'TestType', variety: 'TestVar', packing: '10kg', grade: 'A' };

    try {
        // 1. Setup: Ensure Store A has stock
        console.log(`1. Creating stock in ${storeA}...`);
        const inwardRes = await handleInward({
            toStore: storeA,
            qty: 10,
            ...sku
        }, ADMIN_ID);

        if (!inwardRes.success) throw new Error(`Inward failed: ${inwardRes.error}`);
        console.log('Stock created:', inwardRes.movedCount, 'MCs');

        // 2. Initiate Transfer: A -> B
        console.log(`2. Initiating Transfer from ${storeA} to ${storeB}...`);
        const transferRes = await handleTransfer({
            fromStore: storeA,
            toStore: storeB,
            qty: 5,
            ...sku
        }, ADMIN_ID);

        if (!transferRes.success) throw new Error(`Transfer failed: ${transferRes.error}`);
        const moveId = transferRes.moveId;
        console.log('Transfer initiated. Move ID:', moveId);

        // 3. Verify 'In Transit' State
        const movement = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(moveId) as any;
        console.log('Movement Status:', movement.status);
        if (movement.status !== 'In Transit') throw new Error('Movement status should be In Transit');

        const mcNumbers = movement.mc_numbers.split(',');
        const stocks = db.prepare(`SELECT * FROM fg_stock_master WHERE mc_number IN (${mcNumbers.map(() => '?').join(',')})`).all(...mcNumbers) as any[];

        const inTransitCount = stocks.filter(s => s.cold_store === 'In Transit').length;
        console.log(`Stocks in 'In Transit' state: ${inTransitCount}/${stocks.length}`);
        if (inTransitCount !== stocks.length) throw new Error('Stocks should be in In Transit state');

        // 4. Accept Transfer (Simulating API logic)
        console.log('4. Accepting Transfer...');
        // We can't call the API route directly easily in a script without full mock, 
        // but we can replicate the logic to verify it works against the DB.

        // Logic from POST /api/movement/[id]/accept
        const updateStock = db.prepare(`
            UPDATE fg_stock_master
            SET cold_store = ?, status = 'Available', updated_at = CURRENT_TIMESTAMP
            WHERE mc_number = ?
        `);
        const updateMovement = db.prepare(`
            UPDATE stock_movement_log
            SET status = 'Completed', approved_by_id = ?
            WHERE movement_id = ?
        `);

        db.transaction(() => {
            for (const mc of mcNumbers) {
                updateStock.run(storeB, mc);
            }
            updateMovement.run(ADMIN_ID, moveId);
        })();

        // 5. Verify Final State
        const finalMovement = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(moveId) as any;
        console.log('Final Movement Status:', finalMovement.status);
        if (finalMovement.status !== 'Completed') throw new Error('Final status should be Completed');

        const finalStocks = db.prepare(`SELECT * FROM fg_stock_master WHERE mc_number IN (${mcNumbers.map(() => '?').join(',')})`).all(...mcNumbers) as any[];
        const inStoreBCount = finalStocks.filter(s => s.cold_store === storeB && s.status === 'Available').length;
        console.log(`Stocks in ${storeB}: ${inStoreBCount}/${finalStocks.length}`);
        if (inStoreBCount !== finalStocks.length) throw new Error(`Stocks should be in ${storeB}`);

        console.log('--- Verification Successful ---');

    } catch (error) {
        console.error('Verification Failed:', error);
    }
}

verifyTransferFlow();
