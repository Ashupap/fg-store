import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// POST /api/po/[id]/deallocate - Release all allocated stock from a line item
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
        const { lineItemId } = body;

        if (!lineItemId) {
            return NextResponse.json(
                { success: false, error: 'Line Item ID is required' },
                { status: 400 }
            );
        }

        const db = getDb();

        // Get PO details
        const po = db.prepare('SELECT po_number, status FROM purchase_orders WHERE id = ?').get(poId) as { po_number: string; status: string } | undefined;

        if (!po) {
            return NextResponse.json(
                { success: false, error: 'PO not found' },
                { status: 404 }
            );
        }

        // Get line item
        const lineItem = db.prepare(`
      SELECT id, allocated_qty FROM po_line_items WHERE id = ? AND po_id = ?
    `).get(lineItemId, poId) as { id: number; allocated_qty: number } | undefined;

        if (!lineItem) {
            return NextResponse.json(
                { success: false, error: 'Line item not found' },
                { status: 404 }
            );
        }

        if (lineItem.allocated_qty === 0) {
            return NextResponse.json(
                { success: false, error: 'No stock allocated to this line item' },
                { status: 400 }
            );
        }

        // Find all stock allocated to this line item
        const allocatedStock = db.prepare(`
      SELECT id, mc_number FROM fg_stock_master
      WHERE reserved_for_po = ? AND reserved_line_item = ?
    `).all(po.po_number, lineItemId.toString()) as { id: number; mc_number: string }[];

        const deallocatedCount = allocatedStock.length;

        // Release stock in transaction
        const releaseStock = db.prepare(`
      UPDATE fg_stock_master 
      SET status = 'Available', reserved_for_po = NULL, reserved_line_item = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

        const updateLineItem = db.prepare(`
      UPDATE po_line_items SET allocated_qty = 0 WHERE id = ?
    `);

        const transaction = db.transaction(() => {
            for (const stock of allocatedStock) {
                releaseStock.run(stock.id);
            }
            updateLineItem.run(lineItemId);
        });

        transaction();

        // Update PO status back to Active if it was Fulfilled
        if (po.status === 'Fulfilled') {
            db.prepare(`UPDATE purchase_orders SET status = 'Active' WHERE id = ?`).run(poId);
        }

        return NextResponse.json({
            success: true,
            data: {
                deallocatedCount,
            },
            message: `Successfully released ${deallocatedCount} MCs`,
        });
    } catch (error) {
        console.error('Deallocation error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to deallocate stock' },
            { status: 500 }
        );
    }
}
