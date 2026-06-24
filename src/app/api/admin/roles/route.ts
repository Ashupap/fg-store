import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';
import type { RoleRow } from '@/lib/db-types';

const roleSchema = z.object({
    name: z.string().min(1, 'Role name is required'),
    permissions: z.array(z.string()).min(1, 'At least one permission is required'),
});

const updateRoleSchema = z.object({
    id: z.number().int().positive(),
    permissions: z.array(z.string()).min(1, 'At least one permission is required'),
});

// System valid permission keys
const VALID_PERMISSIONS = [
    'inward:create',
    'transfer:initiate',
    'transfer:approve',
    'transfer:accept',
    'dispatch:create',
    'po:manage',
    'po:allocate',
    'repack:start',
    'repack:complete',
    'shipment:manage',
    'shipment:scan',
    'master:manage',
    'users:manage',
    'settings:manage',
    'reports:view',
    'transaction:update',
];

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized: Only admins can manage roles' }, { status: 403 });
        }

        const db = getDb();
        const roles = db.prepare('SELECT * FROM roles ORDER BY is_system DESC, name ASC').all() as (RoleRow & { permissions: string })[];

        // Parse permissions JSON
        const parsedRoles = roles.map(r => ({
            ...r,
            permissions: JSON.parse(r.permissions),
        }));

        return NextResponse.json({ success: true, data: parsedRoles });
    } catch (error) {
        console.error('Fetch roles error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch roles' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized: Only admins can manage roles' }, { status: 403 });
        }

        const body = await request.json();
        const validation = roleSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ success: false, error: validation.error.issues[0].message }, { status: 400 });
        }

        const { name, permissions } = validation.data;
        const normalizedName = name.trim().toLowerCase().replace(/\s+/g, '_');

        // Check permission keys are valid
        const invalidPermissions = permissions.filter(p => !VALID_PERMISSIONS.includes(p) && p !== '*');
        if (invalidPermissions.length > 0) {
            return NextResponse.json({ success: false, error: `Invalid permission keys: ${invalidPermissions.join(', ')}` }, { status: 400 });
        }

        const db = getDb();

        // Check if role already exists
        const existing = db.prepare('SELECT id FROM roles WHERE name = ?').get(normalizedName);
        if (existing) {
            return NextResponse.json({ success: false, error: 'Role already exists' }, { status: 400 });
        }

        db.prepare('INSERT INTO roles (name, permissions, is_system) VALUES (?, ?, 0)')
            .run(normalizedName, JSON.stringify(permissions));

        return NextResponse.json({ success: true, message: 'Role created successfully' });
    } catch (error) {
        console.error('Create role error:', error);
        return NextResponse.json({ success: false, error: 'Failed to create role' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized: Only admins can manage roles' }, { status: 403 });
        }

        const body = await request.json();
        const validation = updateRoleSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ success: false, error: validation.error.issues[0].message }, { status: 400 });
        }

        const { id, permissions } = validation.data;

        // Check permissions
        const invalidPermissions = permissions.filter(p => !VALID_PERMISSIONS.includes(p) && p !== '*');
        if (invalidPermissions.length > 0) {
            return NextResponse.json({ success: false, error: `Invalid permission keys: ${invalidPermissions.join(', ')}` }, { status: 400 });
        }

        const db = getDb();

        // Check if role exists and is system role
        const role = db.prepare('SELECT is_system FROM roles WHERE id = ?').get(id) as { is_system: number } | undefined;
        if (!role) {
            return NextResponse.json({ success: false, error: 'Role not found' }, { status: 404 });
        }

        if (role.is_system === 1) {
            return NextResponse.json({ success: false, error: 'System roles cannot be modified' }, { status: 400 });
        }

        db.prepare('UPDATE roles SET permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(JSON.stringify(permissions), id);

        return NextResponse.json({ success: true, message: 'Role updated successfully' });
    } catch (error) {
        console.error('Update role error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update role' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized: Only admins can manage roles' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const idStr = searchParams.get('id');
        if (!idStr) {
            return NextResponse.json({ success: false, error: 'Role ID is required' }, { status: 400 });
        }

        const id = parseInt(idStr, 10);
        const db = getDb();

        // Fetch role details
        const role = db.prepare('SELECT name, is_system FROM roles WHERE id = ?').get(id) as { name: string; is_system: number } | undefined;
        if (!role) {
            return NextResponse.json({ success: false, error: 'Role not found' }, { status: 404 });
        }

        if (role.is_system === 1) {
            return NextResponse.json({ success: false, error: 'System roles cannot be deleted' }, { status: 400 });
        }

        // Run deletion inside transaction
        const transaction = db.transaction(() => {
            // Reset any users of this role to 'operator'
            db.prepare("UPDATE users SET role = 'operator' WHERE role = ?").run(role.name);
            // Delete role
            db.prepare('DELETE FROM roles WHERE id = ?').run(id);
        });

        transaction();

        return NextResponse.json({ success: true, message: 'Role deleted successfully' });
    } catch (error) {
        console.error('Delete role error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete role' }, { status: 500 });
    }
}
