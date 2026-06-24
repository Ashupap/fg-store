import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/stock/locate?query=searchVal&store=StoreName&type=Type&variety=Variety&grade=Grade&packingDate=YYYY-MM-DD
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const queryVal = searchParams.get('query') || '';
        const storeParam = searchParams.get('store') || '';
        const sectionIdParam = searchParams.get('sectionId') || '';
        const typeParam = searchParams.get('type') || '';
        const varietyParam = searchParams.get('variety') || '';
        const gradeParam = searchParams.get('grade') || '';
        const packingDateParam = searchParams.get('packingDate') || '';

        const db = getDb();

        let sql = `
            SELECT 
                f.id, f.mc_number, f.barcode, f.short_code, f.grade, f.variety, f.type, 
                f.packing_code, f.packing_date, f.cold_store, f.status,
                s.name as section_name
            FROM fg_stock_master f
            LEFT JOIN store_sections s ON f.section_id = s.id
            WHERE f.status NOT IN ('Repacked', 'Dispatched')
        `;
        const params: any[] = [];

        if (sectionIdParam) {
            sql += ' AND f.section_id = ?';
            params.push(parseInt(sectionIdParam, 10));
        }

        if (queryVal) {
            sql += ' AND (f.mc_number LIKE ? OR f.barcode LIKE ? OR f.short_code LIKE ?)';
            // Support partial search with % suffix/prefix
            const likeVal = `%${queryVal}%`;
            params.push(likeVal, likeVal, likeVal);
        }

        if (storeParam) {
            sql += ' AND f.cold_store = ?';
            params.push(storeParam);
        }

        if (typeParam) {
            sql += ' AND f.type = ?';
            params.push(typeParam);
        }

        if (varietyParam) {
            sql += ' AND f.variety = ?';
            params.push(varietyParam);
        }

        if (gradeParam) {
            sql += ' AND f.grade = ?';
            params.push(gradeParam);
        }

        if (packingDateParam) {
            sql += ' AND f.packing_date = ?';
            params.push(packingDateParam);
        }

        // Apply store restrictions for managers / operators
        const isRestricted = user.role !== 'admin' && user.role !== 'general_manager';
        const allowedStores = user.assigned_store_names || [];
        if (isRestricted) {
            if (allowedStores.length === 0) {
                return NextResponse.json({ success: true, data: [] });
            }
            if (storeParam && !allowedStores.includes(storeParam)) {
                return NextResponse.json({ success: true, data: [] });
            }
            const placeholders = allowedStores.map(() => '?').join(',');
            sql += ` AND f.cold_store IN (${placeholders})`;
            params.push(...allowedStores);
        }

        const limitParam = searchParams.get('limit');
        if (limitParam === 'none') {
            sql += ' ORDER BY f.cold_store, s.name, f.packing_date ASC';
        } else if (limitParam) {
            sql += ' ORDER BY f.cold_store, s.name, f.packing_date ASC LIMIT ?';
            params.push(parseInt(limitParam, 10));
        } else {
            sql += ' ORDER BY f.cold_store, s.name, f.packing_date ASC LIMIT 100';
        }

        const results = db.prepare(sql).all(...params);

        return NextResponse.json({ success: true, data: results });
    } catch (error) {
        console.error('Locate stock error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
