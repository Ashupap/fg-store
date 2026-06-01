import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateMovementId } from '@/lib/utils';
import { inwardMovementSchema, transferMovementSchema, dispatchMovementSchema, repackStartSchema, repackCompleteSchema } from '@/lib/validations';
import type { MovementResult } from '@/types';
import { handleInward, handleTransfer, handleDispatch, handleRepackOut, handleRepackIn } from '@/lib/stock-logic';

// POST /api/movement - Handle all movement types
export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { actionType, ...movementData } = body;

        // Extract optional specific MCs from input (for barcode scanning)
        const specificMCNumbers = body.specificMCNumbers || undefined;

        // --- Security Check: Store Isolation ---
        if (user.role === 'operator' || user.role === 'manager') {
            const allowedStores = user.assigned_store_names || [];

            if (actionType === 'INWARD') {
                // For Inward, user MUST be assigned to the Destination store
                const targetStore = movementData.toStore;
                if (!targetStore || !allowedStores.includes(targetStore)) {
                    return NextResponse.json({ success: false, error: `Unauthorized: You are not assigned to receive stock at '${targetStore}'` }, { status: 403 });
                }
            } else if (actionType === 'TRANSFER' || actionType === 'DISPATCH' || actionType === 'REPACK_OUT') {
                // For Transfer/Return/Repack Out, user MUST be assigned to the Source store
                const sourceStore = movementData.fromStore;
                if (!sourceStore || !allowedStores.includes(sourceStore)) {
                    return NextResponse.json({ success: false, error: `Unauthorized: You are not assigned to move stock from '${sourceStore}'` }, { status: 403 });
                }
            } else if (actionType === 'REPACK_IN') {
                // For Repack In, user MUST be assigned to the Destination store
                const targetStore = movementData.toStore;
                if (!targetStore || !allowedStores.includes(targetStore)) {
                    return NextResponse.json({ success: false, error: `Unauthorized: You are not assigned to receive stock at '${targetStore}'` }, { status: 403 });
                }
            }
        }
        // ---------------------------------------

        let result: MovementResult;

        // Check if user is operator
        if (user.role === 'operator') {
            result = await createPendingRequest(movementData, user.id, actionType, specificMCNumbers);
        } else {
            // Admin/Manager/Supervisor - execute immediately
            const userId = user.id;
            // Existing ID is undefined for new movements
            switch (actionType) {
                case 'INWARD':
                    result = await handleInward(movementData, userId);
                    break;
                case 'TRANSFER':
                    result = await handleTransfer(movementData, userId, undefined, specificMCNumbers);
                    break;
                case 'DISPATCH':
                    result = await handleDispatch(movementData, userId, undefined, specificMCNumbers);
                    break;
                case 'REPACK_OUT':
                    result = await handleRepackOut(movementData, userId);
                    break;
                case 'REPACK_IN':
                    result = await handleRepackIn(movementData, userId);
                    break;
                default:
                    return NextResponse.json(
                        { success: false, error: 'Invalid action type' },
                        { status: 400 }
                    );
            }
        }

        if (!result.success) {
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
        console.error('Movement error:', error);
        return NextResponse.json(
            { success: false, error: 'An error occurred during stock movement' },
            { status: 500 }
        );
    }
}

