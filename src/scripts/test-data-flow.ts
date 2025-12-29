import Database from 'better-sqlite3';
import path from 'path';
import { handleInward, handleDispatch } from '../lib/stock-logic';
import { autoAllocatePO, processGlobalPendingAllocations } from '../lib/allocation';

// Mock Config & DB
const dbPath = path.join(process.cwd(), 'data', 'fg-store.db');
const db = new Database(dbPath);

// Helper Query Functions
const getPO = (poNumber: string) => db.prepare('SELECT * FROM purchase_orders WHERE po_number = ?').get(poNumber) as any;
const getPOLineItems = (poId: number) => db.prepare('SELECT * FROM po_line_items WHERE po_id = ?').all(poId) as any[];
const getStockCount = (grade: string, status: string = 'Available') => {
    const res = db.prepare('SELECT COUNT(*) as count FROM fg_stock_master WHERE grade = ? AND status = ?').get(grade, status) as { count: number };
    return res.count;
};
const getReservedStockCount = (poNumber: string) => {
    const res = db.prepare('SELECT COUNT(*) as count FROM fg_stock_master WHERE reserved_for_po = ?').get(poNumber) as { count: number };
    return res.count;
};

// Test Runner Helpers
const runTest = async (name: string, fn: () => Promise<void>) => {
    console.log(`\n🧪 Testing: ${name}...`);
    try {
        await fn();
        console.log(`✅ ${name} Passed`);
    } catch (error: any) {
        console.error(`❌ ${name} Failed:`, error.message);
        process.exit(1);
    }
};

const assert = (condition: boolean, msg: string) => {
    if (!condition) throw new Error(msg);
};

