
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const createStoreSchema = z.object({
    name: z.string().min(1, "Name is required"),
    type: z.enum(['Processing Unit', 'Cold Store', 'Rented']),
    location: z.string().optional(),
    capacity_tons: z.coerce.number().min(0).default(0),
    has_loading_facility: z.boolean().default(false),
    is_active: z.boolean().default(true)
});

// GET /api/admin/stores - List all stores
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'admin' && user.role !== 'general_manager')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const db = getDb();
        const stores = db.prepare("SELECT * FROM stores ORDER BY name ASC").all();

        return NextResponse.json({ success: true, data: stores });
    } catch (error) {
        console.error('Fetch stores error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch stores' }, { status: 500 });
    }
}

// POST /api/admin/stores - Create new store
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'admin' && user.role !== 'general_manager')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const validation = createStoreSchema.safeParse(body);

        if (validation.success === false) {
            return NextResponse.json({ success: false, error: validation.error.issues[0].message }, { status: 400 });
        }

        const { name, type, location, capacity_tons, has_loading_facility, is_active } = validation.data;
        const db = getDb();

        const insert = db.prepare(`
            INSERT INTO stores (name, type, location, capacity_tons, has_loading_facility, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        insert.run(name, type, location || null, capacity_tons, has_loading_facility ? 1 : 0, is_active ? 1 : 0);

        return NextResponse.json({ success: true, message: 'Store created successfully' });

    } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return NextResponse.json({ success: false, error: 'Store name already exists' }, { status: 400 });
        }
        console.error('Create store error:', error);
        return NextResponse.json({ success: false, error: 'Failed to create store' }, { status: 500 });
    }
}
