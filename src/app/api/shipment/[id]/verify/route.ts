
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const verifySchema = z.object({
    mcNumber: z.string().min(1, "MC Number is required"),
});

// POST /api/shipment/[id]/verify - Verify an MC for loading
export async function POST(
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
        const body = await request.json();

        const validation = verifySchema.safeParse(body);
        if (!validation.success) {
            const error = validation.error as unknown as { errors: Array<{ message: string }> };
            return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
        }

        const { mcNumber } = validation.data;
        const db = getDb();

        // 1. Resolve Input to MC Number (Check Barcode or Direct MC)
        let resolvedMC = mcNumber;

        // Try finding by barcode first
        const stockByBarcode = db.prepare('SELECT mc_number FROM fg_stock_master WHERE barcode = ?').get(mcNumber) as { mc_number: string } | undefined;
        if (stockByBarcode) {
            resolvedMC = stockByBarcode.mc_number;
        }

        // 2. Check if item exists in this shipment manifest
        const item = db.prepare(`
        SELECT id, is_loaded, loaded_at 
        FROM shipment_items 
        WHERE shipment_id = ? AND mc_number = ?
    `).get(shipmentId, resolvedMC) as { id: number; is_loaded: number; loaded_at: string | null } | undefined;

        if (!item) {
            // Not in manifest!
            return NextResponse.json({
                success: false,
                status: 'ERROR',
                message: `MC ${mcNumber} is NOT in this shipment manifest!`
            });
        }

        if (item.is_loaded) {
            // Already loaded
            return NextResponse.json({
                success: true,
                status: 'WARNING',
                message: `MC ${mcNumber} was already loaded at ${new Date(item.loaded_at!).toLocaleTimeString()}`
            });
        }

        // 2. Mark as Loaded
        db.prepare(`
        UPDATE shipment_items 
        SET is_loaded = 1, loaded_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `).run(item.id);

        // 3. Update Shipment Status to 'Loading' if not already
        db.prepare(`UPDATE shipments SET status = 'Loading' WHERE id = ? AND status = 'Created'`).run(shipmentId);

        // 4. Return progress count
        const progress = db.prepare(`
        SELECT 
            SUM(is_loaded) as loaded_count,
            COUNT(*) as total_count
        FROM shipment_items
        WHERE shipment_id = ?
    `).get(shipmentId) as { loaded_count: number; total_count: number };

        return NextResponse.json({
            success: true,
            status: 'SUCCESS',
            message: `MC ${mcNumber} Loaded Successfully`,
            data: {
                loadedCount: progress.loaded_count,
                totalCount: progress.total_count
            }
        });

    } catch (error) {
        console.error('Verify error:', error);
        return NextResponse.json({ success: false, error: 'Verification failed' }, { status: 500 });
    }
}
