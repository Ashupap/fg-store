import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/dashboard/filter-options - Get available filter options based on current filters
export async function GET(request: NextRequest) {
    try {
        const { getCurrentUser } = await import('@/lib/auth');
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        const db = getDb();
        const { searchParams } = new URL(request.url);

        const stockType = searchParams.get('type');
        const variety = searchParams.get('variety');

        // Build conditions for filtering
        const conditions: string[] = [];
        const params: string[] = [];

        if (stockType && stockType !== 'all') {
            conditions.push('type = ?');
            params.push(stockType);
        }
        if (variety && variety !== 'all') {
            conditions.push('variety = ?');
            params.push(variety);
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Get distinct varieties based on type filter
        const varietyConditions = stockType && stockType !== 'all'
            ? 'WHERE type = ?'
            : '';
        const varietyParams = stockType && stockType !== 'all' ? [stockType] : [];

        const varietiesQuery = db.prepare(`
            SELECT DISTINCT variety 
            FROM fg_stock_master 
            ${varietyConditions}
            AND variety IS NOT NULL AND variety != ''
            ORDER BY variety
        `.replace('AND', varietyConditions ? 'AND' : 'WHERE')).all(...varietyParams) as { variety: string }[];

        // Get distinct grades based on type and variety filters
        const gradesQuery = db.prepare(`
            SELECT DISTINCT grade 
            FROM fg_stock_master 
            ${whereClause}
            ${whereClause ? 'AND' : 'WHERE'} grade IS NOT NULL AND grade != ''
            ORDER BY grade
        `).all(...params) as { grade: string }[];

        return NextResponse.json({
            success: true,
            data: {
                varieties: varietiesQuery.map(v => v.variety),
                grades: gradesQuery.map(g => g.grade),
            },
        });
    } catch (error) {
        console.error('Filter options error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch filter options' },
            { status: 500 }
        );
    }
}
