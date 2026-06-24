import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function runTests() {
    const { getDb } = await import('../lib/db');
    const { getAvailableCartons, handleInward, handleTransfer } = await import('../lib/stock-logic');
    const { generateMovementId } = await import('../lib/utils');

    const db = getDb();
    console.log('=== STARTING CONCURRENCY AND PENDING LOCKS INTEGRATION TESTS ===');

    const storeA = 'Concurrency_Store_A';
    const storeB = 'Concurrency_Store_B';

    function cleanTestData() {
        db.prepare("DELETE FROM fg_stock_master WHERE cold_store IN (?, ?, 'In Transit', 'Dispatch')").run(storeA, storeB);
        db.prepare("DELETE FROM stock_movement_log WHERE from_location IN (?, ?) OR to_location IN (?, ?)").run(storeA, storeB, storeA, storeB);
        db.prepare("DELETE FROM stores WHERE name IN (?, ?)").run(storeA, storeB);
    }

    try {
        cleanTestData();

        // 1. Setup Stores
        db.prepare("INSERT INTO stores (name) VALUES (?)").run(storeA);
        db.prepare("INSERT INTO stores (name) VALUES (?)").run(storeB);

        const sku = { type: 'TestType', variety: 'TestVar', packing: '10kg', grade: 'Premium' };

        // 2. Inward 5 cartons to Store A
        console.log('\n[Step 1] Inwarding 5 cartons to Store A...');
        const inwardRes = await handleInward({ toStore: storeA, qty: 5, ...sku }, 1);
        if (!inwardRes.success) throw new Error(`Inward failed: ${inwardRes.error}`);
        console.log(`-> Successfully inwarded. Shortcodes: ${inwardRes.shortCodes?.join(', ')}`);

        // Check initial availability
        const cartonsBefore = getAvailableCartons(db, storeA, sku);
        console.log(`Initial available cartons count in Store A: ${cartonsBefore.length} (Expected: 5)`);
        if (cartonsBefore.length !== 5) throw new Error('Initial count mismatch');

        // 3. Create a Pending Approval Transfer of 2 cartons
        console.log('\n[Step 2] Creating a Pending Approval Transfer of 2 cartons (FIFO)...');
        const pendingMoveId = generateMovementId();
        
        // Manually insert a Pending Approval log to simulate operator request
        db.prepare(`
            INSERT INTO stock_movement_log (
                movement_id, movement_datetime, action_type, 
                from_location, to_location, 
                type, variety, packing, grade, 
                qty_mcs, moved_by_id, status, allocation_strategy
            )
            VALUES (?, CURRENT_TIMESTAMP, 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, 1, 'Pending Approval', 'FIFO')
        `).run(pendingMoveId, storeA, storeB, sku.type, sku.variety, sku.packing, sku.grade, 2);

        // 4. Verify stock availability is reduced by 2
        console.log('\n[Step 3] Verifying stock availability is reduced...');
        const cartonsAfter = getAvailableCartons(db, storeA, sku);
        console.log(`Available cartons count in Store A after pending transfer: ${cartonsAfter.length} (Expected: 3)`);
        if (cartonsAfter.length !== 3) {
            throw new Error(`Exclusion failed. Expected 3 available cartons, got ${cartonsAfter.length}`);
        }
        console.log('-> Stock lock for pending request successfully verified!');

        // 5. Verify Batches-by-Date query respects the pending lock
        console.log('\n[Step 4] Verifying batches-by-date respects pending lock...');
        // Mock batches endpoint logic
        const query = `
            SELECT 
                f.mc_number, f.type, f.variety, f.packing_code, m.packing, f.grade, f.packing_date
            FROM fg_stock_master f
            LEFT JOIN (SELECT DISTINCT packing FROM master_data WHERE packing IS NOT NULL AND packing != '') m 
                ON f.packing_code = REPLACE(UPPER(m.packing), ' ', '')
            WHERE f.cold_store = ? AND f.packing_date = ? AND f.status = 'Available'
        `;
        const packingDate = cartonsBefore[0].packing_date;
        const rawRows = db.prepare(query).all(storeA, packingDate) as any[];
        const availableMcSet = new Set(getAvailableCartons(db, storeA).map(c => c.mc_number));
        const filteredRows = rawRows.filter(row => availableMcSet.has(row.mc_number));
        console.log(`Raw rows count on date: ${rawRows.length}`);
        console.log(`Filtered rows count on date: ${filteredRows.length} (Expected: 3)`);
        if (filteredRows.length !== 3) {
            throw new Error(`Batches filter failed. Expected 3, got ${filteredRows.length}`);
        }
        console.log('-> Batches-by-date respects the pending lock successfully!');

        // 6. Approve the Pending Approval transfer request
        console.log('\n[Step 5] Approving the Pending Approval request...');
        // This executes handleTransfer with existingMovementId
        const approveRes = await handleTransfer({
            fromStore: storeA,
            toStore: storeB,
            qty: 2,
            ...sku,
            allocationStrategy: 'FIFO'
        }, 1, pendingMoveId);

        if (!approveRes.success) {
            throw new Error(`Approval failed (self-exclusion bug still present!): ${approveRes.error}`);
        }
        console.log(`-> Approval succeeded! Moved count: ${approveRes.movedCount}`);

        // Verify status is In Transit
        const approvedLog = db.prepare("SELECT status, mc_numbers FROM stock_movement_log WHERE movement_id = ?").get(pendingMoveId) as any;
        console.log(`Approved movement status: ${approvedLog.status} (Expected: 'In Transit')`);
        if (approvedLog.status !== 'In Transit') throw new Error('Expected status to be In Transit');

        const inTransitMCs = approvedLog.mc_numbers.split(',');
        console.log(`Approved MC numbers: ${inTransitMCs.join(', ')}`);

        // Verify cartons' locations are In Transit
        const cartonStatuses = db.prepare(`
            SELECT cold_store, status FROM fg_stock_master WHERE mc_number IN (?, ?)
        `).all(...inTransitMCs) as any[];
        console.log('Carton locations after approval:', cartonStatuses);
        for (const c of cartonStatuses) {
            if (c.cold_store !== 'In Transit') {
                throw new Error(`Carton should be in 'In Transit', but is in: ${c.cold_store}`);
            }
        }
        console.log('-> Approved request cartons successfully moved to In Transit!');

        // 7. Verify Concurrency Safety (Simultaneous writes)
        console.log('\n[Step 6] Simulating concurrent transfers of the same cartons...');
        // Let's get the 3 remaining available cartons in Store A
        const remainingCartons = getAvailableCartons(db, storeA, sku);
        console.log(`Remaining cartons available in Store A: ${remainingCartons.length} (MCs: ${remainingCartons.map(c => c.mc_number).join(', ')})`);
        
        // We will run two simulated transaction blocks.
        // The first one will successfully complete.
        // The second one should immediately see that the cartons are gone and throw/fail.
        let firstTxCompleted = false;
        let secondTxFailed = false;

        const tx1 = db.transaction(() => {
            // Check available
            const avail = getAvailableCartons(db, storeA, sku);
            if (avail.length < 2) {
                throw new Error('Not enough cartons');
            }
            // Move 2 cartons
            const selected = avail.slice(0, 2);
            for (const c of selected) {
                db.prepare("UPDATE fg_stock_master SET cold_store = 'In Transit', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(c.id);
            }
            firstTxCompleted = true;
        });

        const tx2 = db.transaction(() => {
            // Check available
            const avail = getAvailableCartons(db, storeA, sku);
            if (avail.length < 2) {
                throw new Error('Not enough cartons');
            }
            // Move 2 cartons
            const selected = avail.slice(0, 2);
            for (const c of selected) {
                db.prepare("UPDATE fg_stock_master SET cold_store = 'In Transit', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(c.id);
            }
        });

        // Run transaction 1
        tx1();
        console.log(`Transaction 1 succeeded: ${firstTxCompleted}`);

        // Try transaction 2 (which should now fail because there is only 1 carton left available)
        try {
            tx2();
        } catch (e: any) {
            secondTxFailed = true;
            console.log(`Transaction 2 failed as expected: ${e.message}`);
        }

        if (!firstTxCompleted || !secondTxFailed) {
            throw new Error('Concurrency isolation failed!');
        }
        console.log('-> Concurrency safety and serial execution verified successfully!');

        console.log('\n=== ALL CONCURRENCY AND LOCKS INTEGRATION TESTS PASSED ===');

    } catch (e) {
        console.error('\n*** CONCURRENCY INTEGRATION TESTS FAILED ***');
        console.error(e);
        process.exit(1);
    } finally {
        cleanTestData();
        console.log('Cleanup completed.');
    }
}

runTests();
