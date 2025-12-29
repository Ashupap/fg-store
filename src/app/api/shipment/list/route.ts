
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/shipment - Get list of shipemnts
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const db = getDb();
        const shipments = db.prepare(`
            SELECT s.*, p.po_number, p.customer,
                   (SELECT COUNT(*) FROM shipment_items WHERE shipment_id = s.id) as total_items,
                   (SELECT COUNT(*) FROM shipment_items WHERE shipment_id = s.id AND is_loaded = 1) as loaded_items
            FROM shipments s
            JOIN purchase_orders p ON s.po_id = p.id
            ORDER BY s.created_at DESC
        `).all();

        return NextResponse.json({ success: true, data: shipments });

    } catch (error) {
        console.error('Fetch shipments error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch shipments' }, { status: 500 });
    }
}
