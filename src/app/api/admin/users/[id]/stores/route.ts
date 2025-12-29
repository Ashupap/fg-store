
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const assignStoresSchema = z.object({
    store_ids: z.array(z.number())
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const admin = await getCurrentUser();
        if (!admin || admin.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;
        const userId = parseInt(id);
        if (isNaN(userId)) {
            return NextResponse.json({ success: false, error: 'Invalid user ID' }, { status: 400 });
        }

        const body = await request.json();
        const validation = assignStoresSchema.safeParse(body);

        if (validation.success === false) {
            return NextResponse.json({ success: false, error: validation.error.issues[0].message }, { status: 400 });
        }

        const { store_ids } = validation.data;
        const db = getDb();

        // Transaction to update assignments
        const transaction = db.transaction(() => {
            // 1. Delete existing assignments
            db.prepare("DELETE FROM user_stores WHERE user_id = ?").run(userId);

            // 2. Insert new assignments
            if (store_ids.length > 0) {
                const insert = db.prepare("INSERT INTO user_stores (user_id, store_id) VALUES (?, ?)");
                for (const storeId of store_ids) {
                    insert.run(userId, storeId);
                }
            }
        });

        transaction();

        return NextResponse.json({ success: true, message: 'Store assignments updated successfully' });

    } catch (error) {
        console.error('Update user stores error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update store assignments' }, { status: 500 });
    }
}
