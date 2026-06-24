import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { allocateSectionsForBatch } from '@/lib/stock-logic';
import type { MovementLogRow } from '@/lib/db-types';

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
        const movement = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(id) as MovementLogRow | undefined;

        if (!movement) {
            return NextResponse.json({ success: false, error: 'Movement not found' }, { status: 404 });
        }

        if (movement.status !== 'In Transit') {
            return NextResponse.json({ success: false, error: 'Movement is not in transit' }, { status: 400 });
        }

        // 2. Verify Permission: User must be assigned to the TO location (or FROM location if TO is a rented store)
        if (user.role !== 'admin' && user.role !== 'general_manager') {
            const allowedStores = user.assigned_store_names || [];
            
            const toStoreDetails = db.prepare('SELECT type FROM stores WHERE name = ?').get(movement.to_location) as { type: string } | undefined;
            const isToStoreRented = toStoreDetails?.type === 'Rented';

            const isAuthorized = (movement.to_location && allowedStores.includes(movement.to_location)) || 
                               (isToStoreRented && movement.from_location && allowedStores.includes(movement.from_location));

            if (!isAuthorized) {
                return NextResponse.json({
                    success: false,
                    error: isToStoreRented
                        ? `Unauthorized: You are not assigned to either the source '${movement.from_location}' or destination '${movement.to_location}' stores`
                        : `Unauthorized: You are not assigned to receive stock at '${movement.to_location}'`
                }, { status: 403 });
            }
        }

        // 3. Update Stock & Movement
        const mcNumbers = movement.mc_numbers ? movement.mc_numbers.split(',') : [];

        const updateMovement = db.prepare(`
            UPDATE stock_movement_log
            SET status = 'Completed', approved_by_id = ?
            WHERE movement_id = ?
        `);

        const transaction = db.transaction(() => {
            const settingVal = db.prepare("SELECT value FROM settings WHERE key = 'enable_location_mapping'").get() as { value: string } | undefined;
            const useMapping = settingVal?.value === 'true';

            // Allocate sections in destination store if enabled
            const allocations = useMapping && movement.to_location ? allocateSectionsForBatch(db, movement.to_location, mcNumbers.length) : [];
            let allocationIdx = 0;
            let allocatedCount = 0;

            const updateStock = db.prepare(`
                UPDATE fg_stock_master
                SET cold_store = ?, status = 'Available', section_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE mc_number = ?
            `);

            // Move stock to Final Destination and assign sections
            for (let i = 0; i < mcNumbers.length; i++) {
                const mc = mcNumbers[i];
                let currentSectionId = null;

                if (useMapping && allocations.length > 0) {
                    if (allocatedCount >= allocations[allocationIdx].count) {
                        allocationIdx++;
                        allocatedCount = 0;
                    }
                    currentSectionId = allocations[allocationIdx].sectionId;
                    allocatedCount++;
                }

                updateStock.run(movement.to_location, currentSectionId, mc);
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
