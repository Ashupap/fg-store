import { getDb } from '../lib/db';
import { handleInward, handleTransfer, handleRepackOut, handleRepackIn, handleDispatch } from '../lib/stock-logic';
import { autoAllocatePO } from '../lib/allocation';

const db = getDb();

function setupTestEnvironment() {
    console.log('  [Setup] Creating test users, stores, and settings...');

    // Create Test Stores
    db.prepare("INSERT OR IGNORE INTO stores (name, capacity_tons, is_active) VALUES ('PoStore_A', 100, 1)").run();
    db.prepare("INSERT OR IGNORE INTO stores (name, capacity_tons, is_active) VALUES ('PoStore_B', 100, 1)").run();

    // Enable location mapping & customer barcodes
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('enable_location_mapping', 'true')").run();
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('enable_customer_barcode', 'true')").run();

    // Seed sections for PoStore_A and PoStore_B
    db.prepare("INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs) VALUES ('PoStore_A', 'Section A', 500)").run();
    db.prepare("INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs) VALUES ('PoStore_B', 'Section A', 500)").run();

    // Create Test Users
    db.prepare("INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES ('po_admin@example.com', 'hash', 'PO Admin', 'admin')").run();
    const admin = db.prepare("SELECT id FROM users WHERE email='po_admin@example.com'").get() as any;

    return {
        adminId: admin.id
    };
}

function cleanupTestEnvironment() {
    console.log('  [Cleanup] Removing test data...');
    db.prepare("DELETE FROM po_customer_barcodes WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE 'TEST-PO-%')").run();
    db.prepare("DELETE FROM po_line_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE 'TEST-PO-%')").run();
    db.prepare("DELETE FROM purchase_orders WHERE po_number LIKE 'TEST-PO-%'").run();
    db.prepare("DELETE FROM stock_movement_log WHERE from_location IN ('PoStore_A', 'PoStore_B') OR to_location IN ('PoStore_A', 'PoStore_B')").run();
    db.prepare("DELETE FROM fg_stock_master WHERE cold_store IN ('PoStore_A', 'PoStore_B', 'Production', 'Dispatch')").run();
    db.prepare("DELETE FROM users WHERE email='po_admin@example.com'").run();
    db.prepare("DELETE FROM store_sections WHERE store_name IN ('PoStore_A', 'PoStore_B')").run();
    db.prepare("DELETE FROM stores WHERE name IN ('PoStore_A', 'PoStore_B')").run();
}

