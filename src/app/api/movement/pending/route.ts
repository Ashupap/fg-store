import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        // Authenticate
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const db = getDb();

        // Explicitly type pendingRequests to avoid implicit any[] error
        let pendingRequests: any[] = [];

        if (user.role === 'operator') {
            // Operators only see their own Pending Approval requests
            pendingRequests = db.prepare(`
                SELECT 
                    sml.*,
                    u.name as moved_by_name
                FROM stock_movement_log sml
                LEFT JOIN users u ON sml.moved_by_id = u.id
                WHERE sml.status = 'Pending Approval' AND sml.moved_by_id = ?
                ORDER BY sml.movement_datetime DESC
             `).all(user.id);
        } else {
            // Managers/Admins/GMs logic
            if (user.role === 'admin' || user.role === 'general_manager') {
                // Admins & GMs see ALL pending OR in-transit requests
                pendingRequests = db.prepare(`
                    SELECT 
                        sml.*,
                        u.name as moved_by_name
                    FROM stock_movement_log sml
                    LEFT JOIN users u ON sml.moved_by_id = u.id
                    WHERE sml.status IN ('Pending Approval', 'In Transit')
                    ORDER BY sml.movement_datetime DESC
                 `).all();
            } else {
                // Managers see requests for their stores
                const assignedStores = user.assigned_store_names || [];

                if (assignedStores.length === 0) {
                    pendingRequests = [];
                } else {
                    const placeholders = assignedStores.map(() => '?').join(',');
                    // Params: 
                    // 1. from_location for Pending
                    // 2. to_location for Pending
                    // 3. to_location for In Transit
                    // 4. from_location for In Transit (to rented stores)
                    const params = [
                        ...assignedStores, 
                        ...assignedStores, 
                        ...assignedStores, 
                        ...assignedStores
                    ];

                    pendingRequests = db.prepare(`
                        SELECT 
                            sml.*,
                            u.name as moved_by_name
                        FROM stock_movement_log sml
                        LEFT JOIN users u ON sml.moved_by_id = u.id
                        LEFT JOIN stores ts ON sml.to_location = ts.name
                        WHERE 
                        (
                            sml.status = 'Pending Approval'
                            AND (
                                sml.from_location IN (${placeholders}) 
                                OR 
                                sml.to_location IN (${placeholders})
                            )
                        )
                        OR
                        (
                            sml.status = 'In Transit'
                            AND (
                                sml.to_location IN (${placeholders})
                                OR
                                (
                                    ts.type = 'Rented'
                                    AND sml.from_location IN (${placeholders})
                                )
                            )
                        )
                        ORDER BY sml.movement_datetime DESC
                     `).all(...params);
                }
            }
        }

        return NextResponse.json({
            success: true,
            data: pendingRequests
        });

    } catch (error) {
        console.error('Pending requests error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch pending requests' },
            { status: 500 }
        );
    }
}
