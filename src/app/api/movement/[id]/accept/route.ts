import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const db = getDb();

        // 1. Fetch the movement
        const movement = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(id) as any;

        if (!movement) {
            return NextResponse.json({ success: false, error: 'Movement not found' }, { status: 404 });
        }

        if (movement.status !== 'In Transit') {
            return NextResponse.json({ success: false, error: 'Movement is not in transit' }, { status: 400 });
        }

        // 2. Verify Permission: User must be assigned to the TO location
        // (Admins can approve anything, Managers/Operators only their stores)
        if (user.role !== 'admin') {
            const allowedStores = user.assigned_store_names || [];
            if (!allowedStores.includes(movement.to_location)) {
                return NextResponse.json({
                    success: false,
                    error: `Unauthorized: You are not assigned to receive stock at '${movement.to_location}'`
                }, { status: 403 });
            }
        }

        // 3. Update Stock & Movement
        const mcNumbers = movement.mc_numbers ? movement.mc_numbers.split(',') : [];

        const updateStock = db.prepare(`
            UPDATE fg_stock_master
            SET cold_store = ?, status = 'Available', updated_at = CURRENT_TIMESTAMP
            WHERE mc_number = ?
        `);

        const updateMovement = db.prepare(`
            UPDATE stock_movement_log
            SET status = 'Completed', approved_by_id = ?
            WHERE movement_id = ?
        `);

        const transaction = db.transaction(() => {
            // Move stock to Final Destination
            for (const mc of mcNumbers) {
                updateStock.run(movement.to_location, mc);
            }
            // Mark movement as completed
            updateMovement.run(user.id, id);
        });

        transaction();

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Accept transfer error:', error);
        return NextResponse.json({ success: false, error: 'Failed to accept transfer' }, { status: 500 });
    }
}
