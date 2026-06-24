
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hashPassword, hasPermission } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'users:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const db = getDb();

        // Fetch all users
        const users = db.prepare("SELECT id, name, username, email, role, is_active FROM users ORDER BY name ASC").all() as any[];

        // Fetch all user-store assignments
        const assignments = db.prepare("SELECT user_id, store_id FROM user_stores").all() as { user_id: number, store_id: number }[];

        // Map assignments to users
        const usersWithStores = users.map(u => {
            const userAssignments = assignments.filter(a => a.user_id === u.id).map(a => a.store_id);
            return {
                ...u,
                assigned_store_ids: userAssignments
            };
        });

        return NextResponse.json({ success: true, data: usersWithStores });
    } catch (error) {
        console.error('Fetch users error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'users:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { name, username, email, password, role, assigned_store_ids } = body;

        // Basic validation
        if (!name || !username || !email || !password || !role) {
            return NextResponse.json({ success: false, error: 'Missing required fields (name, username, email, password, role)' }, { status: 400 });
        }

        const db = getDb();

        // Check if email or username already exists
        const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
        if (existing) {
            return NextResponse.json({ success: false, error: 'User with this username or email already exists' }, { status: 400 });
        }

        const passwordHash = await hashPassword(password);

        // Enforce Single Store Restriction for non-global roles
        const globalRoles = ['admin', 'general_manager', 'marketing_manager'];
        const isGlobalRole = globalRoles.includes(role);
        if (!isGlobalRole && assigned_store_ids && assigned_store_ids.length > 1) {
            return NextResponse.json({ success: false, error: 'Localized operators and managers can only be assigned to one store.' }, { status: 400 });
        }

        // Transaction for atomicity
        const transaction = db.transaction(() => {
            // Insert user
            const result = db.prepare(`
                INSERT INTO users (name, username, email, password_hash, role, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
            `).run(name, username, email, passwordHash, role);

            const userId = result.lastInsertRowid as number;

            // Insert store assignments
            if (assigned_store_ids && Array.isArray(assigned_store_ids) && assigned_store_ids.length > 0) {
                const insertStore = db.prepare('INSERT INTO user_stores (user_id, store_id) VALUES (?, ?)');
                for (const storeId of assigned_store_ids) {
                    insertStore.run(userId, storeId);
                }
            }

            return userId;
        });

        const newUserId = transaction();

        return NextResponse.json({ success: true, data: { id: newUserId } });

    } catch (error) {
        console.error('Create user error:', error);
        return NextResponse.json({ success: false, error: 'Failed to create user' }, { status: 500 });
    }
}
