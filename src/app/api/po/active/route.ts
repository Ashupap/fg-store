
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/po/active - Get all active POs that are fully allocated but not yet shipped
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const db = getDb();

        // Find POs that are 'Fulfilled' (fully allocated) but don't have a shipment yet
        const pos = db.prepare(`
            SELECT p.id, p.po_number, p.customer, p.status, p.created_at,
                   (SELECT COUNT(*) FROM fg_stock_master WHERE reserved_for_po = p.po_number) as allocated_count
            FROM purchase_orders p
            LEFT JOIN shipments s ON p.id = s.po_id
            WHERE p.status = 'Fulfilled' AND s.id IS NULL
            ORDER BY p.created_at DESC
        `).all();

        return NextResponse.json({ success: true, data: pos });
    } catch (error) {
        console.error('Fetch active POs error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch POs' }, { status: 500 });
    }
}
