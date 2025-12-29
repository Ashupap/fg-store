import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { handleInward, handleTransfer, handleDispatch } from '@/lib/stock-logic';
import type { MovementResult } from '@/types';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        // ... (auth check)
        if (!user || (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'general_manager')) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized: Only admins, GMs or managers can approve requests' },
                { status: 403 }
            );
        }

        const { id } = await params;
        const movementId = id;
        const db = getDb();

        const log = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(movementId) as any;

        if (!log) {
            return NextResponse.json(
                { success: false, error: 'Movement request not found' },
                { status: 404 }
            );
        }

        if (log.status !== 'Pending Approval') {
            return NextResponse.json(
                { success: false, error: `Cannot approve movement with status: ${log.status}` },
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

        const movementData = {
            toStore: log.to_location,
            fromStore: log.from_location,
            type: log.type,
            variety: log.variety,
            packing: log.packing,
            grade: log.grade,
            qty: log.qty_mcs,
            remarks: log.remarks,
            dispatchPurpose: log.dispatch_purpose,
            poId: log.po_id
        };

        // If specific MCs were requested, they are stored in log.mc_numbers
        const specificMCNumbers = log.mc_numbers ? log.mc_numbers.split(',') : undefined;

        let result: MovementResult;

        console.log(`[Approve] Processing action: ${log.action_type} for ID: ${movementId}`);
        switch (log.action_type) {
            case 'INWARD':
                result = await handleInward(movementData, user.id, movementId);
                break;
            case 'TRANSFER':
                result = await handleTransfer(movementData, user.id, movementId, specificMCNumbers);
                break;
            case 'DISPATCH':
                result = await handleDispatch(movementData, user.id, movementId, specificMCNumbers);
                break;
            default:
                console.error(`[Approve] Invalid action type: ${log.action_type}`);
                return NextResponse.json(
                    { success: false, error: 'Invalid action type' },
                    { status: 400 }
                );
        }

        console.log('[Approve] Result:', result);

        if (!result.success) {
            console.error('[Approve] Logic failed:', result.error);
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            data: result,
        });

    } catch (error) {
        console.error('[Approve] Critical Error:', error);
        if (error instanceof Error) console.error(error.stack);
        return NextResponse.json(
            { success: false, error: 'Failed to approve movement' },
            { status: 500 }
        );
    }
}
