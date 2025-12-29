import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { createPOSchema } from '@/lib/validations';
import { packingToCode } from '@/lib/utils';
import type { POWithLineItems, POLineItemWithDetails } from '@/types';
import { autoAllocatePO } from '@/lib/allocation';

export const dynamic = 'force-dynamic';

// GET /api/po - List all POs
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const db = getDb();
        const { searchParams } = new URL(request.url);

        const status = searchParams.get('status');

        // Build query
        let whereClause = '';
        const params: string[] = [];

        if (status && status !== 'all') {
            whereClause = 'WHERE status = ?';
            params.push(status);
        }

        // Get POs
        const pos = db.prepare(`
            SELECT * FROM purchase_orders
            ${whereClause}
            ORDER BY created_at DESC
        `).all(...params) as {
            id: number;
            po_number: string;
            customer: string | null;
            order_date: string | null;
            status: string;
            created_at: string;
        }[];

        // Get line items for each PO
        const getLineItems = db.prepare(`
            SELECT 
                id, po_id, type, variety, grade, packing_code, 
                ordered_qty, allocated_qty, 
                (ordered_qty - allocated_qty) as pending_qty,
                created_at
            FROM po_line_items
            WHERE po_id = ?
        `);

        const posWithLineItems: POWithLineItems[] = pos.map(po => {
            const lineItems = getLineItems.all(po.id) as POLineItemWithDetails[];
            const totalOrdered = lineItems.reduce((sum, item) => sum + item.ordered_qty, 0);
            const totalAllocated = lineItems.reduce((sum, item) => sum + item.allocated_qty, 0);

            return {
                id: po.id,
                po_number: po.po_number,
                order_date: po.order_date,
                status: po.status,
                created_at: po.created_at,
                line_items: lineItems,
                total_ordered: totalOrdered,
                total_allocated: totalAllocated,
                allocation_percentage: totalOrdered > 0 ? Math.round((totalAllocated / totalOrdered) * 100) : 0,
            };
        });

        return NextResponse.json({
            success: true,
            data: posWithLineItems,
        });
    } catch (error) {
        console.error('PO list error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch POs' },
            { status: 500 }
        );
    }
}

// POST /api/po - Create new PO
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await request.json();

        // Validate input
        const validation = createPOSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { success: false, error: validation.error.issues[0].message },
                { status: 400 }
            );
        }

        const { poNumber, orderDate, lineItems } = validation.data;
        const db = getDb();

        // Check if PO number already exists
        const existing = db.prepare('SELECT id FROM purchase_orders WHERE po_number = ?').get(poNumber);
        if (existing) {
            return NextResponse.json(
                { success: false, error: 'PO number already exists' },
                { status: 400 }
            );
        }

        // Insert PO and line items in transaction
        const insertPO = db.prepare(`
            INSERT INTO purchase_orders (po_number, order_date, status)
            VALUES (?, ?, 'Active')
        `);

        const insertLineItem = db.prepare(`
            INSERT INTO po_line_items (po_id, type, variety, grade, packing_code, ordered_qty)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        let poId: number | bigint = 0;

        const transaction = db.transaction(() => {
            const result = insertPO.run(poNumber, orderDate);
            poId = result.lastInsertRowid;

            for (const item of lineItems) {
                const packingCode = packingToCode(item.packing);
                insertLineItem.run(poId, item.type, item.variety, item.grade, packingCode, item.qty);
            }
        });

        transaction();

        // Auto-allocate immediately
        try {
            if (poId) {
                autoAllocatePO(Number(poId));
            }
        } catch (allocError) {
            console.error('Auto-allocation failed:', allocError);
            // Don't fail the PO creation just because auto-alloc failed
        }

        return NextResponse.json({
            success: true,
            data: { id: Number(poId), poNumber },
            message: 'PO created successfully',
        });
    } catch (error) {
        console.error('PO create error:', error);
        return NextResponse.json(
            { success: false, error: `Failed to create PO: ${error instanceof Error ? error.message : 'Unknown error'}` },
            { status: 500 }
        );
    }
}
