import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function runTests() {
    // Dynamically import dependencies after env config is loaded to avoid import hoisting issues
    const { getDb } = await import('../lib/db');
    const { generateToken } = await import('../lib/auth');
    const { generateMovementId } = await import('../lib/utils');
    const { handleInward, handleTransfer } = await import('../lib/stock-logic');

    const db = getDb();
    console.log('--- STARTING CANCEL TRANSFER TEST SUITE ---');

    // Clean up helper to avoid FOREIGN KEY errors
    function cleanTestData() {
        // Delete stock master rows created by test users
        db.prepare(`
            DELETE FROM fg_stock_master 
            WHERE created_by_id IN (SELECT id FROM users WHERE username LIKE 'cancel_test_%')
        `).run();

        // Delete user stores
        db.prepare(`
            DELETE FROM user_stores 
            WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'cancel_test_%')
        `).run();
        
        // Delete movement logs
        db.prepare(`
            DELETE FROM stock_movement_log 
            WHERE moved_by_id IN (SELECT id FROM users WHERE username LIKE 'cancel_test_%')
               OR approved_by_id IN (SELECT id FROM users WHERE username LIKE 'cancel_test_%')
        `).run();

        // Delete audit logs referencing test users
        db.prepare(`
            DELETE FROM audit_logs 
            WHERE changed_by_id IN (SELECT id FROM users WHERE username LIKE 'cancel_test_%')
        `).run();

        // Delete users
        db.prepare("DELETE FROM users WHERE username LIKE 'cancel_test_%'").run();
        
        // Delete stores
        db.prepare("DELETE FROM stores WHERE name LIKE 'Cancel_Store_%'").run();
    }

    // Clean up before run
    cleanTestData();

    // 1. Setup Test Stores
    const storeA = 'Cancel_Store_A';
    const storeB = 'Cancel_Store_B';
    const storeC = 'Cancel_Store_C';

    db.prepare("INSERT OR IGNORE INTO stores (name) VALUES (?)").run(storeA);
    db.prepare("INSERT OR IGNORE INTO stores (name) VALUES (?)").run(storeB);
    db.prepare("INSERT OR IGNORE INTO stores (name) VALUES (?)").run(storeC);

    const storeARec = db.prepare("SELECT id FROM stores WHERE name = ?").get(storeA) as any;
    const storeBRec = db.prepare("SELECT id FROM stores WHERE name = ?").get(storeB) as any;
    const storeCRec = db.prepare("SELECT id FROM stores WHERE name = ?").get(storeC) as any;

    // 2. Setup Test Users with Roles
    const insertUser = db.prepare(`
        INSERT INTO users (username, email, password_hash, name, role, is_active)
        VALUES (?, ?, 'dummy_hash', ?, ?, 1)
    `);

    const adminUser = {
        id: insertUser.run('cancel_test_admin', 'admin@cancel.test', 'Cancel Admin', 'admin').lastInsertRowid as number,
        username: 'cancel_test_admin',
        email: 'admin@cancel.test',
        name: 'Cancel Admin',
        role: 'admin',
        assigned_store_ids: [],
        assigned_store_names: []
    };

    const managerAUser = {
        id: insertUser.run('cancel_test_mgr_a', 'mgr_a@cancel.test', 'Cancel Mgr A', 'manager').lastInsertRowid as number,
        username: 'cancel_test_mgr_a',
        email: 'mgr_a@cancel.test',
        name: 'Cancel Mgr A',
        role: 'manager',
        assigned_store_ids: [storeARec.id],
        assigned_store_names: [storeA]
    };

    const managerCUser = {
        id: insertUser.run('cancel_test_mgr_c', 'mgr_c@cancel.test', 'Cancel Mgr C', 'manager').lastInsertRowid as number,
        username: 'cancel_test_mgr_c',
        email: 'mgr_c@cancel.test',
        name: 'Cancel Mgr C',
        role: 'manager',
        assigned_store_ids: [storeCRec.id],
        assigned_store_names: [storeC]
    };

    const operatorUser = {
        id: insertUser.run('cancel_test_op', 'op@cancel.test', 'Cancel Op', 'operator').lastInsertRowid as number,
        username: 'cancel_test_op',
        email: 'op@cancel.test',
        name: 'Cancel Op',
        role: 'operator',
        assigned_store_ids: [storeARec.id],
        assigned_store_names: [storeA]
    };

    // Associate managers/operators to their stores
    db.prepare("INSERT INTO user_stores (user_id, store_id) VALUES (?, ?)").run(managerAUser.id, storeARec.id);
    db.prepare("INSERT INTO user_stores (user_id, store_id) VALUES (?, ?)").run(managerCUser.id, storeCRec.id);
    db.prepare("INSERT INTO user_stores (user_id, store_id) VALUES (?, ?)").run(operatorUser.id, storeARec.id);

    // Generate tokens
    const adminToken = generateToken(adminUser);
    const managerAToken = generateToken(managerAUser);
    const managerCToken = generateToken(managerCUser);
    const operatorToken = generateToken(operatorUser);

    const sku = { type: 'CancelType', variety: 'CancelVar', packing: '15kg', grade: 'Premium' };

    // Utility helper to call cancellation endpoint
    async function callCancelAPI(movementId: string, token: string) {
        const response = await fetch(`http://localhost:3000/api/movement/${movementId}/cancel`, {
            method: 'POST',
            headers: {
                'Cookie': `auth-token=${token}`
            }
        });
        const status = response.status;
        const data = await response.json();
        return { status, data };
    }

    try {
        // --- TEST CASE 1: OPERATOR BLOCKED ---
        console.log('\nTest Case 1: Operators cannot cancel transfers...');
        // First seed some stock and transfer it
        const inwardRes = await handleInward({ toStore: storeA, qty: 3, ...sku }, adminUser.id);
        if (!inwardRes.success) throw new Error(`Inward failed: ${inwardRes.error}`);

        const transferRes = await handleTransfer({ fromStore: storeA, toStore: storeB, qty: 3, ...sku }, adminUser.id);
        if (!transferRes.success) throw new Error(`Transfer failed: ${transferRes.error}`);
        const movementId1 = transferRes.moveId as string;

        const res1 = await callCancelAPI(movementId1, operatorToken);
        console.log(`Response Status: ${res1.status}, Error Message: ${res1.data.error}`);
        if (res1.status !== 403 || !res1.data.error.includes('Unauthorized: Only admins, GMs or managers')) {
            throw new Error('Operator should be blocked from cancelling');
        }
        console.log('-> Passed');

        // --- TEST CASE 2: STORE ISOLATION FOR MANAGERS ---
        console.log('\nTest Case 2: Managers isolated from the stores involved cannot cancel transfers...');
        const res2 = await callCancelAPI(movementId1, managerCToken);
        console.log(`Response Status: ${res2.status}, Error Message: ${res2.data.error}`);
        if (res2.status !== 403 || !res2.data.error.includes('You are not assigned to the stores')) {
            throw new Error('Manager C should be blocked due to store isolation');
        }
        console.log('-> Passed');

        // --- TEST CASE 3: IN TRANSIT TRANSFER CANCEL & ROLLBACK ---
        console.log('\nTest Case 3: Cancel an In Transit transfer (reverting stock)...');
        // A transfer remains 'In Transit' when initialized
        const movementLog = db.prepare('SELECT mc_numbers FROM stock_movement_log WHERE movement_id = ?').get(movementId1) as any;
        const mcNumbers = movementLog.mc_numbers.split(',');

        // Cancel it using Manager A (who is assigned to Store A)
        const res3 = await callCancelAPI(movementId1, managerAToken);
        console.log(`Response Status: ${res3.status}, Message: ${res3.data.message}`);
        if (res3.status !== 200 || !res3.data.success) {
            throw new Error(`Cancellation failed: ${res3.data.error}`);
        }

        // Verify cartons returned to original store
        const rolledBackStocks = db.prepare(`
            SELECT cold_store, status FROM fg_stock_master 
            WHERE mc_number IN (${mcNumbers.map(() => '?').join(',')})
        `).all(...mcNumbers) as any[];

        console.log(`Cartons rolled back details:`, rolledBackStocks);
        for (const stock of rolledBackStocks) {
            if (stock.cold_store !== storeA || stock.status !== 'Available') {
                throw new Error('Cartons were not correctly rolled back to original store in Available status');
            }
        }

        // Verify movement status is Cancelled
        const updatedLog = db.prepare("SELECT status FROM stock_movement_log WHERE movement_id = ?").get(movementId1) as any;
        console.log(`Movement status: ${updatedLog.status}`);
        if (updatedLog.status !== 'Cancelled') {
            throw new Error('Movement status is not Cancelled');
        }

        // Verify audit log
        const auditLog = db.prepare("SELECT * FROM audit_logs WHERE record_id = ? AND action_type = 'CANCEL_TRANSACTION'").get(movementId1) as any;
        if (!auditLog) {
            throw new Error('Audit log was not created for the cancellation');
        }
        console.log(`Audit Log Created: Action: ${auditLog.action_type}, Changed By: ${auditLog.changed_by_name}`);
        console.log('-> Passed');

        // --- TEST CASE 4: PENDING APPROVAL CANCEL ---
        console.log('\nTest Case 4: Cancel a Pending Approval transfer...');
        // Create a pending approval movement log (manually, since handleTransfer sets it to In Transit or Partial)
        const movementId2 = generateMovementId();
        db.prepare(`
            INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, type, variety, packing, grade, qty_mcs, moved_by_id, status)
            VALUES (?, CURRENT_TIMESTAMP, 'TRANSFER', ?, ?, ?, ?, ?, ?, 2, ?, 'Pending Approval')
        `).run(movementId2, storeA, storeB, sku.type, sku.variety, sku.packing, sku.grade, managerAUser.id);

        const res4 = await callCancelAPI(movementId2, adminToken);
        console.log(`Response Status: ${res4.status}, Message: ${res4.data.message}`);
        if (res4.status !== 200 || !res4.data.success) {
            throw new Error(`Pending cancellation failed: ${res4.data.error}`);
        }

        const updatedPendingLog = db.prepare("SELECT status FROM stock_movement_log WHERE movement_id = ?").get(movementId2) as any;
        console.log(`Pending movement status: ${updatedPendingLog.status}`);
        if (updatedPendingLog.status !== 'Cancelled') {
            throw new Error('Pending movement status is not Cancelled');
        }
        console.log('-> Passed');

        // --- TEST CASE 5: PREVENT CANCEL IF CARTONS ARE MOVED ---
        console.log('\nTest Case 5: Prevent cancellation if cartons are no longer Available or moved...');
        // Let's create a new transfer (in transit)
        const transferRes3 = await handleTransfer({ fromStore: storeA, toStore: storeB, qty: 3, ...sku }, adminUser.id);
        if (!transferRes3.success) throw new Error(`Transfer failed: ${transferRes3.error}`);
        const movementId3 = transferRes3.moveId as string;

        const movementLog3 = db.prepare('SELECT mc_numbers FROM stock_movement_log WHERE movement_id = ?').get(movementId3) as any;
        const mcNumbers3 = movementLog3.mc_numbers.split(',');

        // Now move one carton to another store (simulating subsequent transaction)
        db.prepare("UPDATE fg_stock_master SET cold_store = 'Cancel_Store_C' WHERE mc_number = ?").run(mcNumbers3[0]);

        // Try to cancel it
        const res5 = await callCancelAPI(movementId3, adminToken);
        console.log(`Response Status: ${res5.status}, Error Message: ${res5.data.error}`);
        if (res5.status !== 400 || !res5.data.error.includes('some cartons are no longer Available or have been moved')) {
            throw new Error('Should have blocked cancellation due to subsequently moved carton');
        }
        console.log('-> Passed');

        // --- TEST CASE 6: PREVENT CANCEL IF COMPLETED ---
        console.log('\nTest Case 6: Prevent cancellation of Completed transfers...');
        const inwardRes4 = await handleInward({ toStore: storeA, qty: 3, ...sku }, adminUser.id);
        if (!inwardRes4.success) throw new Error(`Inward failed: ${inwardRes4.error}`);

        const transferRes4 = await handleTransfer({ fromStore: storeA, toStore: storeB, qty: 3, ...sku }, adminUser.id);
        if (!transferRes4.success) throw new Error(`Transfer failed: ${transferRes4.error}`);
        const movementId4 = transferRes4.moveId as string;

        // Complete the transfer
        const movementLog4 = db.prepare('SELECT mc_numbers FROM stock_movement_log WHERE movement_id = ?').get(movementId4) as any;
        const mcNumbers4 = movementLog4.mc_numbers.split(',');
        db.transaction(() => {
            const updateStock = db.prepare("UPDATE fg_stock_master SET cold_store = ?, status = 'Available' WHERE mc_number = ?");
            for (const mc of mcNumbers4) {
                updateStock.run(storeB, mc);
            }
            db.prepare("UPDATE stock_movement_log SET status = 'Completed' WHERE movement_id = ?").run(movementId4);
        })();

        // Try to cancel it
        const res6 = await callCancelAPI(movementId4, adminToken);
        console.log(`Response Status: ${res6.status}, Error Message: ${res6.data.error}`);
        if (res6.status !== 400 || !res6.data.error.includes('Completed transfers cannot be cancelled')) {
            throw new Error('Should have blocked cancellation of completed transfers');
        }
        console.log('-> Passed');

        console.log('\n--- ALL TEST CASES PASSED SUCCESSFULLY ---');

    } catch (e) {
        console.error('\n*** TEST SUITE FAILED ***');
        console.error(e);
        process.exit(1);
    } finally {
        cleanTestData();
        console.log('Test data cleaned successfully.');
    }
}

runTests();
