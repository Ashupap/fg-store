import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { MovementLogRow, StockMasterRow } from '@/lib/db-types';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'general_manager')) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized: Only admins, GMs or managers can cancel transfers' },
                { status: 403 }
            );
        }

        const { id } = await params;
        const movementId = id;
        const db = getDb();

        // Fetch current movement log
        const log = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(movementId) as MovementLogRow | undefined;
        if (!log) {
            return NextResponse.json(
                { success: false, error: 'Movement log not found' },
                { status: 404 }
            );
        }

        if (log.action_type !== 'TRANSFER') {
            return NextResponse.json(
                { success: false, error: 'Only transfer movements can be cancelled' },
                { status: 400 }
            );
        }

        if (log.status === 'Cancelled') {
            return NextResponse.json(
                { success: false, error: 'Transfer is already cancelled' },
                { status: 400 }
            );
        }

        if (log.status === 'Rejected') {
            return NextResponse.json(
                { success: false, error: 'Rejected transfers cannot be cancelled' },
                { status: 400 }
            );
        }

        if (log.status === 'Completed') {
            return NextResponse.json(
                { success: false, error: 'Completed transfers cannot be cancelled' },
                { status: 400 }
            );
        }

        // Store Isolation Check for Managers
        if (user.role === 'manager') {
            const allowedStores = user.assigned_store_names || [];
            const hasAccess = (log.from_location && allowedStores.includes(log.from_location)) ||
                (log.to_location && allowedStores.includes(log.to_location));

            if (!hasAccess) {
                return NextResponse.json(
                    { success: false, error: 'Unauthorized: You are not assigned to the stores involved in this movement' },
                    { status: 403 }
                );
            }
        }

        // If Pending, just cancel request directly
        if (log.status === 'Pending Approval') {
            db.prepare(`
                UPDATE stock_movement_log
                SET status = 'Cancelled', approved_by_id = ?
                WHERE movement_id = ?
            `).run(user.id, movementId);

            return NextResponse.json({
                success: true,
                message: 'Pending transfer request cancelled successfully'
            });
        }

        // If Completed, run database rollback transaction
        let errorMsg = '';
        const transaction = db.transaction(() => {
            const oldMcNumbers = log.mc_numbers ? log.mc_numbers.split(',') : [];
            let beforeStock: StockMasterRow[] = [];
            if (oldMcNumbers.length > 0) {
                const placeholders = oldMcNumbers.map(() => '?').join(',');
                beforeStock = db.prepare(
                    `SELECT * FROM fg_stock_master WHERE mc_number IN (${placeholders})`
                ).all(...oldMcNumbers) as StockMasterRow[];
            }

            // Verify that all moved cartons are still Available and at their destination or In Transit
            const unavailable = beforeStock.some(
                s => s.status !== 'Available' || (s.cold_store !== log.to_location && s.cold_store !== 'In Transit')
            );
            if (unavailable) {
                errorMsg = 'Cannot cancel Transfer: some cartons are no longer Available or have been moved';
                throw new Error(errorMsg);
            }

            // Revert locations back to the original source store and set status to Available
            if (oldMcNumbers.length > 0) {
                const placeholders = oldMcNumbers.map(() => '?').join(',');
                db.prepare(
                    `UPDATE fg_stock_master SET cold_store = ?, status = 'Available', updated_at = CURRENT_TIMESTAMP WHERE mc_number IN (${placeholders})`
                ).run(log.from_location, ...oldMcNumbers);
            }

            // Update status in stock_movement_log
            db.prepare(`
                UPDATE stock_movement_log
                SET status = 'Cancelled', approved_by_id = ?
                WHERE movement_id = ?
            `).run(user.id, movementId);

            // Audit Trail
            const beforeStateStr = JSON.stringify({ log, stock: beforeStock });
            const afterLog = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(movementId) as MovementLogRow | undefined;
            let afterStock: StockMasterRow[] = [];
            if (oldMcNumbers.length > 0) {
                const placeholders = oldMcNumbers.map(() => '?').join(',');
                afterStock = db.prepare(
                    `SELECT * FROM fg_stock_master WHERE mc_number IN (${placeholders})`
                ).all(...oldMcNumbers) as StockMasterRow[];
            }
            const afterStateStr = JSON.stringify({ log: afterLog, stock: afterStock });

            db.prepare(`
                INSERT INTO audit_logs (action_type, table_name, record_id, before_state, after_state, changed_by_id, changed_by_name, change_reason)
                VALUES ('CANCEL_TRANSACTION', 'stock_movement_log', ?, ?, ?, ?, ?, 'Completed transfer reversed and cancelled')
            `).run(movementId, beforeStateStr, afterStateStr, user.id, user.name);
        });

        try {
            transaction();
            return NextResponse.json({
                success: true,
                message: 'Completed transfer cancelled and stock reverted successfully'
            });
        } catch (txError: any) {
            console.error('Cancel transaction rollback failed:', txError);
            return NextResponse.json(
                { success: false, error: errorMsg || txError.message || 'Failed to revert stock' },
                { status: 400 }
            );
        }

    } catch (error) {
        console.error('Cancel route error:', error);
        return NextResponse.json(
            { success: false, error: 'An error occurred during transfer cancellation' },
            { status: 500 }
        );
    }
}
