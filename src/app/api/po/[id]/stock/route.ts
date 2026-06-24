import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/po/[id]/stock - Get all cartons reserved/allocated for a PO
// Used by the dispatch wizard to show the verification checklist
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
        const poId = parseInt(id, 10);
        if (isNaN(poId)) {
            return NextResponse.json({ success: false, error: 'Invalid PO ID' }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const storeFilter = searchParams.get('store');

        const db = getDb();

        // Get PO info
        const po = db.prepare('SELECT po_number, branding_type FROM purchase_orders WHERE id = ?').get(poId) as {
            po_number: string;
            branding_type: string;
        } | undefined;

        if (!po) {
            return NextResponse.json({ success: false, error: 'PO not found' }, { status: 404 });
        }

        // Determine which statuses are valid for dispatch
        const brandingType = po.branding_type || 'Demo';
        const requiredStatus = brandingType === 'Branded' ? 'Allocated' : 'Reserved';

        let query = `
            SELECT 
                s.id, s.mc_number, s.short_code, s.barcode,
                s.grade, s.variety, s.type, s.packing_code, s.packing_date,
                s.cold_store, s.status,
                sec.name as section_name
            FROM fg_stock_master s
            LEFT JOIN store_sections sec ON s.section_id = sec.id
            WHERE s.reserved_for_po = ? AND s.status = ?
        `;
        const params2: any[] = [po.po_number, requiredStatus];

        if (storeFilter) {
            query += ' AND s.cold_store = ?';
            params2.push(storeFilter);
        }

        query += ' ORDER BY s.packing_date ASC, s.cold_store ASC';

        const cartons = db.prepare(query).all(...params2) as any[];

        // Group by store for a cleaner response
        const storeGroups: Record<string, any[]> = {};
        for (const carton of cartons) {
            if (!storeGroups[carton.cold_store]) {
                storeGroups[carton.cold_store] = [];
            }
            storeGroups[carton.cold_store].push(carton);
        }

        return NextResponse.json({
            success: true,
            data: cartons,
            storeGroups,
            meta: {
                totalCartons: cartons.length,
                brandingType,
                requiredStatus,
                poNumber: po.po_number,
            }
        });
    } catch (error) {
        console.error('PO stock fetch error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch PO stock' }, { status: 500 });
    }
}
