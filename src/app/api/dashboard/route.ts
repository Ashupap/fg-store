import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { daysBetween } from '@/lib/utils';
import type { DashboardRow } from '@/types';

export async function GET(request: NextRequest) {
    try {
        const db = getDb();
        const { searchParams } = new URL(request.url);

        const stockType = searchParams.get('type'); // IQF or SLAB
        const varietyFilter = searchParams.get('variety');
        const gradeFilter = searchParams.get('grade');

        // Check user permissions
        const { getCurrentUser } = await import('@/lib/auth');
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        if (user.role !== 'operator') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        // Build query with optional filters
        const conditions: string[] = [];
        const params: string[] = [];

        // Apply Store Restrictions - REMOVED per user request (Main Dashboard is Public)
        // if (user?.assigned_store_ids && user.assigned_store_ids.length > 0) { ... }


        if (stockType && stockType !== 'all') {
            conditions.push('type = ?');
            params.push(stockType);
        }
        if (varietyFilter && varietyFilter !== 'all') {
            conditions.push('variety = ?');
            params.push(varietyFilter);
        }
        if (gradeFilter && gradeFilter !== 'all') {
            conditions.push('grade = ?');
            params.push(gradeFilter);
        }

        // Consistency Fix: Only include Available, Reserved, Allocated stock in dashboard counts
        // Exclude 'In Transit', 'Pending Approval', 'Exported', 'Dispatched'
        conditions.push("status IN ('Available', 'Reserved', 'Allocated')");

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Get stock grouped by type, variety, grade, packing AND cold_store
        const stockQuery = `
      SELECT 
        type,
        variety,
        grade,
        packing_code,
        status,
        cold_store,
        COUNT(*) as count,
        MIN(packing_date) as oldest_date
      FROM fg_stock_master
      ${whereClause}
      GROUP BY type, variety, grade, packing_code, status, cold_store
    `;

        const stockData = db.prepare(stockQuery).all(...params) as {
            type: string;
            variety: string;
            grade: string;
            packing_code: string;
            status: string;
            cold_store: string;
            count: number;
            oldest_date: string;
        }[];

        // Get pending PO MCs
        const pendingPOQuery = `
      SELECT 
        pli.grade,
        pli.packing_code,
        SUM(pli.ordered_qty - pli.allocated_qty) as pending
      FROM po_line_items pli
      JOIN purchase_orders po ON pli.po_id = po.id
      WHERE po.status = 'Active' AND pli.ordered_qty > pli.allocated_qty
      GROUP BY pli.grade, pli.packing_code
    `;

        const pendingPOData = db.prepare(pendingPOQuery).all() as {
            grade: string;
            packing_code: string;
            pending: number;
        }[];

        // Get MCs per FCL from master data
        const mcsPerFCLQuery = `
      SELECT DISTINCT variety, mcs_per_fcl 
      FROM master_data 
      WHERE mcs_per_fcl IS NOT NULL AND variety IS NOT NULL AND variety != ''
    `;
        const mcsPerFCLData = db.prepare(mcsPerFCLQuery).all() as {
            variety: string;
            mcs_per_fcl: number;
        }[];

        // Create lookup maps
        const pendingPOMap = new Map<string, number>();
        pendingPOData.forEach(item => {
            const key = `${item.grade}|${item.packing_code}`;
            pendingPOMap.set(key, item.pending);
        });

        const mcsPerFCLMap = new Map<string, number>();
        mcsPerFCLData.forEach(item => {
            mcsPerFCLMap.set(item.variety.trim().toUpperCase(), item.mcs_per_fcl);
        });

        // Aggregate data by type + variety + grade + packing
        const aggregated = new Map<string, {
            type: string;
            variety: string;
            grade: string;
            packingCode: string;
            totalMCs: number;
            availableMCs: number;
            reservedMCs: number;
            allocatedMCs: number;
            oldestDate: string | null;
            stores: Map<string, number>;
        }>();

        stockData.forEach(item => {
            const key = `${item.type}|${item.variety}|${item.grade}|${item.packing_code}`;

            if (!aggregated.has(key)) {
                aggregated.set(key, {
                    type: item.type || 'N/A',
                    variety: item.variety || 'N/A',
                    grade: item.grade,
                    packingCode: item.packing_code,
                    totalMCs: 0,
                    availableMCs: 0,
                    reservedMCs: 0,
                    allocatedMCs: 0,
                    oldestDate: null,
                    stores: new Map(),
                });
            }

            const agg = aggregated.get(key)!;
            agg.totalMCs += item.count;

            switch (item.status) {
                case 'Available':
                    agg.availableMCs += item.count;
                    // Track store breakdown only for Available stock (usually what matters for Drill-down)
                    // Or should we track total? User said "clicking on one entry... display cold store wise data".
                    // Usually implies Available stock location. Let's track Available.
                    const currentStoreCount = agg.stores.get(item.cold_store) || 0;
                    agg.stores.set(item.cold_store, currentStoreCount + item.count);
                    break;
                case 'Reserved':
                    agg.reservedMCs += item.count;
                    break;
                case 'Allocated':
                case 'Exported':
                    agg.allocatedMCs += item.count;
                    break;
            }

            if (!agg.oldestDate || item.oldest_date < agg.oldestDate) {
                agg.oldestDate = item.oldest_date;
            }
        });

        // Build final dashboard rows
        const finalDashboardData: DashboardRow[] = Array.from(aggregated.values()).map(item => {
            const pendingPOMCs = pendingPOMap.get(`${item.grade}|${item.packingCode}`) || 0;
            const mcsPerFCL = mcsPerFCLMap.get(item.variety?.trim().toUpperCase() || '') || 100; // Default to 100 if not found
            const fcl40ft = item.availableMCs / mcsPerFCL;
            const daysAging = item.oldestDate ? daysBetween(item.oldestDate) : 0;
            const storeBreakdown = Array.from(item.stores.entries()).map(([store, count]) => ({ store, count }));

            return {
                type: item.type,
                variety: item.variety,
                grade: item.grade,
                packingCode: item.packingCode,
                packingDescription: item.packingCode,
                totalMCs: item.totalMCs,
                availableMCs: item.availableMCs,
                reservedMCs: item.reservedMCs,
                allocatedMCs: item.allocatedMCs,
                pendingPOMCs,
                mcsPerFCL,
                fcl40ft: Math.round(fcl40ft * 100) / 100,
                oldestPackingDate: item.oldestDate,
                daysAging,
                storeBreakdown
            };
        });


        // Sort by variety, then grade, then packing
        finalDashboardData.sort((a, b) => {
            if (a.variety !== b.variety) return a.variety.localeCompare(b.variety);
            if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
            return a.packingCode.localeCompare(b.packingCode);
        });

        return NextResponse.json({
            success: true,
            data: finalDashboardData,
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch dashboard data' },
            { status: 500 }
        );
    }
}
