
import { getDb } from '../lib/db';
import { handleInward, handleTransfer, handleDispatch } from '../lib/stock-logic';

const db = getDb();
const TEST_VARIETY = 'SIM_TEST_VARIETY';
const DEFAULT_STORE = 'FG Store';
const COLD_STORE_A = 'Cold Store A';
const PRODUCTION = 'Production';

async function runSimulation() {
    console.log('--- STARTING STOCK MOVEMENT SIMULATION ---\n');

    // CONFIGURE TEST DATA
    const userId = 1; // Assuming admin user exists
    const variety = TEST_VARIETY;
    const packing = 'TestPacking';
    const grade = 'A';
    const type = 'TestType';

    try {
        // 1. CLEANUP
        console.log('1. CLEANUP: Removing old test data...');
        db.prepare("DELETE FROM fg_stock_master WHERE variety = ?").run(variety);
        db.prepare("DELETE FROM stock_movement_log WHERE variety = ?").run(variety);

        // Ensure Master Data exists
        const ensureStore = db.prepare("INSERT OR IGNORE INTO master_data (cold_store) VALUES (?)");
        ensureStore.run(COLD_STORE_A);
        ensureStore.run(PRODUCTION);
        ensureStore.run(DEFAULT_STORE);
        console.log('   Cleanup Complete.\n');

        // 2. INWARD (100 MCs to FG Store)
        console.log(`2. INWARD: Adding 100 MCs to ${DEFAULT_STORE}...`);
        const inwardRes = await handleInward({
            date: new Date().toISOString().split('T')[0],
            truckNumber: 'TEST-TRUCK',
            containerNumber: 'TEST-ICD',
            invoiceNumber: 'INV-001',
            type,
            variety,
            packing,
            grade,
            qty: 100,
            toStore: DEFAULT_STORE // Required by schema
        }, userId);

        if (!inwardRes.success) throw new Error(`Inward Failed: ${inwardRes.error}`);
        console.log(`   Inward Success. Move ID: ${inwardRes.moveId}`);
        checkBalance(DEFAULT_STORE, 100);


        // 3. TRANSFER (40 MCs FG Store -> Cold Store A)
        console.log(`\n3. TRANSFER: Moving 40 MCs from ${DEFAULT_STORE} to ${COLD_STORE_A}...`);
        const transferRes = await handleTransfer({
            fromStore: DEFAULT_STORE,
            toStore: COLD_STORE_A,
            type,
            variety,
            packing,
            grade,
            qty: 40
        }, userId);

        if (!transferRes.success) throw new Error(`Transfer Failed: ${transferRes.error}`);
        console.log(`   Transfer Success. Moved: ${transferRes.movedCount}`);
        checkBalance(DEFAULT_STORE, 60);
        checkBalance(COLD_STORE_A, 40);


        // 4. TRANSFER PARTIAL/FAIL CHECK (Attempt 70 from FG Store, only 60 avail)
        console.log(`\n4. TRANSFER CHECK: Attempting to move 70 MCs from ${DEFAULT_STORE} (Only 60 Avail)...`);
        const transferFailRes = await handleTransfer({
            fromStore: DEFAULT_STORE,
            toStore: 'Cold Store B',
            type,
            variety,
            packing,
            grade,
            qty: 70
        }, userId);

        // Logic allows partial. Let's see.
        console.log(`   Result: Success=${transferFailRes.success}, Moved=${transferFailRes.movedCount}`);
        if (transferFailRes.movedCount === 60) {
            console.log('   Behaved as expected (Partial move of all 60).');
        } else {
            console.log('   Unexpected behavior.');
        }
        checkBalance(DEFAULT_STORE, 0); // All 60 moved to Cold Store B


        // 5. DISPATCH SCENARIOS

        // 5a. DISPATCH FOR REPACKING (5 MCs)
        console.log(`\n5a. DISPATCH (Repacking): Dispatching 5 MCs from ${COLD_STORE_A} for Repacking...`);
        const repackRes = await handleDispatch({
            fromStore: COLD_STORE_A,
            toStore: 'Repacking Unit', // Should be auto-set by UI but backend validates
            type,
            variety,
            packing,
            grade,
            qty: 5,
            dispatchPurpose: 'REPACKING'
        }, userId);

        if (!repackRes.success) throw new Error(`Repacking Dispatch Failed: ${repackRes.error}`);
        console.log(`   Repacking Dispatch Success.`);

        // 5b. DISPATCH FOR SALE (Linked to PO)
        // First create a dummy PO
        const poId = 999;
        const poNumber = 'TEST-PO-999';
        db.prepare("INSERT OR REPLACE INTO purchase_orders (id, po_number, customer, status, created_at) VALUES (?, ?, 'Test Client', 'Fulfilled', CURRENT_TIMESTAMP)").run(poId, poNumber);

        console.log(`\n5b. DISPATCH (Sale): Dispatching 5 MCs from ${COLD_STORE_A} linked to PO ${poNumber}...`);
        const saleRes = await handleDispatch({
            fromStore: COLD_STORE_A,
            toStore: 'Test Client',
            type,
            variety,
            packing,
            grade,
            qty: 5,
            dispatchPurpose: 'SALE',
            poId: poId
        }, userId);

        if (!saleRes.success) throw new Error(`Sale Dispatch Failed: ${saleRes.error}`);
        console.log(`   Sale Dispatch Success.`);

        // Verify PO Status Update
        const poStatus = db.prepare("SELECT status FROM purchase_orders WHERE id = ?").get(poId) as { status: string };
        if (poStatus.status === 'Dispatched') {
            console.log(`   [PASS] PO Status updated to 'Dispatched'.`);
        } else {
            console.log(`   [FAIL] PO Status is '${poStatus.status}' (Expected 'Dispatched').`);
        }

        // Balances:
        // Started with 40.
        // -5 Repack
        // -5 Sale
        // = 30 Remainder. (Plus the Production test earlier? Let's check flow)
        // Earlier: 
        // 1. Inward 100 to FG.
        // 2. Transfer 40 to Cold Store A. (FG=60, A=40)
        // 3. Transfer Check 70 fail.
        // 4. Dispatch Repack 5 from A. (A=35)
        // 5. Dispatch Sale 5 from A. (A=30)
        // 6. Production Transfer 5 from A. (A=25)

        checkBalance(DEFAULT_STORE, 60); // 100 - 40
        checkBalance(COLD_STORE_A, 25); // 40 - 5 - 5 - 5


        // 6. PRODUCTION (Transfer 5 from Cold Store A -> Production)
        // Production is valid store.
        console.log(`\n6. PRODUCTION: Moving 5 MCs from ${COLD_STORE_A} to ${PRODUCTION}...`);
        const prodRes = await handleTransfer({
            fromStore: COLD_STORE_A,
            toStore: PRODUCTION,
            type,
            variety,
            packing,
            grade,
            qty: 5
        }, userId);

        if (!prodRes.success) throw new Error(`Production Transfer Failed: ${prodRes.error}`);
        console.log(`   Production Transfer Success.`);
        checkBalance(COLD_STORE_A, 25);
        // Production stock isn't in 'Available'?? 
        // Logic: Transfer updates cold_store to 'Production'. Status remains 'Available' unless 'toStore' logic changes status? 
        // handleTransfer just updates cold_store. So it should be Available in Production.
        checkBalance(PRODUCTION, 5);


        console.log('\n--- SIMULATION COMPLETED SUCCESSFULLY ---');

    } catch (error) {
        console.error('\n!!! SIMULATION FAILED !!!');
        console.error(error);
    }
}

function checkBalance(store: string, expected: number) {
    try {
        const stmt = db.prepare("SELECT count(*) as count FROM fg_stock_master WHERE cold_store = ? AND variety = ? AND status = 'Available'");
        const res = stmt.get(store, TEST_VARIETY) as { count: number };

        if (!res) {
            console.error(`   [ERROR] Query returned no row for ${store}`);
            return;
        }

        const actual = res.count;
        if (actual === expected) {
            console.log(`   [PASS] ${store} Balance: ${actual}`);
        } else {
            console.error(`   [FAIL] ${store} Balance: ${actual} (Expected: ${expected})`);
        }
    } catch (e) {
        console.error(`   [EXCEPTION] checkBalance failed for ${store}:`, e);
    }
}

runSimulation();