// GET /api/movement - Get movement history with filters
export async function GET(request: NextRequest) {
    try {
        const db = getDb();
        const { searchParams } = new URL(request.url);

        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        // Filters
        const fromDate = searchParams.get('fromDate');
        const toDate = searchParams.get('toDate');
        const actionType = searchParams.get('actionType');
        const variety = searchParams.get('variety');
        const status = searchParams.get('status');

        // Check Admin/Manager or Assigned Stores
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const isRestricted = user.role !== 'admin' && user.role !== 'manager';
        const allowedStores = user.assigned_store_names || [];

        // Build Query
        let whereClause = 'WHERE 1=1';
        const params: any[] = [];

        // Apply Store Isolation
        if (isRestricted) {
            if (allowedStores.length === 0) {
                // User has no stores, return empty
                return NextResponse.json({ success: true, data: [], total: 0 });
            }
            // User can see movements FROM their store OR TO their store
            const placeholders = allowedStores.map(() => '?').join(',');
            whereClause += ` AND (sml.from_location IN (${placeholders}) OR sml.to_location IN (${placeholders}))`;
            params.push(...allowedStores, ...allowedStores);
        }

        if (fromDate) {
            whereClause += ' AND sml.movement_datetime >= ?';
            params.push(`${fromDate}T00:00:00.000Z`);
        }
        if (toDate) {
            whereClause += ' AND sml.movement_datetime <= ?';
            params.push(`${toDate}T23:59:59.999Z`);
        }
        if (actionType && actionType !== 'ALL') {
            whereClause += ' AND sml.action_type = ?';
            params.push(actionType);
        }
        if (variety && variety !== 'ALL') {
            whereClause += ' AND sml.variety = ?';
            params.push(variety);
        }
        if (status && status !== 'ALL') {
            whereClause += ' AND sml.status = ?';
            params.push(status);
        }

        const dataQuery = `
            SELECT 
                sml.*,
                u.name as moved_by_name,
                ap.name as approved_by_name
            FROM stock_movement_log sml
            LEFT JOIN users u ON sml.moved_by_id = u.id
            LEFT JOIN users ap ON sml.approved_by_id = ap.id
            ${whereClause}
            ORDER BY sml.movement_datetime DESC
            LIMIT ? OFFSET ?
        `;

        const countQuery = `
            SELECT COUNT(*) as count 
            FROM stock_movement_log sml
            ${whereClause}
        `;

        const movements = db.prepare(dataQuery).all(...params, limit, offset);
        const total = db.prepare(countQuery).get(...params) as { count: number };

        return NextResponse.json({
            success: true,
            data: movements,
            total: total.count,
        });
    } catch (error) {
        console.error('Movement history error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch movement history' },
            { status: 500 }
        );
    }
}

async function createPendingRequest(data: any, userId: number, actionType: string, specificMCNumbers?: string[]): Promise<MovementResult> {
    const db = getDb();
    const movementId = generateMovementId();

    // Validate data structure but don't check stock availability yet
    let validation;
    if (actionType === 'INWARD') validation = inwardMovementSchema.safeParse(data);
    else if (actionType === 'TRANSFER') validation = transferMovementSchema.safeParse(data);
    else if (actionType === 'DISPATCH') validation = dispatchMovementSchema.safeParse(data);
    else if (actionType === 'REPACK_OUT') validation = repackStartSchema.safeParse(data);
    else if (actionType === 'REPACK_IN') validation = repackCompleteSchema.safeParse(data);
    else return { success: false, error: 'Invalid action type' };

    if (!validation.success) {
        const error = validation.error as any;
        return { success: false, error: error.errors[0].message };
    }

    const valData = validation.data;
    const { type, variety, packing, grade, qty } = valData;
    const fromStore = (valData as any).fromStore || null;
    // For Dispatch, 'toStore' is client name. For Inward, it's valid store.
    const toStore = (valData as any).toStore || null;
    const remarks = (valData as any).remarks || null;
    const dispatchPurpose = (valData as any).dispatchPurpose || null;
    const poId = (valData as any).poId || null;


    try {
        const insertLog = db.prepare(`
            INSERT INTO stock_movement_log (
                movement_id, movement_datetime, action_type, 
                from_location, to_location, 
                type, variety, packing, grade, 
                qty_mcs, mc_numbers, moved_by_id, remarks, status,
                dispatch_purpose, po_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Approval', ?, ?)
        `);

        // If specific MCs are requested, save them in the log temporarily as 'Requested:...' or just directly if preferred.
        // But the log column mc_numbers is usually for the *actual* moved MCs. 
        // For pending requests with specific MCs, let's store them there so approval knows which ones to pick.
        const mcString = specificMCNumbers ? specificMCNumbers.join(',') : null;

        insertLog.run(
            movementId,
            new Date().toISOString(),
            actionType,
            fromStore,
            toStore,
            type,
            variety,
            packing,
            grade,
            qty,
            mcString,
            userId,
            remarks,
            dispatchPurpose,
            poId
        );

        return {
            success: true,
            moveId: movementId,
            movedCount: qty
        };
    } catch (error) {
        console.error('Pending request error:', error);
        return { success: false, error: 'Failed to create pending request' };
    }
}
