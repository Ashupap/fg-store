import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        // ... (auth check)
        if (!user || (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'general_manager')) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized: Only admins, GMs or managers can reject requests' },
                { status: 403 }
            );
        }

        const { id } = await params;
        const movementId = id;
        const db = getDb();

        const log = db.prepare('SELECT status, from_location, to_location FROM stock_movement_log WHERE movement_id = ?').get(movementId) as any;

        if (!log) {
            return NextResponse.json(
                { success: false, error: 'Movement request not found' },
                { status: 404 }
            );
        }

        if (log.status !== 'Pending Approval') {
            return NextResponse.json(
                { success: false, error: `Cannot reject movement with status: ${log.status}` },
                { status: 400 }
            );
        }

        // Store Isolation Check for Managers
        if (user.role === 'manager') {
            const hasAccess = (log.from_location && user.assigned_store_names?.includes(log.from_location)) ||
                (log.to_location && user.assigned_store_names?.includes(log.to_location));

            if (!hasAccess) {
                return NextResponse.json(
                    { success: false, error: 'Unauthorized: You are not assigned to the stores involved in this movement' },
                    { status: 403 }
                );
            }
        }

        db.prepare(`
            UPDATE stock_movement_log 
            SET status = 'Rejected', approved_by_id = ?
            WHERE movement_id = ?
        `).run(user.id, movementId);

        return NextResponse.json({
            success: true,
            message: 'Request rejected'
        });

    } catch (error) {
        console.error('Rejection error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to reject movement' },
            { status: 500 }
        );
    }
}
