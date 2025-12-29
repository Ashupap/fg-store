import Database from 'better-sqlite3';
import path from 'path';
import { handleInward, handleTransfer, handleDispatch } from '../lib/stock-logic';
import { autoAllocatePO } from '../lib/allocation';

// Mock Config & DB
const dbPath = path.join(process.cwd(), 'data', 'fg-store.db');
const db = new Database(dbPath);

// Utils
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

// Generate unique suffix to avoid collisions since we are NOT clearing data
const SUFFIX = Math.floor(Date.now() / 1000);

async function main() {
    console.log('🚀 Starting Full App Data Flow Tests (Persistence Mode)...\n');
    console.log(`ℹ️  Test Run Suffix: ${SUFFIX}`);

    // --- 1. Production Inward (Bulk AME & BME) ---
    await runTest('1. Production Inward (AME & BME)', async () => {
        // AME Batch 1
        console.log('   -> AME: Inward 50 MCs of 13/15 PDTO...');
        const resA1 = await handleInward({
            toStore: 'AME',
            type: 'IQF',
            variety: 'PDTO',
            packing: '5 X 2 LBS',
            grade: '13/15',
            qty: 50,
            remarks: `Test Run ${SUFFIX} - AME Batch 1`
        }, 1);
        assert(resA1.success, 'AME Batch 1 Failed');

        // AME Batch 2
        console.log('   -> AME: Inward 50 MCs of 13/15 PDTO (2nd Batch)...');
        const resA2 = await handleInward({
            toStore: 'AME',
            type: 'IQF',
            variety: 'PDTO',
            packing: '5 X 2 LBS',
            grade: '13/15',
            qty: 50,
            remarks: `Test Run ${SUFFIX} - AME Batch 2`
        }, 1);
        assert(resA2.success, 'AME Batch 2 Failed');

        // BME Batch (Different Product)
        console.log('   -> BME: Inward 50 MCs of 16/20 HL Block...');
        const resB = await handleInward({
            toStore: 'BME',
            type: 'SLAB',
            variety: 'HL IQF',
            packing: '10 X 2 LBS',
            grade: '16/20',
            qty: 50,
            remarks: `Test Run ${SUFFIX} - BME Batch`
        }, 1);
        assert(resB.success, 'BME Batch Failed');
    });

    // --- 2. Inventory Transfer (AME -> BBSR) ---
    await runTest('2. Transfer AME -> BBSR', async () => {
        console.log('   -> Transferring 30 MCs from AME to BBSR...');
        const resWait = await handleTransfer({
            fromStore: 'AME',
            toStore: 'BBSR',
            type: 'IQF',
            variety: 'PDTO',
            packing: '5 X 2 LBS',
            grade: '13/15',
            qty: 30
        }, 1);
        assert(resWait.success, 'Transfer Failed');
    });

    // --- 3. Global Allocation (Multi-Store) ---
    let poIdGlobal: number;
    await runTest('3. Global Allocation (AME + BBSR)', async () => {
        const poNum = `PO-G-${SUFFIX}`;
        console.log(`   -> Creating ${poNum} for 80 MCs (Will pull from AME & BBSR)...`);

        const createPo = db.transaction(() => {
            const res = db.prepare('INSERT INTO purchase_orders (po_number, order_date, status) VALUES (?, ?, ?)')
                .run(poNum, new Date().toISOString(), 'Active');
            const pid = res.lastInsertRowid as number;
            db.prepare('INSERT INTO po_line_items (po_id, grade, packing_code, ordered_qty, allocated_qty, type, variety) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(pid, '13/15', '5X2LBS', 80, 0, 'IQF', 'PDTO');
            return pid;
        });
        poIdGlobal = createPo();

        const allocated = autoAllocatePO(poIdGlobal);
        console.log(`   -> Allocated: ${allocated}`);
        assert(allocated === 80, `Step 3 Alloc: Expected 80, Got ${allocated}`);
    });

    // --- 4. Backorder Rush ---
    await runTest('4. Backorder Production Rush', async () => {
        const poNum = `PO-R-${SUFFIX}`;
        console.log(`   -> Creating Backorder ${poNum} for 20 MCs of 21/25...`);

        const createPo = db.transaction(() => {
            const res = db.prepare('INSERT INTO purchase_orders (po_number, order_date, status) VALUES (?, ?, ?)')
                .run(poNum, new Date().toISOString(), 'Active');
            const pid = res.lastInsertRowid as number;
            db.prepare('INSERT INTO po_line_items (po_id, grade, packing_code, ordered_qty, allocated_qty, type, variety) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(pid, '21/25', '5X2LBS', 20, 0, 'IQF', 'PDTO');
            return pid;
        });
        const rushPoId = createPo();
        console.log(`   -> Rush PO ID: ${rushPoId}`);

        // Check 0 alloc
        const res0 = autoAllocatePO(rushPoId);
        assert(res0 === 0, 'Should be 0 initially');

        // Rush Production (Inward 50 to cover potential backlogs from prev runs)
        console.log('   -> AME Rush Production: 50 MCs of 21/25...');
        const resRush = await handleInward({
            toStore: 'AME',
            type: 'IQF',
            variety: 'PDTO',
            packing: '5 X 2 LBS',
            grade: '21/25',
            qty: 50,
            remarks: `Rush Order for ${poNum}`
        }, 1);
        assert(resRush.success, 'Rush Inward Failed');

        // Validating auto-fill
        const lineItem = db.prepare('SELECT allocated_qty, ordered_qty FROM po_line_items WHERE po_id = ?').get(rushPoId) as any;
        console.log(`   -> Validating PO ${poNum}: Ordered ${lineItem.ordered_qty}, Allocated ${lineItem.allocated_qty}`);

        assert(lineItem.allocated_qty === 20, `Step 4 Alloc: Expected 20, Got ${lineItem.allocated_qty}`);
    });

    console.log('\n✅ ALL SCENARIOS COMPLETED.');
    console.log('👉 Data has been RETAINED for UI verification.');
}

main().catch(console.error);
