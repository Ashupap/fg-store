
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/shipment/[id] - Get shipment details + items
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const { id } = await params;
        const shipmentId = parseInt(id, 10);
        const db = getDb();

        const shipment = db.prepare(`
            SELECT s.*, p.po_number 
            FROM shipments s
            JOIN purchase_orders p ON s.po_id = p.id
            WHERE s.id = ?
        `).get(shipmentId);

        if (!shipment) {
            return NextResponse.json({ success: false, error: 'Shipment not found' }, { status: 404 });
        }

        const items = db.prepare(`
            SELECT 
                si.*,
                f.variety, f.grade, f.packing_code, f.type
            FROM shipment_items si
            JOIN fg_stock_master f ON si.mc_number = f.mc_number
            WHERE si.shipment_id = ?
        `).all(shipmentId);

        return NextResponse.json({
            success: true,
            data: {
                shipment,
                items
            }
        });
    } catch (error) {
        console.error('Fetch shipment error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch shipment' }, { status: 500 });
    }
}
