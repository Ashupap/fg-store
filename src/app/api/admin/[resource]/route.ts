import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';

// Schema for validation
const configSchema = z.object({
    value: z.string().min(1, "Value is required"),
    mcs_per_fcl: z.string().transform(v => parseInt(v)).or(z.number()).optional(),
});

import { getCurrentUser, hasPermission } from '@/lib/auth';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ resource: string }> }
) {
    try {
        const user = await getCurrentUser();
        // Allow Admin and General Manager
        if (!user || !hasPermission(user, 'master:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const db = getDb();
        const { resource } = await params;

        // ... (omitted for brevity, but I should be careful not to delete content)
        // Actually replace_file_content replaces the whole block.
        // I'll do chunked replacements for each function signature.


        // Map resource to column
        const columnMap: Record<string, string> = {
            'varieties': 'variety',
            'packings': 'packing',
            'grades': 'grade',
            'types': 'type',
            'cold-stores': 'cold_store'
        };

        const column = columnMap[resource];
        if (!column) {
            return NextResponse.json({ success: false, error: 'Invalid resource' }, { status: 400 });
        }

        // Get distinct values
        // For varieties, we also get mcs_per_fcl
        let query = '';
        if (resource === 'varieties') {
            query = `
                SELECT DISTINCT variety as value, mcs_per_fcl, id 
                FROM master_data 
                WHERE variety IS NOT NULL AND variety != '' 
                ORDER BY variety
            `;
        } else {
            query = `
                SELECT DISTINCT ${column} as value, id 
                FROM master_data 
                WHERE ${column} IS NOT NULL AND ${column} != '' 
                ORDER BY ${column}
            `;
        }

        const data = db.prepare(query).all();

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Admin API error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch data' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ resource: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'master:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const db = getDb();
        const { resource } = await params;
        const body = await request.json();

        // Validate
        const validation = configSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ success: false, error: validation.error.message }, { status: 400 });
        }

        const { value, mcs_per_fcl } = validation.data;

        // Map resource to column
        const columnMap: Record<string, string> = {
            'varieties': 'variety',
            'packings': 'packing',
            'grades': 'grade',
            'types': 'type',
            'cold-stores': 'cold_store'
        };

        const column = columnMap[resource];
        if (!column) {
            return NextResponse.json({ success: false, error: 'Invalid resource' }, { status: 400 });
        }

        // Check format for numerical logic if needed
        const fclValue = resource === 'varieties' ? (mcs_per_fcl || 100) : null;

        // Insert new record
        const insert = db.prepare(`
            INSERT INTO master_data (${column}, mcs_per_fcl)
            VALUES (?, ?)
        `);

        insert.run(value, fclValue);

        return NextResponse.json({ success: true, message: 'Record added successfully' });
    } catch (error) {
        console.error('Admin create error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create record' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ resource: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'master:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const db = getDb();
        const { resource } = await params;
        const { searchParams } = new URL(request.url);
        const value = searchParams.get('value');

        if (!value) {
            return NextResponse.json({ success: false, error: 'Value is required' }, { status: 400 });
        }

        const columnMap: Record<string, string> = {
            'varieties': 'variety',
            'packings': 'packing',
            'grades': 'grade',
            'types': 'type',
            'cold-stores': 'cold_store'
        };

        const column = columnMap[resource];
        if (!column) {
            return NextResponse.json({ success: false, error: 'Invalid resource' }, { status: 400 });
        }

        // Delete records with this value
        const result = db.prepare(`
            DELETE FROM master_data 
            WHERE ${column} = ?
        `).run(value);

        return NextResponse.json({ success: true, message: 'Record deleted successfully' });
    } catch (error) {
        console.error('Admin delete error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete record' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ resource: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'master:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const db = getDb();
        const { resource } = await params;
        const body = await request.json();

        const { oldValue, newValue, mcs_per_fcl } = body;

        if (!oldValue || !newValue) {
            return NextResponse.json({ success: false, error: 'Old and new values are required' }, { status: 400 });
        }

        const columnMap: Record<string, string> = {
            'varieties': 'variety',
            'packings': 'packing',
            'grades': 'grade',
            'types': 'type',
            'cold-stores': 'cold_store'
        };

        const column = columnMap[resource];
        if (!column) {
            return NextResponse.json({ success: false, error: 'Invalid resource' }, { status: 400 });
        }

        // Update records
        let query = `UPDATE master_data SET ${column} = ?`;
        const queryParams: (string | number)[] = [newValue];

        if (resource === 'varieties' && mcs_per_fcl !== undefined) {
            query += `, mcs_per_fcl = ?`;
            queryParams.push(mcs_per_fcl);
        }

        query += ` WHERE ${column} = ?`;
        queryParams.push(oldValue);

        db.prepare(query).run(...queryParams);

        return NextResponse.json({ success: true, message: 'Record updated successfully' });
    } catch (error) {
        console.error('Admin update error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update record' },
            { status: 500 }
        );
    }
}
