import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const user = await requireAuth();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const poId = searchParams.get('poId');
        const lineItemId = searchParams.get('lineItemId');

        if (!poId || !lineItemId) {
            return NextResponse.json({ success: false, error: 'PO ID and Line Item ID required' }, { status: 400 });
        }

        const db = getDb();
        const stock = db.prepare(`
            SELECT mc_number FROM fg_stock_master 
            WHERE reserved_for_po = (SELECT po_number FROM purchase_orders WHERE id = ?)
            AND reserved_line_item = ?
            AND status = 'Allocated'
        `).all(poId, lineItemId);

        return NextResponse.json({ success: true, data: stock });
    } catch (error) {
        console.error('Fetch allocated stock error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
