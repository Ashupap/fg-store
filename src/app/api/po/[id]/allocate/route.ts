import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { allocationSchema } from '@/lib/validations';

// POST /api/po/[id]/allocate - Allocate stock to PO line item
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const { id } = await params;
        const poId = parseInt(id, 10);
        const body = await request.json();

        // Validate input
        const validation = allocationSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { success: false, error: validation.error.issues[0].message },
                { status: 400 }
            );
        }

        const { lineItemId, qty, coldStore } = validation.data;
        const db = getDb();

        // Get PO and line item details
        const po = db.prepare('SELECT po_number, status FROM purchase_orders WHERE id = ?').get(poId) as { po_number: string; status: string } | undefined;

        if (!po) {
            return NextResponse.json(
                { success: false, error: 'PO not found' },
                { status: 404 }
            );
        }

        if (po.status !== 'Active') {
            return NextResponse.json(
                { success: false, error: 'Cannot allocate to non-active PO' },
                { status: 400 }
            );
        }

        const lineItem = db.prepare(`
      SELECT id, type, variety, grade, packing_code, ordered_qty, allocated_qty
      FROM po_line_items WHERE id = ? AND po_id = ?
    `).get(lineItemId, poId) as {
            id: number;
            type: string;
            variety: string;
            grade: string;
            packing_code: string;
            ordered_qty: number;
            allocated_qty: number;
        } | undefined;

        if (!lineItem) {
            return NextResponse.json(
                { success: false, error: 'Line item not found' },
                { status: 404 }
            );
        }

        const pendingQty = lineItem.ordered_qty - lineItem.allocated_qty;
        if (qty > pendingQty) {
            return NextResponse.json(
                { success: false, error: `Cannot allocate more than pending quantity (${pendingQty})` },
                { status: 400 }
            );
        }

        // Find available stock matching criteria (FIFO - oldest first)
        let stockQuery = `
      SELECT id, mc_number FROM fg_stock_master
      WHERE type = ? AND variety = ? AND grade = ? AND packing_code = ? AND status = 'Available'
    `;
        const stockParams: (string | number)[] = [lineItem.type, lineItem.variety, lineItem.grade, lineItem.packing_code];

        if (coldStore) {
            stockQuery += ' AND cold_store = ?';
            stockParams.push(coldStore);
        }

        stockQuery += ' ORDER BY packing_date ASC LIMIT ?';
        stockParams.push(qty);

        const availableStock = db.prepare(stockQuery).all(...stockParams) as { id: number; mc_number: string }[];

        if (availableStock.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No available stock found matching criteria' },
                { status: 400 }
            );
        }

        const allocatedCount = availableStock.length;
        const mcNumbers = availableStock.map(s => s.mc_number);

        // Update stock and line item in transaction
        const updateStock = db.prepare(`
      UPDATE fg_stock_master 
      SET status = 'Reserved', reserved_for_po = ?, reserved_line_item = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

        const updateLineItem = db.prepare(`
      UPDATE po_line_items SET allocated_qty = allocated_qty + ? WHERE id = ?
    `);

        const transaction = db.transaction(() => {
            for (const stock of availableStock) {
                updateStock.run(po.po_number, lineItemId.toString(), stock.id);
            }
            updateLineItem.run(allocatedCount, lineItemId);
        });

        transaction();

        // Check if PO is now fully allocated
        const totalPending = db.prepare(`
      SELECT SUM(ordered_qty - allocated_qty) as pending FROM po_line_items WHERE po_id = ?
    `).get(poId) as { pending: number };

        if (totalPending.pending === 0) {
            db.prepare(`UPDATE purchase_orders SET status = 'Fulfilled' WHERE id = ?`).run(poId);
        }

        return NextResponse.json({
            success: true,
            data: {
                allocatedCount,
                mcNumbers,
            },
            message: `Successfully allocated ${allocatedCount} MCs`,
        });
    } catch (error) {
        console.error('Allocation error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to allocate stock' },
            { status: 500 }
        );
    }
}