// Main Test Suite
async function main() {
    console.log('🚀 Starting Automated Data Flow Tests...\n');

    // SCENARIO 1: Happy Path - Immediate Allocation
    await runTest('Scenario 1: Immediate Allocation', async () => {
        // 1. Inward Stock
        console.log('   -> Inwarding 100 MCs of Grade 13/15...');
        const inwardRes = await handleInward({
            toStore: 'AME',
            type: 'IQF',
            variety: 'PDTO',
            packing: '5 X 2 LBS', // code 5X2LBS
            grade: '13/15',
            qty: 100,
            remarks: 'Test Init'
        }, 1);
        if (!inwardRes.success) throw new Error(`Inward failed: ${inwardRes.error}`);

        assert(getStockCount('13/15', 'Available') === 100, 'Stock should be 100 Available');

        // 2. Create PO
        console.log('   -> Creating PO-TEST-01 for 50 MCs...');
        const createPo = db.transaction(() => {
            const res = db.prepare('INSERT INTO purchase_orders (po_number, order_date, status) VALUES (?, ?, ?)')
                .run('PO-TEST-01', new Date().toISOString(), 'Active');
            const poId = res.lastInsertRowid as number;
            db.prepare('INSERT INTO po_line_items (po_id, grade, packing_code, ordered_qty, allocated_qty, type, variety) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(poId, '13/15', '5X2LBS', 50, 0, 'IQF', 'PDTO');
            return poId;
        });
        const poId = createPo();

        // 3. Trigger Allocation (Mocking API trigger)
        console.log('   -> Triggering Auto Allocation...');
        const allocated = autoAllocatePO(poId);

        // 4. Verify
        assert(allocated === 50, `Expected 50 allocated, got ${allocated}`);
        assert(getReservedStockCount('PO-TEST-01') === 50, 'Stock records should be reserved');
        assert(getStockCount('13/15', 'Available') === 50, 'Remaining available stock should be 50');

        const lineItem = getPOLineItems(poId)[0];
        assert(lineItem.allocated_qty === 50, 'Line item allocated_qty should be 50');
    });

    // SCENARIO 2: Backorder Flow - Inward Trigger
    await runTest('Scenario 2: Backorder Auto-Fill', async () => {
        // 1. Create Backorder PO (No stock for 16/20)
        console.log('   -> Creating PO-TEST-02 (Backorder) for 20 MCs of 16/20...');
        const createPo = db.transaction(() => {
            const res = db.prepare('INSERT INTO purchase_orders (po_number, order_date, status) VALUES (?, ?, ?)')
                .run('PO-TEST-02', new Date().toISOString(), 'Active');
            const poId = res.lastInsertRowid as number;
            db.prepare('INSERT INTO po_line_items (po_id, grade, packing_code, ordered_qty, allocated_qty, type, variety) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(poId, '16/20', '5X2LBS', 20, 0, 'IQF', 'PDTO');
            return poId;
        });
        const poId = createPo();

        // Initial check - should be 0
        const allocInitial = autoAllocatePO(poId);
        assert(allocInitial === 0, 'Should allocate 0 initially');

        // 2. Inward Stock (Trigger Global Allocation)
        console.log('   -> Inwarding 20 MCs of 16/20...');
        // Note: handleInward calls processGlobalPendingAllocations internally now!
        const inwardRes = await handleInward({
            toStore: 'AME',
            type: 'IQF',
            variety: 'PDTO',
            packing: '5 X 2 LBS',
            grade: '16/20',
            qty: 20
        }, 1);
        assert(inwardRes.success === true, 'Inward failed');

        // 3. Verify Auto-Allocation happened
        const lineItem = getPOLineItems(poId)[0];
        assert(lineItem.allocated_qty === 20, `Backorder should be filled. Got ${lineItem.allocated_qty}/20`);
        assert(getReservedStockCount('PO-TEST-02') === 20, 'Stock should be reserved for PO-TEST-02');
    });

    // SCENARIO 3: FIFO Fairness
    await runTest('Scenario 3: FIFO Priority', async () => {
        // 1. Create Old PO (High Priority) - 10 MCs of 21/25
        const createOldPO = db.transaction(() => {
            const res = db.prepare('INSERT INTO purchase_orders (po_number, order_date, created_at, status) VALUES (?, ?, ?, ?)')
                .run('PO-OLD', '2024-01-01', '2024-01-01T10:00:00Z', 'Active');
            const poId = res.lastInsertRowid as number;
            db.prepare('INSERT INTO po_line_items (po_id, grade, packing_code, ordered_qty, allocated_qty, type, variety) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(poId, '21/25', '5X2LBS', 10, 0, 'IQF', 'PDTO');
            return poId;
        });
        const oldPoId = createOldPO();

        // 2. Create New PO (Low Priority) - 10 MCs of 21/25
        const createNewPO = db.transaction(() => {
            const res = db.prepare('INSERT INTO purchase_orders (po_number, order_date, created_at, status) VALUES (?, ?, ?, ?)')
                .run('PO-NEW', '2024-01-02', '2024-01-02T10:00:00Z', 'Active');
            const poId = res.lastInsertRowid as number;
            db.prepare('INSERT INTO po_line_items (po_id, grade, packing_code, ordered_qty, allocated_qty, type, variety) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(poId, '21/25', '5X2LBS', 10, 0, 'IQF', 'PDTO');
            return poId;
        });
        const newPoId = createNewPO();

        // 3. Inward only 10 MCs (Enough for one)
        console.log('   -> Inwarding 10 MCs of 21/25 (Scarcity)...');
        await handleInward({
            toStore: 'AME',
            type: 'IQF',
            variety: 'PDTO',
            packing: '5 X 2 LBS',
            grade: '21/25',
            qty: 10
        }, 1);

        // 4. Verify FIFO - Old PO gets it
        const oldItems = getPOLineItems(oldPoId)[0];
        const newItems = getPOLineItems(newPoId)[0];

        assert(oldItems.allocated_qty === 10, `PO-OLD should have 10. Got ${oldItems.allocated_qty}`);
        assert(newItems.allocated_qty === 0, `PO-NEW should have 0. Got ${newItems.allocated_qty}`);
        assert(getReservedStockCount('PO-OLD') === 10, 'Stock reserved for PO-OLD');
    });

    console.log('\n✅ ALL AUTOMATED SCENARIOS PASSED SUCCESSFULLY!');
}

main().catch(console.error);
