import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/po/[id]/barcodes - Fetch uploaded barcodes for a PO
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

        const db = getDb();

        // Check feature setting
        const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'enable_customer_barcode'").get() as { value: string } | undefined;
        const isEnabled = setting?.value === 'true';

        const barcodes = db.prepare(`
            SELECT id, barcode, status, mc_number, created_at
            FROM po_customer_barcodes
            WHERE po_id = ?
            ORDER BY id ASC
        `).all(poId) as { id: number; barcode: string; status: string; mc_number: string | null; created_at: string }[];

        const summary = {
            total: barcodes.length,
            unused: barcodes.filter(b => b.status === 'Unused').length,
            assigned: barcodes.filter(b => b.status === 'Assigned').length,
        };

        return NextResponse.json({ success: true, data: barcodes, summary, featureEnabled: isEnabled });
    } catch (error) {
        console.error('Barcode GET error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch barcodes' }, { status: 500 });
    }
}

// POST /api/po/[id]/barcodes - Upload a batch of customer barcodes for a PO
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        // Role check: only managers+ can upload barcodes
        const allowedRoles = ['admin', 'general_manager', 'store_manager', 'marketing_manager'];
        if (!allowedRoles.includes(user.role)) {
            return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
        }

        const { id } = await params;
        const poId = parseInt(id, 10);
        if (isNaN(poId)) {
            return NextResponse.json({ success: false, error: 'Invalid PO ID' }, { status: 400 });
        }

        const body = await request.json();
        const { barcodes } = body;

        if (!Array.isArray(barcodes) || barcodes.length === 0) {
            return NextResponse.json({ success: false, error: 'barcodes array is required and cannot be empty' }, { status: 400 });
        }

        // Validate all entries are non-empty strings
        const cleanBarcodes: string[] = barcodes
            .map((b: any) => (typeof b === 'string' ? b.trim() : ''))
            .filter(b => b.length > 0);

        if (cleanBarcodes.length === 0) {
            return NextResponse.json({ success: false, error: 'No valid barcodes provided' }, { status: 400 });
        }

        const db = getDb();

        // Verify PO exists and is Branded
        const po = db.prepare('SELECT id, po_number, branding_type FROM purchase_orders WHERE id = ?').get(poId) as { id: number; po_number: string; branding_type: string } | undefined;
        if (!po) {
            return NextResponse.json({ success: false, error: 'PO not found' }, { status: 404 });
        }
        if (po.branding_type !== 'Branded') {
            return NextResponse.json({ success: false, error: 'Customer barcodes can only be uploaded for Branded POs' }, { status: 400 });
        }

        const insertBarcode = db.prepare(`
            INSERT OR IGNORE INTO po_customer_barcodes (po_id, barcode, status)
            VALUES (?, ?, 'Unused')
        `);

        let inserted = 0;
        let skipped = 0;

        const transaction = db.transaction(() => {
            for (const barcode of cleanBarcodes) {
                const result = insertBarcode.run(poId, barcode);
                if (result.changes > 0) {
                    inserted++;
                } else {
                    skipped++;
                }
            }
        });

        transaction();

        return NextResponse.json({
            success: true,
            data: { inserted, skipped, total: cleanBarcodes.length },
            message: `Uploaded ${inserted} barcodes${skipped > 0 ? `, ${skipped} duplicates skipped` : ''}`,
        });
    } catch (error) {
        console.error('Barcode POST error:', error);
        return NextResponse.json({ success: false, error: 'Failed to upload barcodes' }, { status: 500 });
    }
}

// DELETE /api/po/[id]/barcodes - Clear all unused barcodes for a PO
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const allowedRoles = ['admin', 'general_manager'];
        if (!allowedRoles.includes(user.role)) {
            return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
        }

        const { id } = await params;
        const poId = parseInt(id, 10);
        if (isNaN(poId)) {
            return NextResponse.json({ success: false, error: 'Invalid PO ID' }, { status: 400 });
        }

        const db = getDb();
        const result = db.prepare("DELETE FROM po_customer_barcodes WHERE po_id = ? AND status = 'Unused'").run(poId);

        return NextResponse.json({
            success: true,
            message: `Removed ${result.changes} unused barcodes`,
        });
    } catch (error) {
        console.error('Barcode DELETE error:', error);
        return NextResponse.json({ success: false, error: 'Failed to clear barcodes' }, { status: 500 });
    }
}
