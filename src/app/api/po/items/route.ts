import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const user = await requireAuth();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const poId = searchParams.get('poId');

        if (!poId) {
            return NextResponse.json({ success: false, error: 'PO ID required' }, { status: 400 });
        }

        const db = getDb();
        const items = db.prepare(`
            SELECT * FROM po_line_items WHERE po_id = ?
        `).all(poId);

        return NextResponse.json({ success: true, data: items });
    } catch (error) {
        console.error('Fetch PO items error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
