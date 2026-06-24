import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { packingToCode } from '@/lib/utils';
import { getAvailableCartons, Carton } from '@/lib/stock-logic';

export async function GET(request: NextRequest) {
    try {
        const db = getDb();
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const isRestricted = user.role !== 'admin' && user.role !== 'general_manager';
        const allowedNames = user.assigned_store_names || [];

        const { searchParams } = new URL(request.url);
        const store = searchParams.get('store') || '';
        const type = searchParams.get('type') || '';
        const variety = searchParams.get('variety') || '';
        const packing = searchParams.get('packing') || '';

        // If user is restricted and has no stores assigned, they see nothing
        if (isRestricted && allowedNames.length === 0) {
            return NextResponse.json({
                success: true,
                data: { types: [], varieties: [], packings: [], grades: [] }
            });
        }

        // 1. Determine which stores' available cartons we need to query
        let storesToQuery: string[] = [];
        if (store) {
            if (isRestricted && !allowedNames.includes(store)) {
                return NextResponse.json({
                    success: true,
                    data: { types: [], varieties: [], packings: [], grades: [] }
                });
            }
            storesToQuery = [store];
        } else if (isRestricted) {
            storesToQuery = allowedNames;
        } else {
            // Get all active store names
            const storeRows = db.prepare("SELECT DISTINCT name FROM stores WHERE is_active = 1").all() as { name: string }[];
            storesToQuery = storeRows.map(r => r.name);
        }

        // 2. Fetch available cartons from the target stores
        let availableCartons: Carton[] = [];
        for (const s of storesToQuery) {
            availableCartons.push(...getAvailableCartons(db, s));
        }

        // 3. Extract progressive distinct values from memory
        const typesSet = new Set<string>();
        const varietiesSet = new Set<string>();
        const gradesSet = new Set<string>();
        const packingCodesSet = new Set<string>();

        for (const c of availableCartons) {
            // Types list: only filtered by store
            if (c.type) typesSet.add(c.type);

            // Varieties list: filtered by store + selected type
            if (!type || c.type === type) {
                if (c.variety) varietiesSet.add(c.variety);
            }

            // Packings: filtered by store + selected type + selected variety
            if ((!type || c.type === type) && (!variety || c.variety === variety)) {
                if (c.packing_code) packingCodesSet.add(c.packing_code);
            }

            // Grades: filtered by store + selected type + selected variety + selected packing
            const packingCode = packing ? packingToCode(packing) : '';
            if ((!type || c.type === type) && (!variety || c.variety === variety) && (!packingCode || c.packing_code === packingCode)) {
                if (c.grade) gradesSet.add(c.grade);
            }
        }

        // Fetch master data to match packing names
        const masterPackings = db.prepare("SELECT DISTINCT packing FROM master_data WHERE packing IS NOT NULL AND packing != ''").all() as { packing: string }[];
        const packingMap = new Map<string, string>();
        for (const mp of masterPackings) {
            packingMap.set(packingToCode(mp.packing), mp.packing);
        }

        const packingsFormatted = Array.from(packingCodesSet).map(code => packingMap.get(code) || code);
        packingsFormatted.sort();

        const typesList = Array.from(typesSet).sort();
        const varietiesList = Array.from(varietiesSet).sort();
        const gradesList = Array.from(gradesSet).sort();

        return NextResponse.json({
            success: true,
            data: {
                types: typesList,
                varieties: varietiesList,
                packings: packingsFormatted,
                grades: gradesList
            }
        });
    } catch (error) {
        console.error('Stock filters error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch stock filters' },
            { status: 500 }
        );
    }
}