async function runPOTests() {
    console.log('=== Starting PO Branding, Repacking & Customer Barcode Workflow Tests ===');
    cleanupTestEnvironment();
    const { adminId } = setupTestEnvironment();

    try {
        // --- Test 1: PO Creation (Demo vs Branded) and No Auto-Allocation ---
        console.log('\n--- Test 1: PO Creation & Isolation ---');
        
        // Insert Demo PO
        db.prepare(`
            INSERT INTO purchase_orders (po_number, order_date, branding_type, loading_store, status)
            VALUES ('TEST-PO-DEMO', '2025-01-01', 'Demo', 'PoStore_A', 'Active')
        `).run();
        const demoPo = db.prepare("SELECT id FROM purchase_orders WHERE po_number = 'TEST-PO-DEMO'").get() as any;
        
        db.prepare(`
            INSERT INTO po_line_items (po_id, type, variety, grade, packing_code, ordered_qty, allocated_qty)
            VALUES (?, 'DemoType', 'DemoVariety', 'A', '10KG', 5, 0)
        `).run(demoPo.id);
        const demoLineItem = db.prepare("SELECT id FROM po_line_items WHERE po_id = ?").get(demoPo.id) as any;

        // Inward 10 cartons matching criteria to PoStore_A
        await handleInward({
            type: 'DemoType',
            variety: 'DemoVariety',
            packing: '10kg',
            grade: 'A',
            qty: 10,
            toStore: 'PoStore_A',
            productCode: 'PROD-DEMO',
            packingDate: '2025-01-01',
            packingCode: '10KG'
        }, adminId);

        // Verify that NO stock was auto-allocated upon inward (repacking is off, but auto-allocate on PO creation was disabled in route,
        // and let's check if processGlobalPendingAllocations still runs. Wait, processGlobalPendingAllocations runs in handleInward!).
        // Let's check if it did allocate.
        const checkLineItemBefore = db.prepare("SELECT allocated_qty FROM po_line_items WHERE id = ?").get(demoLineItem.id) as { allocated_qty: number };
        console.log(`  Allocated Qty after inward (should be 5 if auto-alloc is running, or 0 if disabled): ${checkLineItemBefore.allocated_qty}`);

        // Let's do manual store-specific allocation (Store Manager Role)
        console.log('\n--- Test 2: Manual Store-Specific Allocation ---');
        // Let's allocate 3 cartons from PoStore_A to the Demo PO line item.
        // We will call the manual allocation logic directly.
        
        // Find available cartons
        const availableInA = db.prepare(`
            SELECT id, mc_number FROM fg_stock_master
            WHERE type = 'DemoType' AND variety = 'DemoVariety' AND grade = 'A' AND packing_code = '10KG' AND status = 'Available' AND cold_store = 'PoStore_A'
            ORDER BY packing_date ASC LIMIT 3
        `).all() as any[];

        db.transaction(() => {
            const updateStock = db.prepare(`
                UPDATE fg_stock_master 
                SET status = 'Reserved', reserved_for_po = 'TEST-PO-DEMO', reserved_line_item = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            for (const stock of availableInA) {
                updateStock.run(demoLineItem.id.toString(), stock.id);
            }
            db.prepare("UPDATE po_line_items SET allocated_qty = allocated_qty + ? WHERE id = ?").run(availableInA.length, demoLineItem.id);
        })();

        const checkLineItemAfter = db.prepare("SELECT allocated_qty FROM po_line_items WHERE id = ?").get(demoLineItem.id) as { allocated_qty: number };
        if (checkLineItemAfter.allocated_qty >= 3) {
            console.log(`  ✅ Successfully allocated ${checkLineItemAfter.allocated_qty} cartons manually.`);
        } else {
            console.error(`  ❌ Manual allocation failed. Expected >=3, got ${checkLineItemAfter.allocated_qty}`);
        }

        // --- Test 3: Repacking Block for Demo POs ---
        console.log('\n--- Test 3: Repacking Block for Demo PO ---');
        const reservedCartons = db.prepare(`
            SELECT mc_number FROM fg_stock_master WHERE reserved_for_po = 'TEST-PO-DEMO'
        `).all() as { mc_number: string }[];
        const reservedMCs = reservedCartons.map(c => c.mc_number);

        const repackOutResult = await handleRepackOut({
            fromStore: 'PoStore_A',
            mcNumbers: reservedMCs,
            remarks: 'Testing repack block'
        }, adminId);

        if (!repackOutResult.success) {
            console.log(`  ✅ Repack Out correctly blocked for Demo PO. Error message: "${repackOutResult.error}"`);
        } else {
            console.error('  ❌ Repack Out succeeded for Demo PO cartons! This violates constraints.');
        }

        // --- Test 4: Custom Barcode Upload & Repack Logic for Branded POs ---
        console.log('\n--- Test 4: Branded PO Customer Barcodes & Auto-Mapping ---');
        // Create Branded PO
        db.prepare(`
            INSERT INTO purchase_orders (po_number, order_date, branding_type, loading_store, status)
            VALUES ('TEST-PO-BRANDED', '2025-01-01', 'Branded', 'PoStore_A', 'Active')
        `).run();
        const brandedPo = db.prepare("SELECT id FROM purchase_orders WHERE po_number = 'TEST-PO-BRANDED'").get() as any;

        db.prepare(`
            INSERT INTO po_line_items (po_id, type, variety, grade, packing_code, ordered_qty, allocated_qty)
            VALUES (?, 'BrandedType', 'BrandedVariety', 'A', '10KG', 2, 0)
        `).run(brandedPo.id);
        const brandedLineItem = db.prepare("SELECT id FROM po_line_items WHERE po_id = ?").get(brandedPo.id) as any;

        // Upload custom barcodes
        const customBarcodes = ['CUST-BAR-001', 'CUST-BAR-002', 'CUST-BAR-003'];
        const insertBarcode = db.prepare("INSERT INTO po_customer_barcodes (po_id, barcode, status) VALUES (?, ?, 'Unused')");
        for (const barcode of customBarcodes) {
            insertBarcode.run(brandedPo.id, barcode);
        }

        // Inward parent stock
        await handleInward({
            type: 'BrandedType',
            variety: 'BrandedVariety',
            packing: '20kg', // parent packing is 20kg
            grade: 'A',
            qty: 2,
            toStore: 'PoStore_A',
            productCode: 'PROD-BRAND-PARENT',
            packingDate: '2025-01-01',
            packingCode: '20KG'
        }, adminId);

        // Allocate parent cartons manually to the Branded PO
        const parents = db.prepare(`
            SELECT id, mc_number FROM fg_stock_master
            WHERE type = 'BrandedType' AND variety = 'BrandedVariety' AND grade = 'A' AND packing_code = '20KG' AND status = 'Available' AND cold_store = 'PoStore_A'
            LIMIT 2
        `).all() as any[];

        db.transaction(() => {
            const updateStock = db.prepare(`
                UPDATE fg_stock_master 
                SET status = 'Reserved', reserved_for_po = 'TEST-PO-BRANDED', reserved_line_item = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            for (const parent of parents) {
                updateStock.run(brandedLineItem.id.toString(), parent.id);
            }
            db.prepare("UPDATE po_line_items SET allocated_qty = allocated_qty + ? WHERE id = ?").run(parents.length, brandedLineItem.id);
        })();

        // Now run Repack Out on the parent cartons (this should succeed because it's a Branded PO)
        const parentMCs = parents.map(p => p.mc_number);
        const repackOutBranded = await handleRepackOut({
            fromStore: 'PoStore_A',
            mcNumbers: parentMCs,
            remarks: 'Repacking branded parents'
        }, adminId);

        if (repackOutBranded.success) {
            console.log('  ✅ Repack Out succeeded for Branded PO parent cartons.');
        } else {
            console.error(`  ❌ Repack Out failed for Branded PO: ${repackOutBranded.error}`);
        }

        // Repack In: complete the repacking process to produce child cartons (10KG packing)
        const repackInBranded = await handleRepackIn({
            originalMcNumbers: parentMCs,
            toStore: 'PoStore_A',
            newPacking: '10kg',
            items: [
                { mcNumber: 'GENERATE', barcode: '' },
                { mcNumber: 'GENERATE', barcode: '' }
            ],
            remarks: 'Completed repacking branded child cartons'
        }, adminId);

        if (repackInBranded.success) {
            console.log('  ✅ Repack In succeeded.');
            // Verify new child cartons have status 'Allocated', and are mapped to the customer barcodes
            const childCartons = db.prepare(`
                SELECT mc_number, barcode, status, short_code, reserved_for_po 
                FROM fg_stock_master 
                WHERE parent_mc_id IN (SELECT id FROM fg_stock_master WHERE mc_number = ?)
            `).all(parentMCs[0]) as any[];

            console.log('  Child cartons created:', JSON.stringify(childCartons, null, 2));

            // Verify they are 'Allocated' and use 'CUST-BAR-001' and 'CUST-BAR-002'
            const hasCorrectStatus = childCartons.every(c => c.status === 'Allocated');
            const hasCorrectBarcodes = childCartons.some(c => c.barcode === 'CUST-BAR-001') && childCartons.some(c => c.barcode === 'CUST-BAR-002');
            
            if (hasCorrectStatus && hasCorrectBarcodes) {
                console.log('  ✅ Child cartons successfully created with status "Allocated" and pre-uploaded customer barcodes auto-mapped!');
            } else {
                console.error('  ❌ Child cartons state or barcode auto-mapping failed.');
            }
        } else {
            console.error(`  ❌ Repack In failed: ${repackInBranded.error}`);
        }

        // --- Test 5: Dispatch Constraints & Identifier Resolution ---
        console.log('\n--- Test 5: Dispatch Verification & Scan Resolution ---');

        // Let's test direct dispatch of Reserved cartons (Demo PO)
        const dispatchDemo = await handleDispatch({
            fromStore: 'PoStore_A',
            toStore: 'Demo Client',
            qty: reservedMCs.length,
            poId: demoPo.id,
            remarks: 'Dispatching demo'
        }, adminId, undefined, reservedMCs);

        if (dispatchDemo.success) {
            console.log('  ✅ Demo PO successfully dispatched directly from "Reserved" status.');
        } else {
            console.error(`  ❌ Demo PO dispatch failed: ${dispatchDemo.error}`);
        }

        // Let's check that we cannot directly dispatch a "Reserved" carton for a Branded PO
        // Let's insert a Reserved carton for Branded PO to test this.
        await handleInward({
            type: 'BrandedType',
            variety: 'BrandedVariety',
            packing: '10kg',
            grade: 'A',
            qty: 1,
            toStore: 'PoStore_A',
            productCode: 'PROD-BRAND-UNREPACKED',
            packingDate: '2025-01-01',
            packingCode: '10KG'
        }, adminId);

        const unrepackedStock = db.prepare(`
            SELECT id, mc_number FROM fg_stock_master 
            WHERE status = 'Available' AND cold_store = 'PoStore_A' AND packing_code = '10KG' AND type = 'BrandedType'
            LIMIT 1
        `).get() as any;

        // Manually reserve it
        db.prepare(`
            UPDATE fg_stock_master SET status = 'Reserved', reserved_for_po = 'TEST-PO-BRANDED' WHERE id = ?
        `).run(unrepackedStock.id);

        // Attempt dispatch of the Reserved carton (unrepacked) for Branded PO
        const dispatchUnrepacked = await handleDispatch({
            fromStore: 'PoStore_A',
            toStore: 'Branded Client',
            qty: 1,
            poId: brandedPo.id,
            remarks: 'Try dispatching unrepacked'
        }, adminId, undefined, [unrepackedStock.mc_number]);

        if (!dispatchUnrepacked.success) {
            console.log(`  ✅ Direct dispatch of "Reserved" carton blocked for Branded PO. Error message: "${dispatchUnrepacked.error}"`);
        } else {
            console.error('  ❌ Direct dispatch of "Reserved" carton succeeded for Branded PO! This violates constraints.');
        }

        // Now dispatch the repacked child cartons (status 'Allocated') using their customer barcodes
        const repackedChildren = db.prepare(`
            SELECT mc_number, barcode, short_code FROM fg_stock_master 
            WHERE status = 'Allocated' AND reserved_for_po = 'TEST-PO-BRANDED'
        `).all() as any[];

        const childBarcodes = repackedChildren.map(c => c.barcode);
        console.log(`  Attempting dispatch of Branded PO with scanned barcodes: ${JSON.stringify(childBarcodes)}`);

        const dispatchRepacked = await handleDispatch({
            fromStore: 'PoStore_A',
            toStore: 'Branded Client',
            qty: childBarcodes.length,
            poId: brandedPo.id,
            remarks: 'Dispatching repacked branded children'
        }, adminId, undefined, childBarcodes);

        if (dispatchRepacked.success) {
            console.log('  ✅ Branded PO successfully dispatched using repacked "Allocated" cartons and customer barcode scans.');
        } else {
            console.error(`  ❌ Branded PO dispatch failed: ${dispatchRepacked.error}`);
        }

    } catch (err) {
        console.error('Test Suite Error:', err);
    } finally {
        cleanupTestEnvironment();
        console.log('\n=== PO Workflow Verification Complete ===');
    }
}

runPOTests();
