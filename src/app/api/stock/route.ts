import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { packingToCode } from '@/lib/utils';
import { getAvailableCartons } from '@/lib/stock-logic';
import type { StockSummary } from '@/types';

export async function GET(request: NextRequest) {
    try {
        const db = getDb();

        const user = await getCurrentUser();
        const isRestricted = user?.role !== 'admin' && user?.role !== 'general_manager'; // Only Admins & GMs see all. Managers/Operators are restricted.
        const allowedNames = user?.assigned_store_names || [];

        const { searchParams } = new URL(request.url);
        const listParam = searchParams.get('list');
        const statusParam = searchParams.get('status');
        const storeParam = searchParams.get('store');
        const typeParam = searchParams.get('type');
        const varietyParam = searchParams.get('variety');
        const gradeParam = searchParams.get('grade');
        const packingParam = searchParams.get('packing');

        // Check if list view is requested or a status query parameter is passed
        if (listParam === 'true' || statusParam) {
            // If we are listing available stock for a specific store, exclude pending allocations
            if ((!statusParam || statusParam === 'Available') && storeParam) {
                const data = getAvailableCartons(db, storeParam, {
                    type: typeParam || undefined,
                    variety: varietyParam || undefined,
                    packing: packingParam || undefined,
                    grade: gradeParam || undefined,
                });
                return NextResponse.json({ success: true, data });
            }

            let query = `
                SELECT id, mc_number, grade, variety, type, packing_code, status, cold_store, packing_date, barcode, short_code
                FROM fg_stock_master
                WHERE 1=1
            `;
            const params: any[] = [];

            if (statusParam) {
                query += ` AND status = ?`;
                params.push(statusParam);
            } else {
                query += ` AND status IN ('Available', 'Reserved', 'Allocated', 'In Transit', 'In Repacking')`;
            }

            if (storeParam) {
                query += ` AND cold_store = ?`;
                params.push(storeParam);
            }

            if (typeParam) {
                query += ` AND type = ?`;
                params.push(typeParam);
            }

            if (varietyParam) {
                query += ` AND variety = ?`;
                params.push(varietyParam);
            }

            if (gradeParam) {
                query += ` AND grade = ?`;
                params.push(gradeParam);
            }

            if (packingParam) {
                const packingCode = packingToCode(packingParam);
                query += ` AND packing_code = ?`;
                params.push(packingCode);
            }

            const poIdParam = searchParams.get('poId');
            if (poIdParam) {
                const po = db.prepare('SELECT po_number FROM purchase_orders WHERE id = ?').get(parseInt(poIdParam, 10)) as { po_number: string } | undefined;
                if (po) {
                    query += ` AND reserved_for_po = ?`;
                    params.push(po.po_number);
                } else {
                    return NextResponse.json({ success: true, data: [] });
                }
            }

            // Apply store restrictions for operators / managers
            if (isRestricted && allowedNames.length > 0) {
                if (storeParam && !allowedNames.includes(storeParam)) {
                    return NextResponse.json({ success: true, data: [] });
                }
                if (!storeParam) {
                    const placeholders = allowedNames.map(() => '?').join(',');
                    query += ` AND cold_store IN (${placeholders})`;
                    params.push(...allowedNames);
                }
            }

            query += ` ORDER BY packing_date ASC`;

            const data = db.prepare(query).all(...params);
            return NextResponse.json({ success: true, data });
        }

        // Stock Summary View (Dashboard)
        // Get all unique stores that we are querying
        let storesQuery = `
            SELECT DISTINCT name FROM (
                SELECT name FROM stores WHERE is_active = 1
                UNION
                SELECT DISTINCT cold_store as name FROM fg_stock_master WHERE cold_store IS NOT NULL AND cold_store != ''
            )
        `;
        const storesParams: any[] = [];
        if (isRestricted) {
            if (allowedNames.length === 0) return NextResponse.json({ success: true, data: [] });

            const placeholders = allowedNames.map(() => '?').join(',');
            storesQuery = `
                SELECT DISTINCT name FROM (
                    SELECT name FROM stores WHERE is_active = 1 AND name IN (${placeholders})
                    UNION
                    SELECT DISTINCT cold_store as name FROM fg_stock_master WHERE cold_store IS NOT NULL AND cold_store != '' AND cold_store IN (${placeholders})
                )
            `;
            storesParams.push(...allowedNames, ...allowedNames);
        }
        const storeRows = db.prepare(storesQuery).all(...storesParams) as { name: string }[];
        const targetStores = storeRows.map(r => r.name);

        const summaryMap = new Map<string, number>();

        for (const store of targetStores) {
            const available = getAvailableCartons(db, store);
            for (const carton of available) {
                if (['Available', 'Reserved', 'Allocated'].includes(carton.status)) {
                    const key = `${carton.type || 'Unknown'}||${carton.variety || 'Unknown'}||${store}`;
                    summaryMap.set(key, (summaryMap.get(key) || 0) + 1);
                }
            }
        }

        const summary: StockSummary[] = [];
        summaryMap.forEach((count, key) => {
            if (count > 0) {
                const [type, variety, coldStore] = key.split('||');
                summary.push({ type, variety, coldStore, stock: count });
            }
        });

        // Sort summary
        summary.sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            if (a.variety !== b.variety) return a.variety.localeCompare(b.variety);
            return a.coldStore.localeCompare(b.coldStore);
        });

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
