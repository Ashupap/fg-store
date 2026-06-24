import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getAvailableCartons } from '@/lib/stock-logic';

export async function GET(request: NextRequest) {
    try {
        const db = getDb();
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const store = searchParams.get('store') || '';
        const date = searchParams.get('date') || '';

        if (!store || !date) {
            return NextResponse.json({ success: false, error: 'Store and Date are required parameters' }, { status: 400 });
        }

        // Store Isolation Check for restricted roles
        const isRestricted = user.role !== 'admin' && user.role !== 'general_manager';
        const allowedStores = user.assigned_store_names || [];
        if (isRestricted && !allowedStores.includes(store)) {
            return NextResponse.json({ success: false, error: 'Unauthorized store access' }, { status: 403 });
        }

        // Get all available cartons for this store (excluding pending approval allocations)
        const availableCartons = getAvailableCartons(db, store);
        const availableMcSet = new Set(availableCartons.map(c => c.mc_number));

        // Query available stock grouped into batches on that date
        const query = `
            SELECT 
                f.mc_number,
                f.type,
                f.variety,
                f.packing_code,
                m.packing,
                f.grade,
                f.packing_date
            FROM fg_stock_master f
            LEFT JOIN (SELECT DISTINCT packing FROM master_data WHERE packing IS NOT NULL AND packing != '') m 
                ON f.packing_code = REPLACE(UPPER(m.packing), ' ', '')
            WHERE f.cold_store = ? AND f.packing_date = ? AND f.status = 'Available'
        `;

        const data = db.prepare(query).all(store, date) as { mc_number: string; type: string | null; variety: string | null; packing_code: string; packing: string | null; grade: string; packing_date: string }[];

        // Filter by the available carton set in memory
        const filteredRows = data.filter(row => availableMcSet.has(row.mc_number));

        // Group the filtered rows by type, variety, packing_code, grade, packing_date
        const groups: { [key: string]: {
            type: string;
            variety: string;
            packing: string;
            grade: string;
            packingDate: string;
            qty: number;
            mcNumbers: string[];
        } } = {};

        for (const row of filteredRows) {
            const packingName = row.packing || row.packing_code;
            const key = `${row.type}||${row.variety}||${row.packing_code}||${row.grade}||${row.packing_date}`;
            if (!groups[key]) {
                groups[key] = {
                    type: row.type ?? '',
                    variety: row.variety ?? '',
                    packing: packingName,
                    grade: row.grade,
                    packingDate: row.packing_date,
                    qty: 0,
                    mcNumbers: []
                };
            }
            groups[key].qty++;
            groups[key].mcNumbers.push(row.mc_number);
        }

        const formattedData = Object.values(groups);

        // Sort formattedData: type, variety, grade
        formattedData.sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            if (a.variety !== b.variety) return a.variety.localeCompare(b.variety);
            return a.grade.localeCompare(b.grade);
        });

        return NextResponse.json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error('Batches by date error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch batches by date' },
            { status: 500 }
        );
    }
}
