import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'reports:view')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const store = searchParams.get('store');
        const variety = searchParams.get('variety');
        const grade = searchParams.get('grade');
        const packing = searchParams.get('packing');
        const fromDate = searchParams.get('fromDate');
        const toDate = searchParams.get('toDate');

        if (!store) {
            return NextResponse.json({ success: false, error: 'Store is required' }, { status: 400 });
        }

        // Verify user is assigned to the store if they are not admin/GM
        const isRestricted = user.role !== 'admin' && user.role !== 'general_manager';
        if (isRestricted && !user.assigned_store_names?.includes(store)) {
            return NextResponse.json({ success: false, error: 'Access denied to this store' }, { status: 403 });
        }

        const db = getDb();

        // Fetch all completed or in-transit stock movement logs that involve this store
        // We fetch all records chronologically to compute running balance correctly.
        const query = `
            SELECT id, movement_id, movement_datetime, action_type, from_location, to_location, type, variety, packing, grade, mc_numbers, qty_mcs, status, remarks
            FROM stock_movement_log
            WHERE (
                (from_location = ? AND status IN ('Completed', 'In Transit'))
                OR
                (to_location = ? AND status = 'Completed')
            )
            ORDER BY movement_datetime ASC, id ASC
        `;
        const logs = db.prepare(query).all(store, store) as { id: number; movement_id: string; movement_datetime: string; action_type: string; from_location: string | null; to_location: string | null; type: string | null; variety: string | null; packing: string | null; grade: string | null; mc_numbers: string | null; qty_mcs: number; status: string; remarks: string | null }[];

        // Filter and format the logs
        const fromDateStr = fromDate ? `${fromDate}T00:00:00.000Z` : '1970-01-01T00:00:00.000Z';
        const toDateStr = toDate ? `${toDate}T23:59:59.999Z` : '9999-12-31T23:59:59.999Z';

        let runningBalance = 0;
        let startingBalance = 0;
        const ledgerEntries: any[] = [];

        // Helper cache for MC lookups (mainly for REPACK_OUT)
        const mcSkuCache = new Map<string, { variety: string, grade: string, packing: string, type: string }>();

        for (const log of logs) {
            let skuVariety = log.variety;
            let skuGrade = log.grade;
            let skuPacking = log.packing;
            let skuType = log.type;

            // Resolve missing SKU info for REPACK_OUT using the MC numbers
            if (!skuVariety && log.mc_numbers) {
                const mcList = log.mc_numbers.split(',');
                if (mcList.length > 0) {
                    const firstMc = mcList[0];
                    if (mcSkuCache.has(firstMc)) {
                        const cached = mcSkuCache.get(firstMc)!;
                        skuVariety = cached.variety;
                        skuGrade = cached.grade;
                        skuPacking = cached.packing;
                        skuType = cached.type;
                    } else {
                        const mcDetail = db.prepare(
                            'SELECT variety, grade, packing_code, type FROM fg_stock_master WHERE mc_number = ?'
                        ).get(firstMc) as { variety: string | null; grade: string; packing_code: string; type: string | null } | undefined;

                        if (mcDetail) {
                            skuVariety = mcDetail.variety;
                            skuGrade = mcDetail.grade;
                            skuPacking = mcDetail.packing_code;
                            skuType = mcDetail.type;
                            mcSkuCache.set(firstMc, {
                                variety: skuVariety ?? '',
                                grade: skuGrade,
                                packing: skuPacking,
                                type: skuType ?? ''
                            });
                        }
                    }
                }
            }

            // Fallbacks
            skuVariety = skuVariety || 'Unknown';
            skuGrade = skuGrade || 'Unknown';
            skuPacking = skuPacking || 'Unknown';
            skuType = skuType || 'Unknown';

            // Apply SKU filters if provided
            if (variety && variety !== skuVariety) continue;
            if (grade && grade !== skuGrade) continue;
            if (packing && packing !== skuPacking) continue;

            // Determine if inflow or outflow for this store
            const isInflow = log.to_location === store;
            const change = isInflow ? log.qty_mcs : -log.qty_mcs;

            const logTime = log.movement_datetime;

            if (logTime < fromDateStr) {
                // Accumulate to starting balance
                startingBalance += change;
                runningBalance += change;
            } else if (logTime <= toDateStr) {
                // Update running balance and record entry
                runningBalance += change;
                ledgerEntries.push({
                    id: log.id,
                    movementId: log.movement_id,
                    datetime: log.movement_datetime,
                    actionType: log.action_type,
                    fromLocation: log.from_location,
                    toLocation: log.to_location,
                    variety: skuVariety,
                    grade: skuGrade,
                    packing: skuPacking,
                    type: skuType,
                    change,
                    balance: runningBalance,
                    remarks: log.remarks,
                    status: log.status
                });
            } else {
                // After toDate, we still update the running balance to calculate ending balance correctly
                runningBalance += change;
            }
        }

        // Return starting, running (ending), and entries
        return NextResponse.json({
            success: true,
            data: {
                store,
                filters: { variety, grade, packing, fromDate, toDate },
                startingBalance,
                endingBalance: runningBalance,
                entries: ledgerEntries
            }
        });

    } catch (error: any) {
        console.error('Ledger report error:', error);
        return NextResponse.json({ success: false, error: 'Failed to generate stock ledger report' }, { status: 500 });
    }
}
