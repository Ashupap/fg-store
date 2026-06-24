import { getDb } from '../lib/db';
import { generateMovementId, generateMCNumber, getNextMCSequence, packingToCode } from '../lib/utils';

const db = getDb();

function setupTestEnvironment() {
    console.log('  [Setup] Seeding test stores and users...');
    db.prepare("INSERT INTO stores (name, capacity_tons, is_active) VALUES ('UpdateStore_A', 100, 1)").run();
    db.prepare("INSERT INTO stores (name, capacity_tons, is_active) VALUES ('UpdateStore_B', 100, 1)").run();
    db.prepare("INSERT INTO stores (name, capacity_tons, is_active) VALUES ('UpdateStore_C', 100, 1)").run();

    // Create a mock user
    db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role)
        VALUES (999, 'update_mgr@example.com', 'hash', 'Update Manager', 'manager')
    `).run();

    // Insert variety into master data to allow FCL/capacity mock checks if any
    db.prepare("INSERT INTO master_data (variety, mcs_per_fcl) VALUES ('Variety_X', 100)").run();
    db.prepare("INSERT INTO master_data (variety, mcs_per_fcl) VALUES ('Variety_Y', 100)").run();
}

function cleanupTestEnvironment() {
    console.log('  [Cleanup] Cleaning up test data...');
    db.prepare("DELETE FROM audit_logs WHERE changed_by_id = 999").run();
    db.prepare("DELETE FROM user_stores WHERE user_id = 999").run();
    db.prepare("DELETE FROM stock_movement_log WHERE moved_by_id = 999 OR approved_by_id = 999").run();
    db.prepare("DELETE FROM fg_stock_master WHERE created_by_id = 999").run();
    db.prepare("DELETE FROM users WHERE id = 999").run();
    db.prepare("DELETE FROM stores WHERE name LIKE 'UpdateStore_%'").run();
    db.prepare("DELETE FROM master_data WHERE variety IN ('Variety_X', 'Variety_Y')").run();
}

// Replicate the transaction update logic inside a testable function
function runUpdateTest(movementId: string, updates: any, userId: number, userName: string, changeReason: string): { success: boolean; error?: string } {
    let errorMsg = '';
    const transaction = db.transaction(() => {
        const log = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(movementId) as any;
        if (!log) {
            errorMsg = 'Movement log not found';
            throw new Error(errorMsg);
        }

        const oldMcNumbers = log.mc_numbers ? log.mc_numbers.split(',') : [];
        let beforeStock: any[] = [];
        if (oldMcNumbers.length > 0) {
            const placeholders = oldMcNumbers.map(() => '?').join(',');
            beforeStock = db.prepare(`SELECT * FROM fg_stock_master WHERE mc_number IN (${placeholders})`).all(...oldMcNumbers) as any[];
        }

        const beforeStateStr = JSON.stringify({ log, stock: beforeStock });

        // Rollback
        if (log.action_type === 'INWARD') {
            const unavailable = beforeStock.some(s => s.status !== 'Available' || s.cold_store !== log.to_location);
            if (unavailable) {
                errorMsg = 'Cannot edit Inward: some cartons are no longer Available in the destination store';
                throw new Error(errorMsg);
            }
            if (oldMcNumbers.length > 0) {
                const placeholders = oldMcNumbers.map(() => '?').join(',');
                db.prepare(`DELETE FROM fg_stock_master WHERE mc_number IN (${placeholders})`).run(...oldMcNumbers);
            }
        } else if (log.action_type === 'TRANSFER') {
            const unavailable = beforeStock.some(s => s.status !== 'Available' || (s.cold_store !== log.to_location && s.cold_store !== 'In Transit'));
            if (unavailable) {
                errorMsg = 'Cannot edit Transfer: some cartons are no longer Available or have been moved';
                throw new Error(errorMsg);
            }
            if (oldMcNumbers.length > 0) {
                const placeholders = oldMcNumbers.map(() => '?').join(',');
                db.prepare(`UPDATE fg_stock_master SET cold_store = ?, status = 'Available' WHERE mc_number IN (${placeholders})`).run(log.from_location, ...oldMcNumbers);
            }
        }

        // Apply Updates
        const mergedInput = {
            ...log,
            ...updates,
            qty: Number(updates.qty_mcs !== undefined ? updates.qty_mcs : log.qty_mcs),
            toStore: updates.to_location !== undefined ? updates.to_location : log.to_location,
            fromStore: updates.from_location !== undefined ? updates.from_location : log.from_location,
        };

        let newMcNumbers: string[] = [];

        if (log.action_type === 'INWARD') {
            const packingCode = packingToCode(mergedInput.packing);
            const packingDate = mergedInput.packingDate || log.movement_datetime.split('T')[0];

            let currentSeq = getNextMCSequence(db, mergedInput.grade, packingCode);

            const insertStock = db.prepare(`
                INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, created_by_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Available', ?)
            `);

            for (let i = 0; i < mergedInput.qty; i++) {
                const mcNumber = generateMCNumber(mergedInput.grade, packingCode, currentSeq);
                newMcNumbers.push(mcNumber);
                insertStock.run(mcNumber, mergedInput.grade, mergedInput.variety, mergedInput.type, packingCode, packingDate, mergedInput.toStore, log.moved_by_id);
                currentSeq++;
            }

            db.prepare(`
                UPDATE stock_movement_log
                SET variety = ?, grade = ?, packing = ?, type = ?, qty_mcs = ?, to_location = ?, mc_numbers = ?, remarks = ?
                WHERE movement_id = ?
            `).run(
                mergedInput.variety, mergedInput.grade, mergedInput.packing, mergedInput.type, mergedInput.qty, mergedInput.toStore,
                newMcNumbers.join(','), mergedInput.remarks || null, movementId
            );

        } else if (log.action_type === 'TRANSFER') {
            const packingCode = packingToCode(mergedInput.packing);

            // FIFO
            const available = db.prepare(`
                SELECT id, mc_number FROM fg_stock_master
                WHERE cold_store = ? AND type = ? AND variety = ? AND packing_code = ? AND grade = ? AND status = 'Available'
                ORDER BY packing_date ASC
                LIMIT ?
            `).all(mergedInput.fromStore, mergedInput.type, mergedInput.variety, packingCode, mergedInput.grade, mergedInput.qty) as any[];

            if (available.length < mergedInput.qty) {
                errorMsg = `Insufficient stock available in source store. Requested ${mergedInput.qty}, but only ${available.length} available.`;
                throw new Error(errorMsg);
            }

            newMcNumbers = available.map(x => x.mc_number);

            const updateStock = db.prepare('UPDATE fg_stock_master SET cold_store = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            for (const item of available) {
                updateStock.run(log.status === 'Completed' ? mergedInput.toStore : 'In Transit', item.id);
            }

            db.prepare(`
                UPDATE stock_movement_log
                SET variety = ?, grade = ?, packing = ?, type = ?, qty_mcs = ?, from_location = ?, to_location = ?, mc_numbers = ?, remarks = ?
                WHERE movement_id = ?
            `).run(
                mergedInput.variety, mergedInput.grade, mergedInput.packing, mergedInput.type, mergedInput.qty, mergedInput.fromStore, mergedInput.toStore,
                newMcNumbers.join(','), mergedInput.remarks || null, movementId
            );
        }

        const afterLog = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(movementId) as any;
        let afterStock: any[] = [];
        if (newMcNumbers.length > 0) {
            const placeholders = newMcNumbers.map(() => '?').join(',');
            afterStock = db.prepare(`SELECT * FROM fg_stock_master WHERE mc_number IN (${placeholders})`).all(...newMcNumbers) as any[];
        }

        const afterStateStr = JSON.stringify({ log: afterLog, stock: afterStock });

        db.prepare(`
            INSERT INTO audit_logs (action_type, table_name, record_id, before_state, after_state, changed_by_id, changed_by_name, change_reason)
            VALUES ('UPDATE_TRANSACTION', 'stock_movement_log', ?, ?, ?, ?, ?, ?)
        `).run(movementId, beforeStateStr, afterStateStr, userId, userName, changeReason);
    });

    try {
        transaction();
        return { success: true };
    } catch (e: any) {
        return { success: false, error: errorMsg || e.message };
    }
}

async function runTests() {
    console.log('=== Starting Audited Update Logic Verification ===');
    cleanupTestEnvironment();
    setupTestEnvironment();

    try {
        // --- Test 1: Inward Correct Correction ---
        console.log('\nTest 1: Inward Correct Correction...');
        const moveInId = generateMovementId();

        // Create an inward movement and cartons
        db.prepare(`
            INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, to_location, type, variety, packing, grade, qty_mcs, moved_by_id, status)
            VALUES (?, ?, 'INWARD', 'UpdateStore_A', 'Type_X', 'Variety_X', '10KG', 'A', 5, 999, 'Completed')
        `).run(moveInId, new Date().toISOString());

        const packingCode = '10KG';
        let currentSeq = getNextMCSequence(db, 'A', packingCode);
        const createdMcs: string[] = [];
        for (let i = 0; i < 5; i++) {
            const mc = generateMCNumber('A', packingCode, currentSeq);
            createdMcs.push(mc);
            db.prepare(`
                INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, created_by_id)
                VALUES (?, 'A', 'Variety_X', 'Type_X', ?, '2026-06-01', 'UpdateStore_A', 'Available', 999)
            `).run(mc, packingCode);
            currentSeq++;
        }
        db.prepare('UPDATE stock_movement_log SET mc_numbers = ? WHERE movement_id = ?').run(createdMcs.join(','), moveInId);

        // Run correction: Change variety to Variety_Y, grade to B, quantity to 3, toStore to UpdateStore_B
        const updateRes1 = runUpdateTest(
            moveInId,
            { variety: 'Variety_Y', grade: 'B', qty_mcs: 3, to_location: 'UpdateStore_B', packing: '10KG', type: 'Type_X' },
            999,
            'Update Manager',
            'Corrected grade from A to B and updated count to 3'
        );

        if (updateRes1.success) {
            console.log('  ✅ Inward correction succeeded');
            // Verify DB state
            const updatedLog = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(moveInId) as any;
            const updatedStockCount = db.prepare("SELECT count(*) as count FROM fg_stock_master WHERE cold_store = 'UpdateStore_B' AND variety = 'Variety_Y' AND grade = 'B' AND created_by_id = 999").get() as { count: number };
            const oldStockCount = db.prepare("SELECT count(*) as count FROM fg_stock_master WHERE cold_store = 'UpdateStore_A'").get() as { count: number };
            const auditCount = db.prepare("SELECT count(*) as count FROM audit_logs WHERE record_id = ?").get(moveInId) as { count: number };

            if (updatedLog.qty_mcs === 3 && updatedLog.to_location === 'UpdateStore_B' && updatedStockCount.count === 3 && oldStockCount.count === 0 && auditCount.count === 1) {
                console.log('  ✅ Database state verification passed');
            } else {
                console.error('  ❌ Database state verification failed:', { updatedLog, updatedStockCount, oldStockCount, auditCount });
            }
        } else {
            console.error('  ❌ Inward correction failed:', updateRes1.error);
        }

        // --- Test 2: Inward Correction Blocked (Cartons unavailable) ---
        console.log('\nTest 2: Inward Correction Blocked (Cartons unavailable)...');
        // Let's mark one of the new cartons as Dispatched (simulating it was sold)
        const newLog = db.prepare('SELECT mc_numbers FROM stock_movement_log WHERE movement_id = ?').get(moveInId) as any;
        const newMcs = newLog.mc_numbers.split(',');
        db.prepare("UPDATE fg_stock_master SET status = 'Dispatched' WHERE mc_number = ?").run(newMcs[0]);

        // Attempt correction: should fail since one carton is not Available
        const updateRes2 = runUpdateTest(
            moveInId,
            { variety: 'Variety_Y', grade: 'B', qty_mcs: 2, to_location: 'UpdateStore_B', packing: '10KG', type: 'Type_X' },
            999,
            'Update Manager',
            'Correct count to 2'
        );

        if (!updateRes2.success) {
            console.log('  ✅ Correctly blocked update (Error:', updateRes2.error, ')');
        } else {
            console.error('  ❌ Failure: Update succeeded when it should have been blocked');
        }

        // Revert status
        db.prepare("UPDATE fg_stock_master SET status = 'Available' WHERE mc_number = ?").run(newMcs[0]);

        // --- Test 3: Transfer Correction ---
        console.log('\nTest 3: Transfer Correction...');
        const moveTransId = generateMovementId();

        // Create a completed transfer log of 2 cartons from B to C
        db.prepare(`
            INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, type, variety, packing, grade, qty_mcs, mc_numbers, moved_by_id, status)
            VALUES (?, ?, 'TRANSFER', 'UpdateStore_B', 'UpdateStore_C', 'Type_X', 'Variety_Y', '10KG', 'B', 2, ?, 999, 'Completed')
        `).run(moveTransId, new Date().toISOString(), newMcs.slice(0, 2).join(','));

        // Update the cartons' location in master to UpdateStore_C (meaning they are in destination store now)
        db.prepare("UPDATE fg_stock_master SET cold_store = 'UpdateStore_C' WHERE mc_number IN (?, ?)").run(newMcs[0], newMcs[1]);

        // Correct transfer: from B to A (redirection) and qty=1
        const updateRes3 = runUpdateTest(
            moveTransId,
            { from_location: 'UpdateStore_B', to_location: 'UpdateStore_A', variety: 'Variety_Y', grade: 'B', qty_mcs: 1, packing: '10KG', type: 'Type_X' },
            999,
            'Update Manager',
            'Redirect transfer to Store A and reduce quantity to 1'
        );

        if (updateRes3.success) {
            console.log('  ✅ Transfer correction succeeded');
            // Verify state
            const updatedLog = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(moveTransId) as any;
            const storeAStock = db.prepare("SELECT count(*) as count FROM fg_stock_master WHERE cold_store = 'UpdateStore_A'").get() as { count: number };
            const storeBStock = db.prepare("SELECT count(*) as count FROM fg_stock_master WHERE cold_store = 'UpdateStore_B'").get() as { count: number };
            const storeCStock = db.prepare("SELECT count(*) as count FROM fg_stock_master WHERE cold_store = 'UpdateStore_C'").get() as { count: number };

            // Expect: 1 in A (transferred), 2 in B (the remaining 1 is back in B, plus the 3rd carton from inward is in B since it was never transferred)
            // C has 0 (since they reverted to B first, then we transferred 1 to A)
            if (updatedLog.qty_mcs === 1 && updatedLog.to_location === 'UpdateStore_A' && storeAStock.count === 1 && storeBStock.count === 2 && storeCStock.count === 0) {
                console.log('  ✅ Transfer database state verification passed');
            } else {
                console.error('  ❌ Transfer database state verification failed:', { updatedLog, storeAStock, storeBStock, storeCStock });
            }
        } else {
            console.error('  ❌ Transfer correction failed:', updateRes3.error);
        }

    } catch (e) {
        console.error('Test error:', e);
    } finally {
        cleanupTestEnvironment();
        console.log('\n=== Verification Complete ===');
    }
}

runTests();
