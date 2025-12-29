import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
    try {
        const db = getDb();

        // Get all unique values from master_data
        const grades = db.prepare("SELECT DISTINCT grade FROM master_data WHERE grade IS NOT NULL AND grade != '' ORDER BY grade").all() as { grade: string }[];
        const varieties = db.prepare("SELECT DISTINCT variety FROM master_data WHERE variety IS NOT NULL AND variety != '' ORDER BY variety").all() as { variety: string }[];
        const packings = db.prepare("SELECT DISTINCT packing FROM master_data WHERE packing IS NOT NULL AND packing != '' ORDER BY packing").all() as { packing: string }[];
        const types = db.prepare("SELECT DISTINCT type FROM master_data WHERE type IS NOT NULL AND type != '' ORDER BY type").all() as { type: string }[];

        // Fetch stores from the 'stores' table (Source of Truth) instead of master_data
        const coldStores = db.prepare("SELECT name as cold_store FROM stores WHERE is_active = 1 ORDER BY name").all() as { cold_store: string }[];

        // Get packing to MCs per FCL mapping
        const packingMap = db.prepare("SELECT packing, mcs_per_fcl FROM master_data WHERE packing IS NOT NULL AND mcs_per_fcl IS NOT NULL").all() as { packing: string; mcs_per_fcl: number }[];

        return NextResponse.json({
            success: true,
            data: {
                grades: grades.map(g => g.grade),
                varieties: varieties.map(v => v.variety),
                packings: packings.map(p => p.packing),
                types: types.map(t => t.type),
                coldStores: coldStores.map(c => c.cold_store),
                packingMap: Object.fromEntries(packingMap.map(p => [p.packing, p.mcs_per_fcl])),
            },
        });
    } catch (error) {
        console.error('Master data error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch master data' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const { getCurrentUser } = await import('@/lib/auth');
        const user = await getCurrentUser();

        if (!user || (user.role !== 'admin' && user.role !== 'general_manager')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const db = getDb();
        const body = await request.json();

        const { grade, variety, packing, type, cold_store, mcs_per_fcl } = body;

        // Check for duplicates
        if (grade) {
            const exists = db.prepare("SELECT id FROM master_data WHERE LOWER(grade) = LOWER(?)").get(grade);
            if (exists) return NextResponse.json({ success: false, error: 'Grade already exists' }, { status: 400 });
        }
        if (variety) {
            const exists = db.prepare("SELECT id FROM master_data WHERE LOWER(variety) = LOWER(?)").get(variety);
            if (exists) return NextResponse.json({ success: false, error: 'Variety already exists' }, { status: 400 });
        }
        if (packing) {
            const exists = db.prepare("SELECT id FROM master_data WHERE LOWER(packing) = LOWER(?)").get(packing);
            if (exists) return NextResponse.json({ success: false, error: 'Packing already exists' }, { status: 400 });
        }
        if (type) {
            const exists = db.prepare("SELECT id FROM master_data WHERE LOWER(type) = LOWER(?)").get(type);
            if (exists) return NextResponse.json({ success: false, error: 'Type already exists' }, { status: 400 });
        }
        if (cold_store) {
            const exists = db.prepare("SELECT id FROM master_data WHERE LOWER(cold_store) = LOWER(?)").get(cold_store);
            if (exists) return NextResponse.json({ success: false, error: 'Cold Store already exists' }, { status: 400 });
        }

        const result = db.prepare(`
      INSERT INTO master_data (grade, variety, packing, type, cold_store, mcs_per_fcl)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(grade, variety, packing, type, cold_store, mcs_per_fcl);

        return NextResponse.json({
            success: true,
            data: { id: result.lastInsertRowid },
        });
    } catch (error) {
        console.error('Master data insert error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to insert master data' },
            { status: 500 }
        );
    }
}
