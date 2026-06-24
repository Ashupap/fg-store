import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { z } from 'zod';

const sectionSchema = z.object({
    id: z.number().optional(),
    storeName: z.string().min(1, 'Store Name is required'),
    name: z.string().min(1, 'Section Name is required'),
    capacityMcs: z.number().int().positive('Capacity must be a positive integer'),
});

// GET /api/admin/sections?store=StoreName
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const store = searchParams.get('store') || '';

        const db = getDb();
        let query = `
            SELECT ss.id, ss.store_name, ss.name, ss.capacity_mcs, s.type as store_type
            FROM store_sections ss
            LEFT JOIN stores s ON ss.store_name = s.name
        `;
        const params: any[] = [];

        if (store) {
            query += ' WHERE ss.store_name = ?';
            params.push(store);
        }
        query += ' ORDER BY ss.store_name, ss.name';

        const sections = db.prepare(query).all(...params) as any[];

        // Hydrate occupied carton counts for each section
        const hydratedSections = sections.map(section => {
            const occupied = db.prepare(`
                SELECT COUNT(*) as count 
                FROM fg_stock_master 
                WHERE cold_store = ? AND section_id = ? AND status NOT IN ('Repacked', 'Dispatched')
            `).get(section.store_name, section.id) as { count: number };

            const count = occupied ? occupied.count : 0;
            return {
                id: section.id,
                storeName: section.store_name,
                name: section.name,
                capacityMcs: section.capacity_mcs,
                storeType: section.store_type || 'Cold Store',
                occupied: count,
                remaining: Math.max(0, section.capacity_mcs - count)
            };
        });

        return NextResponse.json({ success: true, data: hydratedSections });
    } catch (error) {
        console.error('Fetch sections error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST /api/admin/sections
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        // Allow Admins and General Managers to configure layout
        if (!user || !hasPermission(user, 'master:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const validation = sectionSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ success: false, error: validation.error.issues[0].message }, { status: 400 });
        }

        const { id, storeName, name, capacityMcs } = validation.data;
        const db = getDb();

        // Check if store exists
        const storeExists = db.prepare('SELECT 1 FROM stores WHERE name = ?').get(storeName);
        if (!storeExists) {
            return NextResponse.json({ success: false, error: `Store '${storeName}' does not exist` }, { status: 400 });
        }

        if (id) {
            // Update existing section
            const updateStmt = db.prepare(`
                UPDATE store_sections 
                SET name = ?, capacity_mcs = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            updateStmt.run(name, capacityMcs, id);
            return NextResponse.json({ success: true, message: 'Section updated successfully' });
        } else {
            // Create new section
            const insertStmt = db.prepare(`
                INSERT INTO store_sections (store_name, name, capacity_mcs)
                VALUES (?, ?, ?)
            `);
            insertStmt.run(storeName, name, capacityMcs);
            return NextResponse.json({ success: true, message: 'Section created successfully' });
        }
    } catch (error: any) {
        console.error('Save section error:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return NextResponse.json({ success: false, error: 'A section with this name already exists in the store' }, { status: 400 });
        }
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE /api/admin/sections?id=SectionId
export async function DELETE(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'master:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const idStr = searchParams.get('id');
        if (!idStr) {
            return NextResponse.json({ success: false, error: 'Section ID required' }, { status: 400 });
        }

        const id = parseInt(idStr, 10);
        const db = getDb();

        // 1. Check if section exists
        const section = db.prepare('SELECT store_name, name FROM store_sections WHERE id = ?').get(id) as { store_name: string; name: string } | undefined;
        if (!section) {
            return NextResponse.json({ success: false, error: 'Section not found' }, { status: 404 });
        }

        // 2. Validate that the section contains NO active cartons
        const activeCartons = db.prepare(`
            SELECT COUNT(*) as count 
            FROM fg_stock_master 
            WHERE cold_store = ? AND section_id = ? AND status NOT IN ('Repacked', 'Dispatched')
        `).get(section.store_name, id) as { count: number };

        if (activeCartons && activeCartons.count > 0) {
            return NextResponse.json({
                success: false,
                error: `Cannot delete section '${section.name}': it currently contains ${activeCartons.count} active cartons.`
            }, { status: 400 });
        }

        // 3. Perform delete
        db.prepare('DELETE FROM store_sections WHERE id = ?').run(id);

        return NextResponse.json({ success: true, message: 'Section deleted successfully' });
    } catch (error) {
        console.error('Delete section error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
