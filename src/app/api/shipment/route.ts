
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const createShipmentSchema = z.object({
    poId: z.number().int().positive(),
    shipmentNo: z.string().min(1, "Shipment number is required"),
    containerNo: z.string().min(1, "Container number is required"),
    sealNo: z.string().min(1, "Seal number is required"),
});

// POST /api/shipment - Create a new shipment
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const body = await request.json();
        const validation = createShipmentSchema.safeParse(body);

        if (!validation.success) {
            const error = validation.error as unknown as { errors: Array<{ message: string }> };
            return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
        }

        const { poId, shipmentNo, containerNo, sealNo } = validation.data;
        const db = getDb();

        // 1. Check if PO exists and is not already shipped
        const po = db.prepare('SELECT id, po_number, status FROM purchase_orders WHERE id = ?').get(poId) as { id: number; po_number: string; status: string } | undefined;
        if (!po) {
            return NextResponse.json({ success: false, error: 'PO not found' }, { status: 404 });
        }

        // Check if shipment already exists for this PO
        const existingShipment = db.prepare('SELECT id FROM shipments WHERE po_id = ?').get(poId);
        if (existingShipment) {
            return NextResponse.json({ success: false, error: 'A shipment already exists for this PO' }, { status: 400 });
        }

        // 2. Get all reserved MCs for this PO
        const reservedMCs = db.prepare(`
        SELECT mc_number 
        FROM fg_stock_master 
        WHERE reserved_for_po = ?
    `).all(po.po_number) as { mc_number: string }[];

        if (reservedMCs.length === 0) {
            return NextResponse.json({ success: false, error: 'No MCs are currently allocated to this PO' }, { status: 400 });
        }

        // 3. Create Shipment and Items in Transaction
        const transaction = db.transaction(() => {
            const result = db.prepare(`
            INSERT INTO shipments (po_id, shipment_no, container_no, seal_no, status)
            VALUES (?, ?, ?, ?, 'Created')
        `).run(poId, shipmentNo, containerNo, sealNo);

            const shipmentId = result.lastInsertRowid;

            const insertItem = db.prepare(`
            INSERT INTO shipment_items (shipment_id, mc_number)
            VALUES (?, ?)
        `);

            for (const mc of reservedMCs) {
                insertItem.run(shipmentId, mc.mc_number);
            }

            return shipmentId;
        });

        const newShipmentId = transaction();

        return NextResponse.json({
            success: true,
            data: { id: newShipmentId, count: reservedMCs.length },
            message: `Shipment created with ${reservedMCs.length} items.`
        });

    } catch (error) {
        console.error('Create shipment error:', error);
        return NextResponse.json({ success: false, error: 'Failed to create shipment' }, { status: 500 });
    }
}
