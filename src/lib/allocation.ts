import { getDb } from '@/lib/db';

/**
 * Attempts to allocate available stock to a specific PO.
 * Returns the number of items allocated.
 */
export function autoAllocatePO(poId: number): number {
    const db = getDb();
    let totalAllocated = 0;

    // Get Pending Line Items
    const lineItems = db.prepare(`
        SELECT id, type, variety, grade, packing_code, ordered_qty, allocated_qty, po_id
        FROM po_line_items 
        WHERE po_id = ? AND allocated_qty < ordered_qty
    `).all(poId) as any[];

    if (lineItems.length === 0) return 0;

    const transaction = db.transaction(() => {
        for (const item of lineItems) {
            const pendingQty = item.ordered_qty - item.allocated_qty;
            if (pendingQty <= 0) continue;

            // Find Available Stock (FIFO)
            // Explicitly match Type, Variety, Grade, Packing
            // And ensure status is 'Available'
            const availableStock = db.prepare(`
                SELECT id, mc_number FROM fg_stock_master
                WHERE status = 'Available'
                AND type = ?
                AND variety = ?
                AND grade = ?
                AND packing_code = ?
                ORDER BY packing_date ASC
                LIMIT ?
            `).all(item.type, item.variety, item.grade, item.packing_code, pendingQty) as { id: number, mc_number: string }[];

            if (availableStock.length > 0) {
                const qtyToAllocate = availableStock.length;
                const po = db.prepare('SELECT po_number FROM purchase_orders WHERE id = ?').get(item.po_id) as { po_number: string };

                // 1. Update Stock Records
                const updateStock = db.prepare(`
                    UPDATE fg_stock_master 
                    SET status = 'Reserved', reserved_for_po = ?, reserved_line_item = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `);

                for (const stock of availableStock) {
                    updateStock.run(po.po_number, item.id.toString(), stock.id);
                }

                // 2. Update Line Item
                db.prepare(`
                    UPDATE po_line_items 
                    SET allocated_qty = allocated_qty + ? 
                    WHERE id = ?
                `).run(qtyToAllocate, item.id);

                totalAllocated += qtyToAllocate;
            }
        }

        // Check fulfillment
        const totalPending = db.prepare(`
            SELECT SUM(ordered_qty - allocated_qty) as pending 
            FROM po_line_items 
            WHERE po_id = ?
        `).get(poId) as { pending: number };

        if (totalPending.pending === 0) {
            db.prepare(`UPDATE purchase_orders SET status = 'Fulfilled' WHERE id = ? AND status = 'Active'`).run(poId);
        }
    });

    transaction();
    return totalAllocated;
}

/**
 * Global processor to allocate stock to ALL pending POs.
 * Uses strict creation date FIFO for Fairness: Oldest Orders get stock first.
 */
export function processGlobalPendingAllocations(): number {
    const db = getDb();

    // Get all Active POs with pending items, ordered by Order Date (Oldest First)
    // We fetch just the IDs to iterate cleanly
    const pendingPOs = db.prepare(`
        SELECT DISTINCT po.id
        FROM purchase_orders po
        JOIN po_line_items pli ON po.id = pli.po_id
        WHERE po.status = 'Active' 
        AND pli.allocated_qty < pli.ordered_qty
        ORDER BY po.order_date ASC, po.created_at ASC
    `).all() as { id: number }[];

    let totalGlobalAllocated = 0;

    for (const po of pendingPOs) {
        // reuse the single PO logic
        totalGlobalAllocated += autoAllocatePO(po.id);
    }

    return totalGlobalAllocated;
}
