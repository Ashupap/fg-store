import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/po/active - Get all POs that are ready for dispatch
// Demo POs: status = Fulfilled (stock Reserved)
// Branded POs: status = Fulfilled (stock Allocated after repack)
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const db = getDb();

        // Return all Fulfilled POs with branding_type and loading_store for the dispatch wizard
        const pos = db.prepare(`
            SELECT p.id, p.po_number, p.customer, p.status, p.created_at,
                   COALESCE(p.branding_type, 'Demo') as branding_type,
                   p.loading_store,
                   (SELECT COUNT(*) FROM fg_stock_master WHERE reserved_for_po = p.po_number AND status IN ('Reserved', 'Allocated')) as allocated_count
            FROM purchase_orders p
            WHERE p.status IN ('Fulfilled', 'Active')
            ORDER BY p.created_at DESC
        `).all();

        return NextResponse.json({ success: true, data: pos });
    } catch (error) {
        console.error('Fetch active POs error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch POs' }, { status: 500 });
    }
}
