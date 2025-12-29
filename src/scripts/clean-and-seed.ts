import Database from 'better-sqlite3';
import path from 'path';
import { handleInward, handleDispatch } from '../lib/stock-logic';
import { autoAllocatePO } from '../lib/allocation';

const dbPath = path.join(process.cwd(), 'data', 'fg-store.db');
const db = new Database(dbPath);
const SUFFIX = Math.floor(Date.now() / 1000);

async function main() {
    console.log('🧹 Cleaning up Debug Data...');

    // 1. Delete debug movements and stock
    const debugStores = ['debug_A', 'debug_B'];
    const placeholders = debugStores.map(() => '?').join(',');

    db.prepare(`DELETE FROM fg_stock_master WHERE cold_store IN (${placeholders})`).run(...debugStores);
    db.prepare(`DELETE FROM stock_movement_log WHERE from_location IN (${placeholders}) OR to_location IN (${placeholders})`).run(...debugStores, ...debugStores);

    console.log('✅ Debug data cleared.');

    console.log('\n🌱 Seeding Realistic Transactions...');

    // 2. Scenario: Export Sale Dispatch
    // Store: AME (IQF)
    // Product: 13/15 PDTO
    // Qty: 100 MCs
    // PO: PO-EXP-001

    console.log('   1. Creating PO-EXP-001...');
    const poExpId = db.transaction(() => {
        const res = db.prepare("INSERT INTO purchase_orders (po_number, order_date, status) VALUES (?, ?, 'Active')").run(`PO-EXP-${SUFFIX}`, new Date().toISOString());
        const pid = res.lastInsertRowid as number;
        // Line Item
        db.prepare(`
            INSERT INTO po_line_items (po_id, grade, packing_code, ordered_qty, allocated_qty, type, variety)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(pid, '13/15', '5X2LBS', 100, 0, 'IQF', 'PDTO');
        return pid;
    })();

    console.log('   2. Producing Stock (Inward to AME)...');
    // We need 100 MCs available
    const inward = await handleInward({
        toStore: 'AME',
        type: 'IQF',
        variety: 'PDTO',
        packing: '5 X 2 LBS',
        grade: '13/15',
        qty: 100,
        remarks: 'Production for Export'
    }, 1);

    if (!inward.success) {
        console.error('Inward failed:', inward.error);
        process.exit(1);
    }

    // Auto-allocate
    const allocated = autoAllocatePO(poExpId);
    console.log(`   Allocated to PO: ${allocated}/100`);

    console.log('   3. Dispatching Stock...');
    // Dispatch Purpose: SALE
    // We need to fetch the Specific MCs? 
    // Usually usage is via barcode, but here we can rely on FIFO logic in handleDispatch if specificMCNumbers is omitted.
    // Wait, handleDispatch documentation/code says:
    // if specificMCNumbers is omitted -> FIFO Selection.

    const dispatch = await handleDispatch({
        fromStore: 'AME',
        toStore: 'External Client', // or Buyer Name
        type: 'IQF',
        variety: 'PDTO',
        packing: '5 X 2 LBS',
        grade: '13/15',
        qty: 100,
        dispatchPurpose: 'SALE',
        poId: poExpId
    }, 1);

    if (dispatch.success) {
        console.log(`✅ Dispatched 100 MCs from AME. Status: Completed.`);
    } else {
        console.error('❌ Dispatch failed:', dispatch.error);
        process.exit(1);
    }

    console.log('\n✅ Seed Complete. check Dashboard for Dispatch stats.');
}

main().catch(console.error);
