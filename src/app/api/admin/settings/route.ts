
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const db = getDb();
        const settings = db.prepare("SELECT key, value FROM settings").all() as { key: string, value: string }[];

        // Convert array to object
        const config: Record<string, string> = {};
        settings.forEach(s => config[s.key] = s.value);

        return NextResponse.json({ success: true, data: config });
    } catch (error) {
        console.error('Settings GET error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { key, value } = body;

        if (!key || value === undefined) {
            return NextResponse.json({ success: false, error: 'Missing key or value' }, { status: 400 });
        }

        const db = getDb();

        // Special logic for multi_store_mode toggle
        if (key === 'multi_store_mode' && String(value) === 'false') {
            // Create "Default Store" if it doesn't exist
            db.prepare(`
                INSERT INTO stores (name, type, capacity_tons, has_loading_facility, is_active)
                SELECT 'Default Store', 'Cold Store', 1000, 1, 1
                WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Default Store')
            `).run();

            // Force default_store setting to "Default Store"
            db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP")
                .run('default_store', 'Default Store', 'Default Store');
        }

        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP")
            .run(key, String(value), String(value));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Settings POST error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
    }
}
