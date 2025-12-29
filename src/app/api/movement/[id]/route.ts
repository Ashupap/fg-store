import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { inwardMovementSchema, transferMovementSchema, dispatchMovementSchema } from '@/lib/validations';

export async function GET(
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

        const movement = db.prepare(`
            SELECT 
                sml.*,
                u1.name as moved_by_name,
                u2.name as approved_by_name
            FROM stock_movement_log sml
            LEFT JOIN users u1 ON sml.moved_by_id = u1.id
            LEFT JOIN users u2 ON sml.approved_by_id = u2.id
            WHERE sml.movement_id = ?
        `).get(id);

        if (!movement) {
            return NextResponse.json({ success: false, error: 'Movement not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: movement });
    } catch (error) {
        console.error('Fetch movement error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch movement' }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        // 1. Verify Permission (Admin or GM only)
        if (!user || (user.role !== 'admin' && user.role !== 'general_manager')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;
        const db = getDb();
        const body = await request.json();

        // 2. Fetch current movement
        const movement = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(id) as any;

        if (!movement) {
            return NextResponse.json({ success: false, error: 'Movement not found' }, { status: 404 });
        }

        // 3. Verify Status
        if (movement.status !== 'Pending Approval') {
            return NextResponse.json({ success: false, error: 'Only pending requests can be edited' }, { status: 400 });
        }

        // 4. Validate Data based on Action Type
        let validation;
        // We need to merge existing data with updates to validate strictly, or just validate fields provided.
        // For simplicity, let's assume body contains the fields to update.
        // We'll reconstruct the full object for validation to be safe.

        const updatedData = {
            ...movement,
            ...body,
            // Ensure numbers are numbers
            qty: Number(body.qty_mcs || movement.qty_mcs),
            // Map DB columns back to schema expected keys if different
            fromStore: body.from_location || movement.from_location,
            toStore: body.to_location || movement.to_location,
        };

        if (movement.action_type === 'INWARD') validation = inwardMovementSchema.safeParse(updatedData);
        else if (movement.action_type === 'TRANSFER') validation = transferMovementSchema.safeParse(updatedData);
        else if (movement.action_type === 'DISPATCH') validation = dispatchMovementSchema.safeParse(updatedData);
        else return NextResponse.json({ success: false, error: 'Invalid action type' }, { status: 400 });

        if (!validation.success) {
            const error = validation.error as any;
            return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
        }

        const validData = validation.data;
        const { variety, packing, grade, qty } = validData;
        const remarks = (validData as any).remarks || null;
        // Extract locations
        const fromLoc = (validData as any).fromStore || null;
        const toLoc = (validData as any).toStore || null;

        // 5. Update Database
        const updateStmt = db.prepare(`
            UPDATE stock_movement_log
            SET 
                variety = ?,
                packing = ?,
                grade = ?,
                qty_mcs = ?,
                from_location = ?,
                to_location = ?,
                remarks = ?
            WHERE movement_id = ?
        `);

        updateStmt.run(variety, packing, grade, qty, fromLoc, toLoc, remarks, id);

        return NextResponse.json({ success: true, message: 'Request updated successfully' });

    } catch (error) {
        console.error('Update movement error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update request' }, { status: 500 });
    }
}
