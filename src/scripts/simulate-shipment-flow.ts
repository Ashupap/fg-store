
import { getDb } from '@/lib/db';
import { handleInward } from '@/lib/stock-logic';

async function simulateShipmentFlow() {
    console.log('--- Starting Shipment Flow Simulation ---');
    const db = getDb();
    const userId = 1; // Admin

    try {
        // 1. Setup: Clean previous test data
        // Order matters due to Foreign Keys!
        db.prepare("DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_no = 'SHIP-TEST')").run();
        db.prepare("DELETE FROM shipments WHERE shipment_no = 'SHIP-TEST'").run();

        db.prepare("DELETE FROM po_line_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number = 'PO-TEST')").run();
        db.prepare("DELETE FROM purchase_orders WHERE po_number = 'PO-TEST'").run();

        // Clean stock (dangerous but ok for dev simulation specific items)
        // Better: create new stock specific for this test.

        // 2. Create Stock: Inward 50 MCs
        console.log('\n1. Creating Stock (Inward)...');
        const inwardResult = await handleInward({
            toStore: 'Cold Store 1',
            type: 'Test',
            variety: 'V1',
            packing: 'P1',
            grade: 'G1',
            qty: 50,
            remarks: 'For Shipment Test'
        }, userId);

        if (!inwardResult.success) throw new Error('Inward failed');
        console.log('Stock Created:', inwardResult.moveId);

        // 3. Create PO
        console.log('\n2. Creating Purchase Order...');
        const createPoRes = await db.transaction(() => {
            const poResult = db.prepare(`
                INSERT INTO purchase_orders (po_number, customer, order_date, status)
                VALUES ('PO-TEST', 'Test Customer', '2025-12-27', 'Active')
            `).run();
            const poId = poResult.lastInsertRowid as number;

            db.prepare(`
                INSERT INTO po_line_items (po_id, type, variety, grade, packing_code, ordered_qty, allocated_qty)
                VALUES (?, 'Test', 'V1', 'G1', 'P1', 20, 0)
            `).run(poId);

            return poId;
        })();
        const poId = createPoRes;
        console.log('PO Created ID:', poId);

        // 4. Allocate Stock to PO (Using DB logic found in api/po/[id]/allocate)
        console.log('\n3. Allocating Stock to PO...');
        // Need to replicate `allocate` logic or call it? 
        // I will replicate the core DB update logic here for simulation.

        const lineItem = db.prepare("SELECT id FROM po_line_items WHERE po_id = ?").get(poId) as { id: number };

        // Find 20 Available MCs
        const stock = db.prepare(`
            SELECT id, mc_number FROM fg_stock_master 
            WHERE type='Test' AND variety='V1' AND packing_code='P1' AND grade='G1' AND status='Available' 
            LIMIT 20
        `).all() as { id: number, mc_number: string }[];

        if (stock.length < 20) throw new Error(`Not enough stock found! Found ${stock.length}`);

        // Reserve them
        const updateStock = db.prepare("UPDATE fg_stock_master SET status='Reserved', reserved_for_po='PO-TEST', reserved_line_item=?, updated_at=CURRENT_TIMESTAMP WHERE id=?");
        const updateLine = db.prepare("UPDATE po_line_items SET allocated_qty = allocated_qty + ? WHERE id=?");

        db.transaction(() => {
            for (const s of stock) {
                updateStock.run(lineItem.id, s.id);
            }
            updateLine.run(stock.length, lineItem.id);
        })();
        console.log(`Allocated ${stock.length} MCs to PO.`);

        // 5. Create Shipment
        console.log('\n4. Creating Shipment...');
        // Replicate `POST /api/shipment` logic
        const shipmentResult = db.transaction(() => {
            const res = db.prepare(`
                INSERT INTO shipments (po_id, shipment_no, container_no, seal_no, status)
                VALUES (?, 'SHIP-TEST', 'CONT-1234', 'SEAL-999', 'Created')
            `).run(poId);
            const shipmentId = res.lastInsertRowid;

            // Add items
            const insertItem = db.prepare("INSERT INTO shipment_items (shipment_id, mc_number) VALUES (?, ?)");
            for (const s of stock) {
                insertItem.run(shipmentId, s.mc_number);
            }
            return shipmentId;
        })();
        const shipmentId = shipmentResult;
        console.log('Shipment Created ID:', shipmentId);

        // 6. Simulate Scanning (Loading)
        console.log('\n5. Simulating Scanning...');
        // Pick one MC to scan
        const mcToScan = stock[0].mc_number;
        console.log(`Scanning MC: ${mcToScan}`);

        // Verify and Load
        const item = db.prepare("SELECT id, is_loaded FROM shipment_items WHERE shipment_id = ? AND mc_number = ?").get(shipmentId, mcToScan) as any;
        if (item && !item.is_loaded) {
            db.prepare("UPDATE shipment_items SET is_loaded=1, loaded_at=CURRENT_TIMESTAMP WHERE id=?").run(item.id);
            db.prepare("UPDATE shipments SET status='Loading' WHERE id=?").run(shipmentId);
            console.log('-> Validated & Loaded Successfully!');
        } else {
            console.error('-> Failed to validate!');
        }

        // 7. Verify Status
        const status = db.prepare("SELECT status FROM shipments WHERE id=?").get(shipmentId) as any;
        // Wait, schema check. `shipments` does NOT have `loaded_items` column in `db.ts` or view?
        // `page.tsx` used `loaded_items`.
        // Let's check `api/shipment/list` to see how it computes it.
        // It probably does a JOIN/COUNT.

        const count = db.prepare("SELECT COUNT(*) as c FROM shipment_items WHERE shipment_id=? AND is_loaded=1").get(shipmentId) as { c: number };
        console.log(`Shipment Status: ${status.status}, Loaded: ${count.c}/20`);

        console.log('\n--- Simulation Complete: SUCCESS ---');

    } catch (e) {
        console.error('Simulation Failed:', e);
    }
}

simulateShipmentFlow();
