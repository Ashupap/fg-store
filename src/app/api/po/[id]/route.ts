import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { POWithLineItems, POLineItemWithDetails } from '@/types';

// GET /api/po/[id] - Get PO details
export async function GET(
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

        if (isNaN(poId)) {
            return NextResponse.json(
                { success: false, error: 'Invalid PO ID' },
                { status: 400 }
            );
        }

        const db = getDb();

        // Get PO
        const po = db.prepare(`
      SELECT * FROM purchase_orders WHERE id = ?
    `).get(poId) as {
            id: number;
            po_number: string;
            customer: string | null;
            order_date: string | null;
            branding_type: string;
            loading_store: string | null;
            status: string;
            created_at: string;
        } | undefined;

        if (!po) {
            return NextResponse.json(
                { success: false, error: 'PO not found' },
                { status: 404 }
            );
        }

        // Get line items
        const lineItems = db.prepare(`
      SELECT 
        id, po_id, type, variety, grade, packing_code, 
        ordered_qty, allocated_qty,
        (ordered_qty - allocated_qty) as pending_qty,
        created_at
      FROM po_line_items
      WHERE po_id = ?
    `).all(poId) as POLineItemWithDetails[];

        const totalOrdered = lineItems.reduce((sum, item) => sum + item.ordered_qty, 0);
        const totalAllocated = lineItems.reduce((sum, item) => sum + item.allocated_qty, 0);

        const poWithLineItems: POWithLineItems = {
            id: po.id,
            po_number: po.po_number,
            customer: po.customer,
            branding_type: po.branding_type || 'Demo',
            loading_store: po.loading_store || null,
            order_date: po.order_date,
            status: po.status,
            created_at: po.created_at,
            line_items: lineItems,
            total_ordered: totalOrdered,
            total_allocated: totalAllocated,
            allocation_percentage: totalOrdered > 0 ? Math.round((totalAllocated / totalOrdered) * 100) : 0,
        };

        return NextResponse.json({
            success: true,
            data: poWithLineItems,
        });
    } catch (error) {
        console.error('PO detail error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch PO details' },
            { status: 500 }
        );
    }
}

// PUT /api/po/[id] - Update PO status
export async function PUT(
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
        const { status } = body;

        if (!status || !['Active', 'Fulfilled', 'Cancelled'].includes(status)) {
            return NextResponse.json(
                { success: false, error: 'Invalid status' },
                { status: 400 }
            );
        }

        const db = getDb();

        const result = db.prepare(`
      UPDATE purchase_orders SET status = ? WHERE id = ?
    `).run(status, poId);

        if (result.changes === 0) {
            return NextResponse.json(
                { success: false, error: 'PO not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `PO status updated to ${status}`,
        });
    } catch (error) {
        console.error('PO update error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update PO' },
            { status: 500 }
        );
    }
}

// DELETE /api/po/[id] - Cancel PO (soft delete)
export async function DELETE(
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
        const db = getDb();

        // Check if PO has any allocations
        const allocatedStock = db.prepare(`
      SELECT COUNT(*) as count FROM fg_stock_master 
      WHERE reserved_for_po = (SELECT po_number FROM purchase_orders WHERE id = ?)
    `).get(poId) as { count: number };

        if (allocatedStock.count > 0) {
            return NextResponse.json(
                { success: false, error: 'Cannot cancel PO with allocated stock. Please deallocate first.' },
                { status: 400 }
            );
        }

        // Soft delete by setting status to Cancelled
        const result = db.prepare(`
      UPDATE purchase_orders SET status = 'Cancelled' WHERE id = ?
    `).run(poId);

        if (result.changes === 0) {
            return NextResponse.json(
                { success: false, error: 'PO not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'PO cancelled successfully',
        });
    } catch (error) {
        console.error('PO cancel error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to cancel PO' },
            { status: 500 }
        );
    }
}
