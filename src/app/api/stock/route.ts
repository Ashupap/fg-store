import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { StockSummary } from '@/types';

export async function GET() {
    try {
        const db = getDb();

        const user = await getCurrentUser();
        const isRestricted = user?.role !== 'admin' && user?.role !== 'general_manager'; // Only Admins & GMs see all. Managers/Operators are restricted.
        const allowedNames = user?.assigned_store_names || [];

        // Correcting the query construction logic:
        const baseWhere = "status IN ('Available', 'Reserved', 'Allocated') AND cold_store IS NOT NULL AND cold_store != ''";
        let finalWhere = baseWhere;
        let params: any[] = [];

        if (isRestricted) {
            if (allowedNames.length === 0) return NextResponse.json({ success: true, data: [] });

            const placeholders = allowedNames.map(() => '?').join(',');
            // We append the restriction to the base where clause
            finalWhere = `${baseWhere} AND cold_store IN (${placeholders})`;
            params = [...allowedNames];
        }

        const query = `
            SELECT 
                type,
                variety,
                cold_store,
                COUNT(*) as stock
            FROM fg_stock_master
            WHERE ${finalWhere}
            GROUP BY type, variety, cold_store
            HAVING stock > 0
            ORDER BY type, variety, cold_store
        `;

        const data = db.prepare(query).all(...params) as {
            type: string;
            variety: string;
            cold_store: string;
            stock: number;
        }[];

        const summary: StockSummary[] = data.map(item => ({
            type: item.type || 'Unknown',
            variety: item.variety || 'Unknown',
            coldStore: item.cold_store,
            stock: item.stock,
        }));

        return NextResponse.json({
            success: true,
            data: summary,
        });
    } catch (error) {
        console.error('Stock summary error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch stock summary' },
            { status: 500 }
        );
    }
}
