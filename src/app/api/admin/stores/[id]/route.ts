
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const updateStoreSchema = z.object({
    name: z.string().min(1, "Name is required"),
    type: z.enum(['Processing Unit', 'Cold Store', 'Rented']),
    location: z.string().optional(),
    capacity_tons: z.coerce.number().min(0),
    has_loading_facility: z.coerce.boolean(),
    is_active: z.coerce.boolean()
});

// PUT /api/admin/stores/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const validation = updateStoreSchema.safeParse(body);

        if (validation.success === false) {
            return NextResponse.json({ success: false, error: validation.error.issues[0].message }, { status: 400 });
        }

        const { name, type, location, capacity_tons, has_loading_facility, is_active } = validation.data;
        const db = getDb();

        const update = db.prepare(`
            UPDATE stores 
            SET name = ?, type = ?, location = ?, capacity_tons = ?, has_loading_facility = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        update.run(name, type, location || null, capacity_tons, has_loading_facility ? 1 : 0, is_active ? 1 : 0, id);

        return NextResponse.json({ success: true, message: 'Store updated successfully' });

    } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return NextResponse.json({ success: false, error: 'Store name already exists' }, { status: 400 });
        }
        console.error('Update store error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update store' }, { status: 500 });
    }
}

// DELETE /api/admin/stores/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;
        const db = getDb();

        // Check for dependencies (stock, movements) before deleting
        // Simple check: Don't delete if stock exists. 
        // For now, let's just Soft Delete (set inactive) via UI, but allow HARD delete here if really needed? 
        // Let's implement HARD DELETE but catch FK constraints if any (users_stores has CASCADE, but stock_master doesn't check 'stores' table yet strictly via FK, but logical references exist)

        // Logical check
        const stockCount = db.prepare("SELECT count(*) as count FROM fg_stock_master WHERE cold_store IN (SELECT name FROM stores WHERE id = ?)").get(id) as { count: number };
        if (stockCount.count > 0) {
            return NextResponse.json({ success: false, error: 'Cannot delete store with existing stock.' }, { status: 400 });
        }

        db.prepare("DELETE FROM stores WHERE id = ?").run(id);

        return NextResponse.json({ success: true, message: 'Store deleted successfully' });

    } catch (error) {
        console.error('Delete store error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete store' }, { status: 500 });
    }
}
